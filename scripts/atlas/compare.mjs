// © 2026 김용현
// scripts/atlas/compare.mjs — 교과서 대조표: 단원 작업 폴더의 <out> (로컬 검토용, 공개하지 않음 — u2 = $ATLAS_WORK/compare-u2.html)
//   node scripts/atlas/compare.mjs [--unit uN]   (캡처는 먼저 node scripts/atlas/compare_shots.mjs [--unit uN])
//   단원 고유 값(색칠하기 글자 파일·확대 창 레이어·화면 기호 없는 레이어·도법/중심 확인·대표 지도·알려진 차이 설명)은
//   단원 설정 옆 <uN>.compare.json 의 checks·notes(단원 설정은 생성물 도장 때문에 얼려 둠 — 2단계 설계 §4.2).
//   행 = 주제마다 「주제 확인(사진·그래프·핀·출처·글)」 + 지도(묶음·바로가기)마다 「교과서 쪽 | 웹 캡처 | 확인 항목」.
//   웹 값 = 생성물(단원 dataDir, u2 = sims/atlas-u2-asia/data: topics·charts·layer-*·overlay·places·inset) + 캡처 때 화면에서 센 값(manifest.json stats).
//   교과서 값 = 파이프라인 원본: 지도 목록(u2 = maps_u2.json — 제목·영역), $ATLAS_WORK/vec/<map>.features.json(범례·기호·선 추출),
//     text/places-<map>.json·색칠하기 글자(checks.coloringLabels)(지면 지명), 설정 content.charts(그래프 추출), content.photos(사진 추출),
//     설정 content.expect·expectCredits, 그리고 PDF 글자(pdfkit — 쪽 전체 글·인쇄 출처·범례 상자 글).
//   상태: 같음 / 다름(빨강) / 알려진 차이(노랑 — 결정 기록에 있는 의도된 차이, 까닭을 적음) / 참고(교과서 값이 없음).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveUnit } from './unit.mjs';
import { knownMatch } from './compare_known.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WORK = process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work';
const UNIT = resolveUnit();
const CMP_FILE = UNIT.configPath.replace(/\.json$/, '.compare.json');
const CMP = existsSync(CMP_FILE) ? JSON.parse(readFileSync(CMP_FILE, 'utf8')) : {};
const CHECKS = { insetLayers: [], noScreenSymbols: [], centerChecks: [], mainMap: {}, known: [], teacher: [], ...CMP.checks };
const NOTES = {
  recolored: '웹 바탕 위에서 너무 옅어 명도만 낮춤(설정 legendColors)', noVecLegend: '추출 산출물 없음 — 범례는 지면 범례 상자 글과 대조',
  mapLabelToLegend: '교과서의 지도 위 이름을 범례로', movedPlaces: '지면 위치에서 옮긴 지명(설정 places.relocate)',
  viewProjection: '로빈슨(기본)', viewProjectionNote: '웹은 세계 도법 5종만', ...CMP.notes,
};
const SHOTS_REL = CMP.shotsDir || 'shots/compare';           // 대조표 HTML 에서 캡처를 가리키는 상대 경로(작업 폴더 기준)
const OUT = UNIT.workFile(CMP.out || 'compare.html');
const SHOTS = UNIT.workFile(SHOTS_REL);
const DATA = UNIT.dataDir;
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const PAGE_W = 779.53, PAGE_H = 722.84; // 쪽 크기(pt) — 쪽 jpg 1191×1105 = 110dpi

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const tryJson = (p) => (existsSync(p) ? readJson(p) : null);
const cfg = UNIT.config;
const maps = readJson(UNIT.mapsPath);
const mapById = Object.fromEntries(maps.map((m) => [m.id, m]));
const topics = readJson(join(DATA, 'topics.json'));
const charts = readJson(join(DATA, 'charts.json'));
const places = readJson(join(DATA, 'places.json'));
const photosTb = readJson(join(ROOT, cfg.content.photos));
const chartsTb = readJson(join(WORK, cfg.content.charts));
const coloringLabelsFile = CHECKS.coloringLabels || cfg.content.labels;     // 색칠하기 지면 글자(u2 = 17쪽, 작업 폴더 기준)
const coloringTb = coloringLabelsFile && existsSync(join(WORK, coloringLabelsFile)) ? readJson(join(WORK, coloringLabelsFile)) : null;
const manifest = tryJson(join(SHOTS, 'manifest.json')) || { shots: [] };
const OVERRIDES = readJson(join(ROOT, cfg.content.overrides)).items;
const layerFile = (ref) => tryJson(join(DATA, `${ref}.json`));
const vecOf = (mapId) => tryJson(join(WORK, 'vec', `${mapId}.features.json`));

