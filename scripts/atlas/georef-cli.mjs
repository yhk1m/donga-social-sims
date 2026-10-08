// © 2026 김용현
// scripts/atlas/georef-cli.mjs — georef.mjs 를 단원 지도들에 돌리는 명령줄 도구
//   node scripts/atlas/georef-cli.mjs --all             지도마다 $ATLAS_WORK/geo/<id>.fit.json + 표
//   node scripts/atlas/georef-cli.mjs --verify <id|all> Natural Earth 해안선을 지도 렌더(150dpi) 위에 겹친 <id>.verify.png
// 기준점: python -I scripts/atlas/extract_vectors.py --controls all 이 쓴 $ATLAS_WORK/vec/<id>.controls.json
// ATLAS_WORK 기본값 C:/Users/Public/atlas-work. maps_u2.json 의 "georef": false 지도는 건너뛴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { fitWithTps, robustFit, applyFit, fitProjection, PT_MM } from './georef.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');
const ACCEPT_MM = 0.5;
const maps = JSON.parse(fs.readFileSync(path.join(here, 'maps_u2.json'), 'utf8'));
const georefOn = (m) => m.georef !== false;
const r2 = (v) => Math.round(v * 100) / 100;
const r6 = (v) => +v.toFixed(6);

function loadCps(id) {
  const f = `${WORK}/vec/${id}.controls.json`;
  if (!fs.existsSync(f)) throw new Error(`${f} 없음 — 먼저 python -I scripts/atlas/extract_vectors.py --controls all`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const cpName = (c) => c.name || `${c.lon},${c.lat}`;

function fitAll() {
  fs.mkdirSync(`${WORK}/geo`, { recursive: true });
  const rows = [];
  for (const m of maps) {
    if (!georefOn(m)) { rows.push([m.id, '(georef: false — 맞추기 없음)']); continue; }
    const { cps, dropped } = robustFit(loadCps(m.id));
    const fit = fitWithTps(cps);
    const meanMm = fit.meanPt * PT_MM;
    const out = {
      id: m.id, family: fit.family, params: fit.params.map(r6),
      sim: Object.fromEntries(Object.entries(fit.sim).map(([k, v]) => [k, +v.toPrecision(12)])),
      rmsPt: r2(fit.rmsPt), rmsMm: r2(fit.rmsPt * PT_MM), meanPt: r2(fit.meanPt), meanMm: r2(meanMm), maxPt: r2(Math.max(...fit.resid)),
      n: cps.length, src: [...new Set(cps.map((c) => c.src))],
      ...(fit.smallArea ? { smallArea: true } : {}),
      ...(fit.tps ? { tps: fit.tps, rmsTpsPt: r2(fit.rmsTpsPt), meanTpsPt: r2(fit.meanTpsPt), meanTpsMm: r2(fit.meanTpsPt * PT_MM),
        looMeanPt: r2(fit.looMeanPt), looMeanMm: r2(fit.looMeanPt * PT_MM) } : {}),
      dropped, candidates: fit.candidates.map((c) => ({ family: c.family, rmsPt: r2(c.rmsPt) })),
      resid: cps.map((c, i) => ({ name: cpName(c), residPt: r2(fit.resid[i]), ...(c.approx ? { approx: true } : {}) })),
    };
    const reasons = [];
    if (meanMm > ACCEPT_MM) reasons.push(`평균 잔차 ${meanMm.toFixed(2)}mm > ${ACCEPT_MM}mm`);
    if (cps.length && cps.every((c) => c.approx)) reasons.push('기준점을 눈으로 찍음(모든 기준점 approx)');
    if (reasons.length) { out.approx = true; out.approxReason = reasons.join('; '); }
    fs.writeFileSync(`${WORK}/geo/${m.id}.fit.json`, JSON.stringify(out, null, 1));
    rows.push([m.id, out.family, out.params.map((v) => v.toFixed(1)).join(','), out.rmsPt.toFixed(2), out.rmsMm.toFixed(2), out.meanMm.toFixed(2),
      fit.tps ? `${out.meanTpsMm.toFixed(2)} (LOO ${out.looMeanMm.toFixed(2)})` : '-', cps.length, dropped.length || '', out.approx ? `approx: ${out.approxReason}` : '']);
  }
  console.log(`합격 기준: TPS 전 평균 잔차 meanMm ≤ ${ACCEPT_MM}mm (tpsMeanMm 는 참고: TPS 후 기준점 위 평균, 괄호는 한 점 빼고 맞춘 평균)`);
  console.log(['id', 'family', 'params', 'rmsPt', 'rmsMm', 'meanMm', 'tpsMeanMm', 'n', 'drop', ''].join('\t'));
  for (const r of rows) console.log(r.join('\t'));
  return 0;
}

function verify(target) {
  const ids = target === 'all' ? maps.filter(georefOn).map((m) => m.id) : [target];
  const land = {};
  const getLand = (res) => {
    if (!land[res]) {
      const topo = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'node_modules', 'world-atlas', `land-${res}.json`), 'utf8'));
      land[res] = feature(topo, topo.objects.land);
    }
    return land[res];
  };
  for (const id of ids) {
    const m = maps.find((x) => x.id === id);
    const fit = JSON.parse(fs.readFileSync(`${WORK}/geo/${id}.fit.json`, 'utf8'));
    // 1° 가 몇 pt 인가로 해안선 해상도를 고른다(세계 지도는 50m, 나머지는 10m)
    const lat0 = fit.params.length === 2 ? fit.params[1] : 10;
    const a = applyFit(fit, [fit.params[0], lat0]), b = applyFit(fit, [fit.params[0] + 1, lat0]);
    const res = Math.hypot(a[0] - b[0], a[1] - b[1]) < 4 ? '50m' : '10m';
    const lines = []; let cur = null;
    const [x0, y0, x1, y1] = m.bbox, pad = 40;
    const ctx = {
      moveTo(x, y) { cur = [[x, y]]; lines.push(cur); }, lineTo(x, y) { cur.push([x, y]); },
      closePath() { if (cur && cur.length) cur.push(cur[0]); }, arc() {}, rect() {},
    };
    geoPath(fitProjection(fit), ctx)(getLand(res));
    const keep = lines.filter((L) => L.some(([x, y]) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad))
      .map((L) => L.map(([x, y]) => [r2(x), r2(y)]));
    const cps = loadCps(id).map((c) => { const p = applyFit(fit, [c.lon, c.lat]); return { xy: c.xy, fit: p && p.map(r2) }; });
    const ov = { page: m.page, bbox: m.bbox, dpi: 150, lines: keep, cps, out: `${WORK}/geo/${id}.verify.png`,
      title: `${id}  ${fit.family}  rms ${fit.rmsPt}pt  mean ${fit.meanMm}mm${fit.tps ? '  +TPS' : ''}  NE ${res}` };
    const ovPath = `${WORK}/geo/${id}.overlay.json`;
    fs.writeFileSync(ovPath, JSON.stringify(ov));
    const r = spawnSync(process.env.PYTHON || 'python', ['-I', path.join(here, 'overlay.py'), ovPath], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr); return 1; }
    process.stdout.write(r.stdout);
  }
  return 0;
}

const argv = process.argv.slice(2);
let code;
if (argv[0] === '--all') code = fitAll();
else if (argv[0] === '--verify' && argv[1]) code = verify(argv[1]);
else { console.log('사용법: node scripts/atlas/georef-cli.mjs --all | --verify <id|all>'); code = 2; }
process.exit(code);
