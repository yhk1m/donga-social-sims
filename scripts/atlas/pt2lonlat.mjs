// © 2026 김용현
// scripts/atlas/pt2lonlat.mjs — 지면 pt → 경위도 (Python 단계가 경위도 맞추기 결과를 쓸 때)
//   node scripts/atlas/pt2lonlat.mjs < in.json > out.json
//     in  = {"<지도 id>": [[x, y], ...], ...}
//     out = {"<지도 id>": [[lon, lat] | null, ...], ...}   (null = 되돌리기 실패, 길이는 입력과 같다)
//   node scripts/atlas/pt2lonlat.mjs --center <지도 id>   → {"center": 중심 경도}  (투영 중심 경도, 경도 펴기용)
//   node scripts/atlas/pt2lonlat.mjs --fit <지도 id>      → {"family", "params", "sim", "tps"?}  (앱이 경위도 → 지면 pt 를 직접 계산할 때 — 밀도 음영 역투영)
//   fit = $ATLAS_WORK/geo/<지도 id>.fit.json (없으면 오류로 멈춘다 — geo_util.loadFit)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';
import { loadFit } from './geo_util.mjs';

/** fits: {id: fit}, pts: {id: [[x,y]...]} → {id: [[lon,lat]|null ...]} (소수 5자리). makeConverter 를 못 만들면 모두 null. */
export function toLonLat(fits, pts) {
  const out = {};
  for (const [id, list] of Object.entries(pts)) {
    if (!fits[id]) throw new Error(`fit 없음: ${id}`);
    const conv = makeConverter(fits[id]);
    out[id] = list.map((xy) => {
      const ll = conv ? conv.invert(xy) : null;
      return ll && ll.every(Number.isFinite) ? ll.map((v) => Math.round(v * 1e5) / 1e5) : null;
    });
  }
  return out;
}

/** 투영 중심 경도(모든 도법에서 params[0]). */
export function centerLon(fit) {
  const c = fit?.params?.[0];
  if (!Number.isFinite(c)) throw new Error(`fit 에 중심 경도(params[0]) 없음: ${fit?.id}`);
  return c;
}

const TPS_KEYS = ['cx', 'cy', 's', 'pts', 'wx', 'wy', 'ax', 'ay', 'hull', 'taper'];
/** 앱(src/atlas/fitProject.js)이 쓰는 fit 부분만: 도법 이름·매개변수·닮음 변환(+ TPS 보정 계수). 통계·기준점은 뺀다. */
export function browserFit(fit) {
  if (!fit?.family || !Array.isArray(fit.params) || !fit.sim) throw new Error(`fit 에 family·params·sim 이 없음: ${fit?.id}`);
  const out = { family: fit.family, params: fit.params, sim: fit.sim };
  if (fit.tps) out.tps = Object.fromEntries(TPS_KEYS.map((k) => [k, fit.tps[k]]));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const i = process.argv.indexOf('--center'), f = process.argv.indexOf('--fit');
    if (f > 0) {
      const id = process.argv[f + 1];
      if (!id) throw new Error('--fit 다음에 지도 id 가 필요');
      process.stdout.write(JSON.stringify(browserFit(loadFit(id))));
    } else if (i > 0) {
      const id = process.argv[i + 1];
      if (!id) throw new Error('--center 다음에 지도 id 가 필요');
      process.stdout.write(JSON.stringify({ center: centerLon(loadFit(id)) }));
    } else {
      const pts = JSON.parse(fs.readFileSync(0, 'utf8'));
      const fits = Object.fromEntries(Object.keys(pts).map((id) => [id, loadFit(id)]));
      process.stdout.write(JSON.stringify(toLonLat(fits, pts)));
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