// ---------- 교과서 글자(PDF) ----------
function textbookText() {
  const py = `
import sys, json
sys.path.insert(0, sys.argv[1])
import pdfkit, extract_text
maps = json.load(open(sys.argv[2], encoding='utf-8'))
out = {}
for p in range(int(sys.argv[3]), int(sys.argv[4]) + 1):
    out[p] = {'all': ' '.join(s['text'] for s in pdfkit.page_spans(p)), 'credits': extract_text.printed_credits(p), 'legend': {}}
for m in maps:
    if m.get('legendBbox'): out[m['page']]['legend'][m['id']] = pdfkit.box_text(m['page'], m['legendBbox'])
sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
`;
  const pr = cfg.content.pages || UNIT.pages;
  if (!pr) throw new Error(`${UNIT.id}: 쪽 범위 없음 — 단원 설정 content.pages 나 units.json pages 를 적으세요`);
  const [p0, p1] = pr;
  const r = spawnSync(PY, ['-I', '-c', py, join(ROOT, 'scripts/atlas'), UNIT.mapsPath, String(p0), String(p1)], { encoding: 'utf8', maxBuffer: 1 << 26, env: UNIT.childEnv() });
  if (r.status !== 0) throw new Error(`PDF 글자 읽기 실패: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const TB = textbookText();
const squash = (s) => (s || '').normalize('NFC').replace(/\s+/g, '');
const pageHay = Object.fromEntries(Object.entries(TB).map(([p, v]) => [p, squash(v.all)]));
/** 글이 쪽 글자에 들어 있는 비율(6글자 조각 기준 — 글상자 순서가 달라도 견딤). */
function coverage(text, page) {
  const t = squash(text), hay = pageHay[page] || '';
  if (!t) return 1;
  if (t.length <= 6) return hay.includes(t) ? 1 : 0;
  let hit = 0, n = 0;
  for (let i = 0; i + 6 <= t.length; i++) { n++; if (hay.includes(t.slice(i, i + 6))) hit++; }
  return hit / n;
}

/** 펼침면(16-17, 18-19, …): 물음·학습 목표는 펼침면 한쪽에만 인쇄되고 두 주제가 함께 쓴다. */
const spread = (pages) => [...new Set(pages.flatMap((p) => (p % 2 ? [p - 1, p] : [p, p + 1])))];

// ---------- 확인 항목 ----------
const OK = 'ok', DIFF = 'diff', KNOWN = 'known', INFO = 'info';
const check = (item, tb, web, status, note = '') => ({ item, tb, web, status, note });
const eq = (item, tb, web, note = '') => check(item, tb, web, tb === web ? OK : DIFF, note);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (s, n = 34) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s; };
const list = (a, n = 12) => (a.length > n ? `${a.slice(0, n).join(', ')} 외 ${a.length - n}` : a.join(', '));

const shotsOf = (pred) => manifest.shots.filter(pred);
const groupsOf = (topic) => {
  const gs = [];
  for (const ref of topic.layers || []) {
    const label = ref.label || ref.ref;
    const g = gs.find((x) => x.label === label);
    if (g) g.refs.push(ref); else gs.push({ label, refs: [ref] });
  }
  return gs;
};
const mapOfRef = (ref) => layerFile(ref)?.properties?.map || layerFile(ref)?.fitId || null;
const creditFound = (c, page) => (TB[page]?.credits || []).some((x) => squash(c).includes(squash(x)) || squash(x).includes(squash(c).replace(/^\*[^(]*/, '')));

// 지도 하나(묶음의 레이어 또는 바로가기 지도)의 확인 항목
function mapChecks(mapId, refs, shot, topicId) {
  const m = mapById[mapId];
  const out = [];
  const page = m.page;
  const st = shot?.stats || {};
  for (const r of refs) {
    const L = layerFile(r.ref);
    const isOverlay = r.type === 'image';
    const cc = !isOverlay && L.type === 'countryClass'; // 나라 단위 분류(2단계 U3-3a) — 범례·분류가 properties 밖
    const legend = isOverlay || cc ? L.legend : L.properties.legend;
    const vec = vecOf(r.ref.replace(/^(layer|overlay)-/, ''));
    const tag = refs.length > 1 ? `[${r.ref.replace(/^(layer|overlay)-/, '')}] ` : '';
    if (vec) {
      const rep = vec.report || {};
      out.push(eq(`${tag}범례 분류 수`, vec.legend.length, legend.length));
      const labelDiff = vec.legend.filter((e) => !legend.some((w) => w.cls === e.cls && w.label === e.label)).map((e) => `${e.label}`);
      // 설정 legendColors 로 화면 색만 바꾼 분류(printColor = 인쇄 색)는 「알려진 차이」로 따로
      const same = (a, b) => a.toLowerCase() === b.toLowerCase();
      const webOf = (e) => legend.find((x) => x.cls === e.cls);
      const recolored = vec.legend.filter((e) => { const w = webOf(e); return w && !same(w.color, e.color) && w.printColor && same(w.printColor, e.color); });
      const colorDiff = vec.legend.filter((e) => { const w = webOf(e); return w && !same(w.color, e.color) && !recolored.includes(e); }).map((e) => `${e.label} ${e.color}→${webOf(e).color}`);
      out.push(check(`${tag}범례 글자`, '추출 그대로', labelDiff.length ? `다름: ${list(labelDiff)}` : '모두 같음', labelDiff.length ? DIFF : OK));
      out.push(check(`${tag}범례 색`, '추출 그대로', colorDiff.length ? list(colorDiff) : recolored.length ? '나머지 모두 같음' : '모두 같음', colorDiff.length ? DIFF : OK));
      if (recolored.length) out.push(check(`${tag}범례 색(화면용으로 바꿈)`, list(recolored.map((e) => `${e.label} ${e.color}`)), list(recolored.map((e) => `${webOf(e).color}`)), KNOWN, NOTES.recolored));
      const present = legend.filter((e) => e.present !== false).length;
      const tbPresent = rep.outputClasses ?? (vec.legend.length - (rep.absent || []).length);
      out.push(eq(`${tag}지도에 있는 분류`, tbPresent, present, (rep.absent || []).length ? `교과서 추출에서 빠진 분류: ${rep.absent.join(', ')}` : ''));
      if (vec.symbols.length) {
        const n = L.features.filter((f) => f.properties ? f.properties.type === 'symbol' : f.type === 'symbol').length;
        out.push(eq(`${tag}기호 수(자료)`, vec.symbols.length, n));
        const inset = CHECKS.insetLayers.includes(r.ref);
        const screen = inset ? st.insetSymbols : (CHECKS.noScreenSymbols.includes(r.ref) ? null : st.symbols);
        if (screen != null) out.push(eq(`${tag}기호 수(화면${inset ? ' — 확대 창' : ''})`, vec.symbols.length, screen));
      }
      if (vec.lines.length) {
        const kinds = {};
        for (const f of L.features) { const t = f.properties?.type ?? f.type; if (t !== 'area' && t !== 'symbol') kinds[t] = (kinds[t] || 0) + 1; }
        const web = Object.values(kinds).reduce((a, b) => a + b, 0);
        const isIso = r.ref.includes('jan') || r.ref.includes('jul');
        out.push(check(`${tag}선 수${isIso ? '(등온선 조각)' : '(흐름선)'}`, vec.lines.length, `${web} (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')})`,
          web === vec.lines.length ? OK : (isIso ? INFO : DIFF), isIso ? '등온선은 같은 값 조각을 이어 붙이므로 개수가 줄 수 있음' : ''));
        if (!isIso && st.flows != null) out.push(eq(`${tag}흐름선(화면)`, vec.lines.length, st.flows));
      }
    } else if (legend) {
      // 추출 산출물이 없는 지도(카슈미르 = 실제 경계 자료, 밀도 = 래스터): 범례 글자를 지면 범례 상자 글과 대조
      const box = squash(TB[page]?.legend?.[mapId] || TB[page]?.all);
      const miss = legend.filter((e) => !box.includes(squash(e.label)));
      const onMap = miss.filter((e) => pageHay[page].includes(squash(e.label))).map((e) => e.label); // 지면에서는 지도 위 글자
      const absent = miss.filter((e) => !pageHay[page].includes(squash(e.label))).map((e) => e.label);
      out.push(check(`${tag}범례 분류 수`, '추출 없음', legend.length, INFO, isOverlay ? '래스터 음영 — 범례는 C3 에서 지면 색을 읽음' : NOTES.noVecLegend));
      out.push(check(`${tag}범례 글자 ↔ 지면 범례`, '범례 상자 글', absent.length ? `지면에 없는 글자: ${list(absent)}` : '모두 지면에 있음', absent.length ? DIFF : OK,
        absent.length ? `지면 범례 상자: 「${short(TB[page]?.legend?.[mapId], 140)}」` : ''));
      if (onMap.length) out.push(check(`${tag}지도 위 글자 → 범례`, '지도 위에 쓴 이름', `범례 항목으로: ${list(onMap)}`, KNOWN, NOTES.mapLabelToLegend));
    }
    if (cc) {
      const per = {};
      for (const v of Object.values(L.classes || {})) for (const k of [v].flat()) per[k] = (per[k] || 0) + 1;
      const name = (k) => legend.find((e) => e.cls === k)?.label || k;
      out.push(check(`${tag}나라 단위 분류`, '지면 색 표본(나라마다)', `${Object.keys(L.classes || {}).length}개 나라 — ${legend.filter((e) => per[e.cls]).map((e) => `${e.label} ${per[e.cls]}`).join(', ')}`, INFO,
        '나라마다 안쪽 표본점의 지면 색을 범례색과 대조(다수결)'));
      const fmt = (v) => (v == null ? '없음' : [v].flat().map(name).join('+'));
      const ovs = L.overrides || [];
      const changed = ovs.filter((o) => JSON.stringify(o.was ?? null) !== JSON.stringify(o.cls ?? null));
      if (changed.length) out.push(check(`${tag}분류를 고친 나라`, `표본 분류 ${changed.length}`, list(changed.map((o) => `${o.iso} ${fmt(o.was)}→${fmt(o.cls)}`), 20), KNOWN, '설정 countryOverrides(까닭은 항목마다 — 교사 확인 항목 참고)'));
      const confirmed = ovs.length - changed.length;
      if (confirmed) out.push(check(`${tag}분류를 확인한 나라`, `${confirmed}개`, list(ovs.filter((o) => !changed.includes(o)).map((o) => `${o.iso} ${fmt(o.cls)}`), 20), INFO, '작은 나라·10a 에만 있는 나라를 확대해 하나씩 봄(값은 표본과 같음)'));
    }
    if (!isOverlay && L.type === 'chartSymbols') { // 지도 위 고리 기호(u4) — 교과서 수 = 단원 설정 레이어 items(지면 고리 가운데 자리)
      const tbN = cfg.layers?.[r.ref.replace(/^layer-/, '')]?.items?.length ?? '설정 없음';
      out.push(eq(`${tag}지도 위 그래프 기호 수`, tbN, (L.items || []).length));
      const noChart = (L.items || []).filter((it) => !charts[it.chart]).map((it) => it.chart);
      out.push(check(`${tag}기호 그래프 자료`, '그래프마다 자료', noChart.length ? `없음: ${list(noChart)}` : '모두 있음(누르면 카드 그래프)', noChart.length ? DIFF : OK));
    }
    if (r.legendTitle) {
      const c = coverage(r.legendTitle, page), ov = OVERRIDES[`${topicId}.layers.${r.ref}.legendTitle`];
      out.push(check(`${tag}범례 제목`, ov ? ov.from : short(r.legendTitle, 40), c >= 0.99 ? '지면과 같음' : `${r.legendTitle}${ov ? '' : ` (지면과 ${Math.round(c * 100)}%)`}`, c >= 0.99 ? OK : ov ? KNOWN : DIFF, ov ? `사람이 고침: ${ov.why}` : ''));
    }
    if (r.credit) {
      const found = creditFound(r.credit, page);
      const onScreen = (st.credits || []).some((c) => squash(c) === squash(r.credit));
      out.push(check(`${tag}출처`, found ? '지면에 인쇄됨' : '지면 인쇄 출처에 없음', `${short(r.credit, 44)}${shot ? (onScreen ? ' · 화면 출처 줄에 있음' : ' · 화면 출처 줄에 없음') : ''}`, found && (onScreen || !shot) ? OK : DIFF));
    }
    if (r.note) out.push(check(`${tag}지도 주석`, coverage(r.note, page) >= 0.99 ? '지면에 있음' : '지면에 없음', short(r.note, 44), coverage(r.note, page) >= 0.99 ? OK : INFO));
    if ((isOverlay ? false : L.properties.approx)) out.push(check(`${tag}위치`, '교과서 지면 맞춤', '위치 근사(approx) 표시', KNOWN, L.properties.approxReason || 'fit 이 approx'));
  }
  return out;
}

