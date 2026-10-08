// © 2026 김용현
// scripts/atlas/coloring_quiz.mjs — 색칠하기(17쪽) 문제 자료: 나라 이름 글자 → Natural Earth 나라(ADM0_A3)·한국어 이름·수도
//   node scripts/atlas/coloring_quiz.mjs [--write]
//   입력: $ATLAS_WORK/<content.labels>(extract_text.py --labels), 17쪽 fit, places.json(교과서 16·18·19쪽 지명), Natural Earth 10m 나라·인구 지점
//   출력(--write): content/atlas/u2/coloring.json. 경고가 있으면 쓰지 않고 종료 코드 1.
// 규칙(설정 content.coloring):
//   - 나라: Natural Earth 한국어 이름(NAME_KO)의 초성이 글자(초성 또는 이름)의 초성과 같은 나라 중 글자 가운데(fit 으로 되돌린 경위도)에서
//     nameKm 안 가장 가까운 면, 없으면(터키 ↔ 튀르키예) 글자 자리의 면(nearKm 안). 글자가 다른 나라 면 위에 있으면 labelIso 로 남긴다.
//   - 이름: 다 적힌 글자는 그대로, 초성 글자(ㄹㅅㅇ)는 그 면 안 places 나라 지명 중 초성이 같은 하나. 둘 이상·없음은 경고.
//   - 수도: 17쪽에 손글씨로 적힌 수도(25곳)는 그 이름, 아니면 그 면 안 places 수도 지명 하나(둘 이상이면 Natural Earth 「Admin-0 capital」에 가장 가까운 것).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';
import { WORK, loadFit, key, km } from './geo_util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
const CONFIG = process.env.ATLAS_UNIT_CONFIG || path.join(HERE, 'config', 'u2.json');

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** 한글 음절 → 초성(그 밖 글자는 그대로), 공백은 뺀다. */
export function choseong(s) {
  return [...key(s)].map((ch) => {
    const c = ch.codePointAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');
}
/** 초성만으로 된 글자인가(공백 빼고). */
export const isChoseong = (s) => /^[ㄱ-ㅎ]+$/.test(key(s));

/** 평면(경위도) 점-다각형 포함: 고리 [[lon,lat]...] 짝수–홀수 규칙. */
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** 나라 도형(Polygon·MultiPolygon) 안인가(구멍 빼고). */
export function contains(geom, p) {
  return polys(geom).some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}
/** 나라 도형 꼭짓점까지 가장 짧은 거리(km) — 면 밖 글자의 가까운 나라 찾기용 어림. */
export function nearKm(geom, p) {
  let best = Infinity;
  for (const poly of polys(geom)) for (const ring of poly) for (const v of ring) best = Math.min(best, km(p, v));
  return best;
}

/** 경위도가 든 나라(없으면 maxKm 안 가장 가까운 나라) → feature | null. */
export function countryAt(countries, p, maxKm) {
  const hit = countries.find((f) => contains(f.geometry, p));
  if (hit) return hit;
  let best = null, bd = maxKm;
  for (const f of countries) { const d = nearKm(f.geometry, p); if (d < bd) { bd = d; best = f; } }
  return best;
}

const round = (ll) => ll.map((v) => Math.round(v * 1e4) / 1e4);

/** 문제 자료 만들기. 입력은 모두 메모리 자료 → {countries, warnings}. */
export function buildColoring({ labels, fit, places, countries, nePlaces, cfg }) {
  const W = [], conv = makeConverter(fit);
  const centre = (b) => conv.invert([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  const placeCountries = places.filter((p) => cfg.countryKinds.includes(p.kind));
  const placeCapitals = places.filter((p) => cfg.capitalKinds.includes(p.kind));
  const ll = (p) => [p.lon, p.lat];
  const out = [];
  const dist = (g, p) => (contains(g.geometry, p) ? 0 : nearKm(g.geometry, p));
  for (const lab of labels.countries) {
    const text = key(lab.text), cho = choseong(text);
    const pos = centre(lab.bbox);
    if (!pos) { W.push(`${lab.text}: 경위도 되돌리기 실패`); continue; }
    // ① Natural Earth 한국어 이름(NAME_KO)의 초성이 같은 나라 중 글자에서 가장 가까운 것, ② 없으면 글자 자리의 나라 면
    let f = null, bd = cfg.nameKm;
    for (const g of countries) {
      if (choseong(g.properties.NAME_KO ?? '') !== cho) continue;
      const d = dist(g, pos); if (d < bd) { bd = d; f = g; }
    }
    if (!f) f = countryAt(countries, pos, cfg.nearKm);
    if (!f) { W.push(`${lab.text}: ${cfg.nearKm}km 안에 나라 면 없음 (${round(pos)})`); continue; }
    // 이름 = 교과서 지명(places 나라)에서: 다 적힌 글자는 그 이름, 초성은 초성이 같은 지명(Natural Earth 이름과 같으면 그것, 아니면 하나뿐일 때)
    const cand = placeCountries.filter((p) => choseong(p.name) === cho);
    const names = [...new Set(cand.map((p) => p.name))];
    let name = null;
    if (!isChoseong(text)) name = names.find((n) => key(n) === text) ?? null;
    else if (names.some((n) => key(n) === key(f.properties.NAME_KO))) name = names.find((n) => key(n) === key(f.properties.NAME_KO));
    else if (names.length === 1) name = names[0];
    if (!name) { W.push(`${lab.text}: 교과서 나라 지명 정하지 못함(후보 ${names.join(',') || '없음'}, Natural Earth ${f.properties.NAME_KO})`); continue; }
    const here = countryAt(countries, pos, 0);   // 글자 가운데가 든 면(0km = 안에 있을 때만)
    const c = { name, label: lab.text, iso: f.properties.ADM0_A3, neName: f.properties.NAME, labelLonlat: round(pos), f };
    if (here && here !== f) c.labelIso = here.properties.ADM0_A3;
    out.push(c);
  }
  // 같은 나라가 두 번 잡히면 경고
  const seen = new Map();
  for (const c of out) { if (seen.has(c.iso)) W.push(`${c.label}·${seen.get(c.iso)}: 같은 나라 ${c.iso}`); seen.set(c.iso, c.label); }
  // 수도
  const printed = new Map();
  for (const lab of labels.capitals) {
    const same = placeCapitals.filter((p) => key(p.name) === key(lab.text));
    const pos = centre(lab.bbox);
    if (!same.length) { W.push(`수도 글자 ${lab.text}: places 수도 지명 없음`); continue; }
    const p = same.sort((a, b) => km(pos, ll(a)) - km(pos, ll(b)))[0];
    const c = out.find((c) => countryAt(countries, ll(p), cfg.nearKm) === c.f);
    if (!c) { W.push(`수도 글자 ${lab.text}: 나라 없음`); continue; }
    if (printed.has(c.iso)) W.push(`${c.name}: 손글씨 수도 둘(${printed.get(c.iso).name}, ${p.name})`);
    printed.set(c.iso, p);
  }
  for (const c of out) {
    let cap = printed.get(c.iso), how = 'p17';
    if (!cap) {
      const inside = placeCapitals.filter((p) => contains(c.f.geometry, ll(p)));
      how = 'places';
      if (inside.length === 1) cap = inside[0];
      else if (inside.length > 1) {
        const ne = nePlaces.filter((q) => q.adm0 === c.iso && q.cls === 'Admin-0 capital');
        if (ne.length) {
          cap = inside.sort((a, b) => Math.min(...ne.map((q) => km(ll(a), q.ll))) - Math.min(...ne.map((q) => km(ll(b), q.ll))))[0];
          how = 'places+ne';
        } else W.push(`${c.name}: places 수도 ${inside.length}개, Natural Earth 수도 없음`);
      } else W.push(`${c.name}: 면 안 places 수도 없음`);
    }
    if (cap) { c.capital = cap.name; c.capitalLonlat = round(ll(cap)); c.capitalFrom = how; }
    delete c.f;
  }
  out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return { countries: out, warnings: W };
}

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

export function loadInputs() {
  const cfg = readJson(CONFIG).content, cc = cfg.coloring;
  const labelsFile = `${WORK}/${cfg.labels}`;
  if (!fs.existsSync(labelsFile)) throw new Error(`${labelsFile} 없음 (python -I scripts/atlas/extract_text.py --labels 먼저)`);
  const countries = readJson(`${WORK}/${cc.neCountries}`).features;
  const nePlaces = readJson(`${WORK}/${cc.nePlaces}`).features.map((f) => ({
    adm0: f.properties.ADM0_A3, cls: f.properties.FEATURECLA, ll: f.geometry.coordinates }));
  return { labels: readJson(labelsFile), fit: loadFit(cc.map), places: readJson(path.join(ROOT, cfg.places)), countries, nePlaces, cfg: cc, out: path.join(ROOT, cfg.coloringOut) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const inp = loadInputs();
  const { countries, warnings } = buildColoring(inp);
  for (const c of countries) console.log(`${c.iso}\t${c.label}\t${c.name}\t${c.capital ?? '-'}\t${c.capitalFrom ?? ''}`);
  console.log(`나라 ${countries.length}개`);
  if (warnings.length) {
    console.log(`\n경고 ${warnings.length}개:`); for (const w of warnings) console.log('  - ' + w);
    process.exit(1);
  }
  if (process.argv.includes('--write')) {
    const doc = {
      _doc: '색칠하기(17쪽) 문제 자료 — coloring_quiz.mjs 가 만든다(직접 고치지 말고 고칠 값은 overrides.json). name = 나라 이름(교과서 지명), label = 17쪽 글자(초성 또는 이름), iso = Natural Earth ADM0_A3, capitalFrom = p17(17쪽 손글씨)·places(16·18·19쪽 수도 지명)·places+ne(여럿 중 Natural Earth 수도에 가까운 것).',
      page: 17, map: inp.cfg.map, countries,
    };
    const tmp = inp.out + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1) + '\n');
    fs.renameSync(tmp, inp.out);
    console.log(`  ${inp.out}`);
  }
}