function placeChecks(mapId, shot) {
  const out = [];
  const src = tryJson(join(WORK, 'text', `places-${mapId}.json`));
  if (!src) return out;
  const names = new Set(places.map((p) => squash(p.name)));
  const tbNames = [...new Set(src.labels.map((l) => squash(l.name)))];
  const missing = tbNames.filter((n) => !names.has(n));
  const moved = places.filter((p) => p.page === mapById[mapId].page && p.moved).map((p) => p.name);
  out.push(check('지면 지명(이름 종류)', tbNames.length, `${tbNames.length - missing.length} 있음${missing.length ? ` · 없음 ${missing.length}: ${list(missing, 15)}` : ''}`, missing.length ? DIFF : OK));
  out.push(check('이 지도가 위치를 준 지명', `지면 글자 ${src.labels.length}개`, `${places.filter((p) => p.page === mapById[mapId].page).length}개(같은 이름은 여러 지도에서 하나로 합침)`, INFO));
  if (moved.length) out.push(check('옮긴 지명', '지면 위치', list(moved), KNOWN, NOTES.movedPlaces));
  if (shot?.stats?.labels != null) {
    const onScreen = new Set((shot.stats.labelNames || []).map(squash));
    const vis = tbNames.filter((n) => onScreen.has(n)).length;
    out.push(check('화면에 놓인 지명', `지면 ${tbNames.length}`, `${shot.stats.labels}개(그중 이 쪽 지명 ${vis}) — k ${shot.stats.k?.toFixed(1)}`, INFO, '축척(k)에 따라 등급으로 거름 — 확대하면 더 나옴'));
  }
  return out;
}

// 주제가 쓰는 그래프: 그래프 블록·카드·핀 + 지도 위 고리 기호(u4 chartSymbols — 누르면 카드, build_content 의 참조 셈과 같음)
function topicChartRefs(t) {
  const refs = new Set();
  for (const b of t.blocks || []) { if (b.type === 'chart') refs.add(b.ref); if (b.chart) refs.add(b.chart); for (const c of b.charts || []) refs.add(c); }
  for (const m of t.markers || []) if (m.chart) refs.add(m.chart);
  for (const r of t.layers || []) { const L = layerFile(r.ref); if (L?.type === 'chartSymbols') for (const it of L.items || []) if (it.chart) refs.add(it.chart); }
  return refs;
}
const topicBlob = (t) => squash(JSON.stringify(t) + JSON.stringify([...topicChartRefs(t)].map((id) => charts[id])));
const topicRefsExcept = (id) => new Set(topics.filter((x) => x.id !== id).flatMap((x) => [...topicChartRefs(x)]));
// 주제 전체 확인: 핀·사진·그래프·출처·글
function topicChecks(t) {
  const out = [];
  const pages = t.pages || [];
  const firstShot = shotsOf((s) => s.topic === t.id && s.proj === 'robinson')[0];
  const st = firstShot?.stats || {};
  // 핀
  const pinMarkers = (t.markers || []).filter((m) => m.lonlat);
  const expMarkers = cfg.content.expect.markers[t.id] ?? cfg.content.expect.chartMarkers[t.id];
  const tbPins = photosTb.filter((p) => p.topic === t.id && p.pin != null && p.map).length;
  if (pinMarkers.length || tbPins) {
    out.push(check('지도 핀(번호 사진)', `${tbPins}${expMarkers != null ? ` (설정 기대 ${expMarkers})` : ''}`, `${pinMarkers.length} · 화면 핀 ${st.pins ?? '-'}`, tbPins === pinMarkers.length && (st.pins == null || st.pins === pinMarkers.length) ? OK : DIFF));
  }
  // 사진
  const used = new Set();
  for (const m of t.markers || []) if (m.photo) used.add(m.photo.id);
  for (const b of t.blocks || []) if (b.photo) used.add(b.photo.id);
  const tbPhotos = photosTb.filter((p) => p.topic === t.id);
  const missPhotos = tbPhotos.filter((p) => !used.has(p.id)).map((p) => `${p.id} ${p.title || ''}`);
  if (tbPhotos.length || used.size) out.push(check('사진 수', tbPhotos.length, `${used.size}${missPhotos.length ? ` · 빠짐: ${list(missPhotos)}` : ''}`, missPhotos.length || tbPhotos.length !== used.size ? DIFF : OK));
  const titleDiff = tbPhotos.filter((p) => {
    const m = (t.markers || []).find((x) => x.photo?.id === p.id) || (t.blocks || []).find((x) => x.photo?.id === p.id);
    return m && p.title && m.title && squash(m.title) !== squash(p.title);
  }).map((p) => p.title);
  if (tbPhotos.length) out.push(check('사진 제목', '사진 추출 제목', titleDiff.length ? `다름: ${list(titleDiff)}` : '모두 같음', titleDiff.length ? DIFF : OK));
  // 그래프
  const refs = topicChartRefs(t);
  // 같은 쪽을 나눠 쓰는 주제(u4 38쪽 문화·잠재력, 39쪽 협력·지속가능): 다른 주제만 쓰는 그래프는 이 주제 몫에서 뺌(u2·u3 는 그런 그래프가 없어 그대로)
  const otherRefs = topicRefsExcept(t.id);
  const tbCharts = Object.entries(chartsTb).filter(([id, c]) => pages.includes(c.page) && (refs.has(id) || !otherRefs.has(id))).map(([id]) => id);
  const missCharts = tbCharts.filter((id) => !refs.has(id));
  if (tbCharts.length || refs.size) {
    out.push(check('그래프 수', tbCharts.length, `${refs.size}${missCharts.length ? ` · 빠짐: ${list(missCharts)}` : ''} · 사이드바 ${st.charts ?? '-'}`, missCharts.length || tbCharts.length !== refs.size ? DIFF : OK, '기후 그래프는 핀 카드 안, 일부는 카드(겹침 창) 안이라 사이드바 수와 다를 수 있음'));
    const tDiff = [...refs].filter((id) => chartsTb[id] && charts[id] && (chartsTb[id].title !== charts[id].title || chartsTb[id].source !== charts[id].source));
    out.push(check('그래프 제목·출처', '그래프 추출', tDiff.length ? `다름: ${list(tDiff)}` : '모두 같음', tDiff.length ? DIFF : OK));
    const notOnPage = [...refs].filter((id) => charts[id] && coverage(charts[id].title, charts[id].page) < 0.99).map((id) => `${id}「${charts[id].title}」`);
    out.push(check('그래프 제목 ↔ 지면', '지면 글', notOnPage.length ? `지면과 다름: ${list(notOnPage)}` : '모두 지면에 있음', notOnPage.length ? DIFF : OK));
  }
  // 출처(설정 expectCredits — 이 주제 쪽에 인쇄된 출처가 생성물 어딘가에)
  const blob = topicBlob(t);
  const exp = pages.flatMap((p) => cfg.content.expectCredits[p] || []);
  if (exp.length) {
    const miss0 = exp.filter((c) => !blob.includes(squash(c)));
    // 같은 쪽을 나눠 쓰는 주제(u4 38·39쪽)가 가진 출처는 그 주제 몫(u2·u3 는 빠진 출처가 없어 그대로)
    const others = topics.filter((x) => x.id !== t.id && (x.pages || []).some((p) => pages.includes(p))).map(topicBlob);
    const elsewhere = miss0.filter((c) => others.some((b) => b.includes(squash(c))));
    const miss = miss0.filter((c) => !elsewhere.includes(c));
    const okText = elsewhere.length ? `${exp.length - elsewhere.length}개 모두 있음 · 같은 쪽 다른 주제 ${elsewhere.length}: ${list(elsewhere)}` : `${exp.length}개 모두 있음`;
    out.push(check('인쇄 출처', `${exp.length}개`, miss.length ? `생성물에 없음: ${list(miss)}` : okText, miss.length ? DIFF : OK));
  }
  // 글 일치: 글 블록·핀·카드·사진 설명이 지면 글에 들어 있는가
  const texts = [];
  const push = (where, s) => { if (s && typeof s === 'string') texts.push([where, s]); };
  for (const b of t.blocks || []) { push(`블록 ${b.id}`, b.text); push(`블록 ${b.id} 제목`, b.title); push(`블록 ${b.id} 주석`, b.note); }
  for (const m of t.markers || []) { push(`핀 ${m.id}`, m.text); push(`핀 ${m.id} 제목`, m.title); }
  const overridden = new Set(Object.keys(cfg.content ? readJson(join(ROOT, cfg.content.overrides)).items : {}).filter((k) => k.startsWith(`${t.id}.`)));
  const low = [];
  for (const [where, s] of texts) {
    const c = Math.max(...spread(pages).map((p) => coverage(s, p)));
    if (c < 0.97) low.push(`${where}「${short(s, 22)}」 ${Math.round(c * 100)}%`);
  }
  out.push(check('글 일치(본문·제목·설명, 펼침면)', `${texts.length}개`, low.length ? `지면과 다름 ${low.length}: ${list(low, 8)}` : `${texts.length}개 모두 지면 글과 같음`, low.length ? DIFF : OK,
    overridden.size ? `사람이 고친 값(overrides): ${[...overridden].join(', ')}` : ''));
  // 색칠하기: 나라 수
  if (t.quiz?.type === 'coloring' && coloringTb) {
    out.push(eq('색칠하기 나라 수', coloringTb.countries.length, t.quiz.countries.length));
    const from = {}; for (const c of t.quiz.countries) from[c.capitalFrom] = (from[c.capitalFrom] || 0) + 1;
    out.push(check('수도', `지면 작은 수도 글자 ${coloringTb.capitals.length}`, `${t.quiz.countries.filter((c) => c.capital).length}개 나라 모두(지면 글자 ${from.printed || 0} + 일반도 지명 ${from.places || 0})`,
      (from.printed || 0) === coloringTb.capitals.length ? INFO : DIFF, `${cfg.content.coloring?.page}쪽에 수도 글자가 없는 나라(큰 나라)는 일반도 지명에서 가져옴`));
  }
  if (t.quiz?.type === 'heritage') out.push(eq('세계유산 문제(핀)', cfg.content.expect.markers.heritage, (t.markers || []).filter((m) => m.quiz).length || (t.markers || []).length));
  return out;
}

// ---------- 행 만들기 ----------
const rows = [];
const mapOfView = (v) => v.map;
const MAIN_MAP = CHECKS.mainMap;
for (const t of topics) {
  const extra = shotsOf((s) => s.topic === t.id && s.kind === 'extra' && !s.group);
  rows.push({ kind: 'topic', topic: t, checks: topicChecks(t), shots: extra });
  const groups = groupsOf(t);
  if (groups.length) {
    for (const [i, g] of groups.entries()) {
      const own = mapOfRef(g.refs[0].ref);
      const shots = shotsOf((s) => s.topic === t.id && (s.groupIndex === i && s.kind !== 'topic'));
      const main = shots.find((s) => s.proj === 'robinson' && s.kind === 'group');
      if (!own) {
        // 쪽 지도가 없는 레이어(u4 미확정 국경 — Natural Earth·바탕 지도 자료)만 든 묶음: 주제 대표 지도(checks.mainMap) 위에 덧그린 것으로 보고
        // 바로가기 행처럼 지명·도법 확인 + 레이어 확인(u2·u3 에는 이런 묶음이 없어 그대로)
        const mapId = MAIN_MAP[t.id];
        const m = mapById[mapId];
        if (!m) throw new Error(`${t.id}: 묶음 「${g.label}」의 레이어에 지도가 없음 — checks.mainMap 에 주제 대표 지도를 적으세요`);
        const checks = [check('지도', `${m.title} (${m.page}쪽)`, `${t.title} · 레이어 「${g.label}」를 덧그림`, INFO)];
        checks.push(...placeChecks(mapId, main), ...mapChecks(mapId, g.refs, main, t.id));
        if (m.projection) checks.push(check('도법', m.projection, NOTES.viewProjection, KNOWN, NOTES.viewProjectionNote));
        if (m.scale) checks.push(check('축척', m.scale, '축척 막대(확대에 따라 바뀜)', INFO));
        rows.push({ kind: 'map', topic: t, title: `${t.title} · ${g.label}`, mapId, shots, checks });
        continue;
      }
      const mapId = own;
      const checks = [check('지도 제목', mapById[mapId].title, g.label, squash(mapById[mapId].title) === squash(g.label) ? OK : DIFF)];
      const cov = coverage(g.label, mapById[mapId].page);
      checks.push(check('지도 제목 ↔ 지면', '지면 글', cov >= 0.99 ? '지면에 있음' : `지면에 없음(${Math.round(cov * 100)}%)`, cov >= 0.99 ? OK : INFO, cov >= 0.99 ? '' : '교과서 활동 지도는 제목이 따로 인쇄되지 않음 — 목록 제목'));
      checks.push(...mapChecks(mapId, g.refs, main, t.id));
      if (mapById[mapId].projection) checks.push(check('도법', mapById[mapId].projection, '로빈슨(기본) · 도구에서 바꿈', KNOWN, '웹은 세계 도법 5종만'));
      for (const c of CHECKS.centerChecks) if (g.refs.some((r) => r.ref === c.ref)) checks.push(check('도법·중심', c.tb, c.web, OK));
      rows.push({ kind: 'map', topic: t, title: g.label, mapId, shots, checks });
    }
  } else {
    const views = t.views?.length ? t.views.map((v, i) => ({ id: i ? v.id : null, label: v.label, map: mapOfView(v) })) : [{ id: null, label: t.title, map: MAIN_MAP[t.id] }];
    for (const v of views) {
      const shots = shotsOf((s) => s.topic === t.id && s.kind !== 'extra' && (s.view || null) === v.id);
      const main = shots.find((s) => s.proj === 'robinson');
      const m = mapById[v.map];
      const checks = [check('지도', `${m.title} (${m.page}쪽)`, v.label, INFO)];
      checks.push(...placeChecks(v.map, main));
      if (m.projection) checks.push(check('도법', m.projection, NOTES.viewProjection, KNOWN, NOTES.viewProjectionNote));
      if (m.scale) checks.push(check('축척', m.scale, '축척 막대(확대에 따라 바뀜)', INFO));
      rows.push({ kind: 'map', topic: t, title: v.label, mapId: v.map, shots, checks });
    }
  }
}

// 단원 설정 checks.known: 자동 확인의 「다름」 중 결정 기록에 까닭이 있는 것 → 「알려진 차이」. 주제·항목 이름에 더해 교과서 값(tb)·
// 웹 글 조각(webIncludes)·글 일치율(pct, U4-10)이 맞을 때만 바꾼다(값이 달라지면 다시 「다름」으로 보이게 — compare_known.mjs).
for (const k of CHECKS.known) {
  const cands = rows.filter((r) => r.topic.id === k.topic && (k.map == null || r.mapId === k.map)).flatMap((r) => r.checks).map((c) => ({ c, m: knownMatch(c, k) }));
  const hits = cands.filter((x) => x.m.hit).map((x) => x.c);
  for (const x of cands.filter((y) => y.m.pctMismatch)) console.log(`  (알림) pct 다름: ${k.topic} / ${k.item} — 고정 ${k.pct}, 지금 ${x.m.pctNow ?? '없음'}`);
  if (!hits.length && !cands.some((y) => y.m.pctMismatch)) console.log(`  (알림) checks.known 이 맞는 「다름」 없음: ${k.topic} / ${k.item}`);
  for (const c of hits) { c.status = KNOWN; c.note = [c.note, k.note].filter(Boolean).join(' · '); }
}
// 단원 설정 checks.teacher: 교사가 확인할 결정(결정 기록의 「교사 확인 항목」) — 해당 행(map 이 있으면 그 지도 행, 없으면 주제 확인 행)에
// 「알려진 차이」·「참고」 줄로 넣고, 머리에 쪽별 목록을 둔다.
const teacher = [];
for (const it of CHECKS.teacher) {
  const row = rows.find((r) => r.topic.id === it.topic && (it.map ? r.mapId === it.map && r.kind === 'map' : r.kind === 'topic'));
  if (!row) throw new Error(`checks.teacher: 행 없음 ${it.topic}${it.map ? ` / ${it.map}` : ''} — ${it.item}`);
  const c = check(`교사 확인 · ${it.item}`, it.tb ?? '', it.web ?? '', it.status === 'info' ? INFO : KNOWN, it.note || '');
  c.teacher = true;
  row.checks.push(c);
  teacher.push({ ...it, row });
}

// ---------- HTML ----------
const fileUrl = (p) => pathToFileURL(p).href;
const pageImg = (page) => fileUrl(join(ROOT, `${cfg.content.pageDir}/p${String(page).padStart(3, '0')}.jpg`));
function cropBox(mapId) {
  const m = mapById[mapId];
  let [x0, y0, x1, y1] = m.bbox;
  for (const b of [m.legendBbox, m.insetBbox, m.locatorBbox]) if (b) { x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const pad = 14;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad - 10); x1 = Math.min(PAGE_W, x1 + pad); y1 = Math.min(PAGE_H, y1 + pad);
  return [x0, y0, x1, y1];
}
function cropDiv(mapId) {
  const m = mapById[mapId];
  const [x0, y0, x1, y1] = cropBox(mapId);
  const w = x1 - x0, h = y1 - y0;
  const full = w > PAGE_W - 1 && h > PAGE_H - 1;
  const bs = `${(PAGE_W / w) * 100}% auto`;
  const bp = `${full ? 0 : (x0 / (PAGE_W - w || 1)) * 100}% ${full ? 0 : (y0 / (PAGE_H - h || 1)) * 100}%`;
  const hl = [x0 / PAGE_W, y0 / PAGE_H, w / PAGE_W, h / PAGE_H].map((v) => +(v * 100).toFixed(2));
  return `<button class="crop" style="aspect-ratio:${w.toFixed(1)}/${h.toFixed(1)};background-image:url('${pageImg(m.page)}');background-size:${bs};background-position:${bp}"
    data-full="${pageImg(m.page)}" data-hl="${hl.join(',')}" data-cap="교과서 ${m.page}쪽 — ${esc(m.title)}" aria-label="교과서 ${m.page}쪽 크게 보기"></button>
    <p class="cap">${m.page}쪽 · ${esc(m.title)}</p>`;
}
const shotImg = (s) => `<figure class="shot"><button class="thumb" data-full="${esc(`${SHOTS_REL}/${s.name}.png`)}" data-cap="${esc(`${s.name} — ${s.proj}${s.note ? ` · ${s.note}` : ''}`)}" aria-label="${esc(s.name)} 크게 보기"><img loading="lazy" src="${esc(SHOTS_REL)}/${esc(s.name)}.png" alt=""></button>
  <figcaption>${esc(s.proj === 'robinson' ? '로빈슨' : s.proj === 'equalEarth' ? '이퀄어스' : s.proj === 'miller' ? '밀러' : s.proj)}${s.note ? ` · ${esc(s.note)}` : ''}</figcaption></figure>`;
const LABEL = { ok: '같음', diff: '다름', known: '알려진 차이', info: '참고' };
const table = (checks) => `<table class="ck"><thead><tr><th>확인 항목</th><th>교과서</th><th>웹</th><th>상태</th></tr></thead><tbody>
${checks.map((c) => `<tr class="st-${c.status}"><td>${esc(c.item)}</td><td>${esc(c.tb)}</td><td>${esc(c.web)}${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</td><td><span class="badge b-${c.status}">${LABEL[c.status]}</span></td></tr>`).join('\n')}
</tbody></table>`;

const all = rows.flatMap((r) => r.checks);
const count = (s) => all.filter((c) => c.status === s).length;
const diffs = rows.flatMap((r) => r.checks.filter((c) => c.status === DIFF).map((c) => ({ r, c })));
const UNIT_TITLE = UNIT.title.replace('. ', ' '); // 「Ⅱ. 아시아」 → 「Ⅱ 아시아」
let html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>교과서 대조표 ${esc(UNIT_TITLE)}</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--mute:#6b6b70;--line:#e3e1dc;--ok:#1f7a4d;--okbg:#e6f4ec;--diff:#b3261e;--diffbg:#fdeceb;--known:#8a5a00;--knownbg:#fff4d6;--info:#4a5560;--infobg:#eef1f4;--acc:#1f5fbf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Pretendard","Malgun Gothic",system-ui,sans-serif}
header{padding:24px 28px 12px;max-width:1500px;margin:0 auto}h1{font-size:22px;margin:0 0 6px}header p{margin:4px 0;color:var(--mute)}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.sum span{padding:4px 10px;border-radius:999px;font-weight:600;font-size:13px}
.tools{display:flex;gap:8px;align-items:center;margin:10px 0}.tools button{font:inherit;padding:6px 12px;border:1px solid var(--line);background:var(--card);border-radius:8px;cursor:pointer}
.tools button[aria-pressed=true]{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:1500px;margin:0 auto;padding:0 28px 60px}
nav.toc{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 18px}nav.toc a{color:var(--acc);text-decoration:none;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);font-size:13px}
section.topic{margin:28px 0}section.topic>h2{font-size:19px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid var(--ink)}
.row{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
.row h3{margin:0 0 10px;font-size:15px}.row h3 small{color:var(--mute);font-weight:400;margin-left:6px}
.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1.35fr);gap:14px;align-items:start}
.col h4{margin:0 0 6px;font-size:12px;color:var(--mute);font-weight:600;letter-spacing:.02em}
.crop{display:block;width:100%;border:1px solid var(--line);border-radius:6px;background-repeat:no-repeat;background-color:#fff;cursor:zoom-in;padding:0}
.cap{margin:4px 0 0;font-size:12px;color:var(--mute)}
.shots{display:grid;gap:10px}.shot{margin:0}.thumb{display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;cursor:zoom-in;background:#ddd}
.thumb img{display:block;width:100%;height:auto}figcaption{font-size:12px;color:var(--mute);margin-top:3px}
table.ck{width:100%;border-collapse:collapse;font-size:12.5px}table.ck th{text-align:left;color:var(--mute);font-weight:600;border-bottom:1px solid var(--line);padding:4px 6px}
table.ck td{border-bottom:1px solid var(--line);padding:5px 6px;vertical-align:top}table.ck td:first-child{white-space:nowrap;font-weight:600}
tr.st-diff td{background:var(--diffbg)}tr.st-known td{background:var(--knownbg)}
.note{color:var(--mute);font-size:11.5px;margin-top:2px}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}
.b-ok{background:var(--okbg);color:var(--ok)}.b-diff{background:var(--diff);color:#fff}.b-known{background:var(--knownbg);color:var(--known);border:1px solid #e9c46a}.b-info{background:var(--infobg);color:var(--info)}
.diffs{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--diff);border-radius:8px;padding:10px 14px;margin:8px 0 16px}.diffs ol{margin:4px 0;padding-left:20px}.diffs li{margin:2px 0}
.extra .shots{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
/* 간단히 보기: 교과서 | 웹 캡처 두 칸만, 크게 */
body.simple .ck,body.simple .topic-checks,body.simple .diffs{display:none}
body.simple .grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}body.simple .grid>.col-ck{display:none}
#lb{position:fixed;inset:0;background:rgba(15,15,18,.88);display:none;align-items:center;justify-content:center;z-index:10;flex-direction:column;padding:20px}
#lb.on{display:flex}#lb .wrap{position:relative;max-width:96vw;max-height:88vh}#lb img{display:block;max-width:96vw;max-height:88vh}
#lb .hl{position:absolute;border:3px solid #ff3b30;box-shadow:0 0 0 9999px rgba(0,0,0,.25);pointer-events:none}#lb p{color:#fff;margin:10px 0 0}
#lb button{position:absolute;top:14px;right:18px;font:inherit;font-size:15px;background:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer}
</style></head><body>
<header>
<h1>교과서 대조표 — 사회과부도 ${esc(UNIT_TITLE)}(${(cfg.content.pages || UNIT.pages || []).join('~')}쪽)</h1>
<p>왼쪽 = 교과서 쪽(지도 영역 확대, 누르면 쪽 전체에 빨간 상자), 가운데 = 웹 개발 미리보기 캡처 1440×900(?topic=&amp;proj=), 오른쪽 = 확인 항목(생성물에서 자동 계산, 교과서 값은 파이프라인 추출·PDF 글자).</p>
<p>만든 때 ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} · 캡처 ${esc(manifest.at?.slice(0, 16).replace('T', ' ') || '없음')} (${manifest.shots.length}장) · node scripts/atlas/compare.mjs</p>
<div class="sum"><span class="b-diff">다름 ${count(DIFF)}</span><span class="b-known">알려진 차이 ${count(KNOWN)}</span><span class="b-ok">같음 ${count(OK)}</span><span class="b-info">참고 ${count(INFO)}</span></div>
<div class="tools"><button type="button" id="mode" aria-pressed="false">간단히 보기(교과서 | 웹 두 칸)</button></div>
</header><main>
<nav class="toc">${topics.map((t) => `<a href="#t-${t.id}">${esc(t.title)}</a>`).join('')}</nav>
${teacher.length ? `<style>/* 교사 확인 목록(checks.teacher 가 있을 때만 — u2 대조표 HTML 은 그대로) */
.teacher{background:var(--card);border:1px solid var(--line);border-left:4px solid #e9c46a;border-radius:8px;padding:10px 14px;margin:8px 0 16px}.teacher h4{margin:8px 0 2px;font-size:13px}.teacher ol{margin:2px 0;padding-left:20px}.teacher li{margin:2px 0}
body.simple .teacher{display:none}</style>
<div class="teacher"><strong>교사 확인 항목 ${teacher.length}건</strong> <span class="cap">(아래 각 행의 노랑 「교사 확인 ·」 줄과 같음)</span>${[...new Set(teacher.map((x) => x.page))].map((pg) => `<h4>${esc(pg)}</h4><ol>${teacher.filter((x) => x.page === pg).map((x) => `<li><a href="#t-${x.topic}">${esc(x.item)}</a> — ${esc(x.note || x.web)}</li>`).join('')}</ol>`).join('')}</div>
` : ''}${diffs.length ? `<div class="diffs"><strong>다름 ${diffs.length}건</strong><ol>${diffs.map(({ r, c }) => `<li><a href="#t-${r.topic.id}">${esc(r.topic.title)}</a>${r.title ? ` · ${esc(r.title)}` : ''} — ${esc(c.item)}: 교과서 ${esc(c.tb)} / 웹 ${esc(c.web)}</li>`).join('')}</ol></div>` : ''}
`;
for (const t of topics) {
  html += `<section class="topic" id="t-${t.id}"><h2>${esc(t.title)} <small>(${(t.pages || []).join('·')}쪽)</small></h2>\n`;
  for (const r of rows.filter((x) => x.topic === t)) {
    if (r.kind === 'topic') {
      html += `<div class="row extra"><h3>주제 확인 <small>사진·그래프·핀·출처·글</small></h3><div class="topic-checks">${table(r.checks)}</div>
${r.shots.length ? `<h4 style="margin:12px 0 6px;font-size:12px;color:var(--mute)">덧붙임 캡처</h4><div class="shots">${r.shots.map(shotImg).join('')}</div>` : ''}</div>\n`;
    } else {
      html += `<div class="row"><h3>${esc(r.title)}<small>${esc(r.mapId)}</small></h3><div class="grid">
<div class="col"><h4>교과서</h4>${cropDiv(r.mapId)}</div>
<div class="col"><h4>웹 캡처</h4><div class="shots">${r.shots.map(shotImg).join('') || '<p class="cap">캡처 없음</p>'}</div></div>
<div class="col col-ck"><h4>확인 항목</h4>${table(r.checks)}</div></div></div>\n`;
    }
  }
  html += '</section>\n';
}
html += `</main>
<div id="lb" role="dialog" aria-modal="true" aria-label="크게 보기"><button type="button" id="lbx">닫기 (Esc)</button><div class="wrap"><img id="lbi" alt=""><div class="hl" id="lbh"></div></div><p id="lbc"></p></div>
<script>
const lb=document.getElementById('lb'),lbi=document.getElementById('lbi'),lbh=document.getElementById('lbh'),lbc=document.getElementById('lbc');
document.addEventListener('click',(e)=>{const b=e.target.closest('[data-full]');if(!b)return;lbi.src=b.dataset.full;lbc.textContent=b.dataset.cap||'';
 if(b.dataset.hl){const [x,y,w,h]=b.dataset.hl.split(',');Object.assign(lbh.style,{display:'block',left:x+'%',top:y+'%',width:w+'%',height:h+'%'});}else lbh.style.display='none';
 lb.classList.add('on');document.getElementById('lbx').focus();});
const close=()=>lb.classList.remove('on');document.getElementById('lbx').onclick=close;lb.addEventListener('click',(e)=>{if(e.target===lb)close();});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')close();});
const mode=document.getElementById('mode');mode.onclick=()=>{const on=document.body.classList.toggle('simple');mode.setAttribute('aria-pressed',on);};
if(location.hash==='#simple'){document.body.classList.add('simple');mode.setAttribute('aria-pressed','true');}
</script></body></html>
`;
writeFileSync(OUT, html);
console.log(`대조표 → ${OUT}  (행 ${rows.length}, 다름 ${count(DIFF)} · 알려진 차이 ${count(KNOWN)} · 같음 ${count(OK)} · 참고 ${count(INFO)})`);
for (const { r, c } of diffs) console.log(`  다름: ${r.topic.id}${r.title ? ` / ${r.title}` : ''} — ${c.item}: 교과서 ${c.tb} / 웹 ${c.web}`);
