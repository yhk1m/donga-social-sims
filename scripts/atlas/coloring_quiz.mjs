// © 2026 김용현
// scripts/atlas/coloring_quiz.mjs — 색칠하기 지도(설정 content.coloring.page) 문제 자료: 나라 이름 글자 → Natural Earth 나라(ADM0_A3)·한국어 이름·수도
//   node scripts/atlas/coloring_quiz.mjs [--write]   (모르는 옵션은 종료 코드 2)
//   입력: $ATLAS_WORK/<content.labels>(extract_text.py --labels, inputsHash 로 낡았는지 확인), 색칠하기 지도 fit, places.json(교과서 16·18·19쪽 지명), Natural Earth 10m 나라·인구 지점
//   출력(--write): content/atlas/u2/coloring.json. 경고가 있으면 쓰지 않고 종료 코드 1.
// 규칙(설정 content.coloring):
//   - 나라: Natural Earth 한국어 이름(NAME_KO)의 초성이 글자(초성 또는 이름)의 초성과 같은 나라 중 글자 가운데(fit 으로 되돌린 경위도)에서
//     nameKm 안 가장 가까운 면, 없으면(터키 ↔ 튀르키예) 글자 자리의 면(nearKm 안). 글자가 다른 나라 면 위에 있으면 labelIso 로 남긴다.
//   - 이름: 다 적힌 글자는 그대로, 초성 글자(ㄹㅅㅇ)는 그 면 안 places 나라 지명 중 초성이 같은 하나. 둘 이상·없음은 경고.
//   - 수도: 색칠하기 지도에 손글씨로 적힌 수도(capitalFrom printed)는 그 이름, 아니면 그 면 안 places 수도 지명 하나(둘 이상이면 Natural Earth 「Admin-0 capital」에 가장 가까운 것).
//   단원 설정이 있을 때만 쓰는 것(없으면 1단계 동작 그대로 — u3 27쪽에서 더함):
//     ignoreLabels [글자] = 나라 이름이 아닌 같은 글꼴 글자(「(러)」 = 칼리닌그라드 소속 표시), joinLabels [[글자…]] = 여러 줄로 나뉜 한 나라 이름
//     (「보스니아」+「헤르체고비나」 → 공백으로 이음, 상자는 합침), isoByLabel {글자: ADM0_A3} = Natural Earth 한국어 이름 초성이 달라 짝이 안 되는 나라
//     (「바티칸」 ↔ 「바티칸 시국」), capitalByNe = 손글씨 수도의 나라를 그 지명 가까이(nearKm)의 Natural Earth 「Admin-0 capital」 나라로(작은 나라 수도 기호가
//     옮겨 그린 자리라 이웃 나라 면에 떨어짐 — 파두츠·모나코·니코시아), noCapital {ADM0_A3: 까닭} = 수도 지명이 따로 없는 나라(경고 대신 수도 칸 없음).
//   u4 35쪽에서 더한 것(역시 설정이 있을 때만):
//     regions {ADM0_A3: 까닭} = 나라가 아닌 「지역」(서사하라 — 교사 Q1: 칠할 수 있으나 나라 수 밖). 그 면의 이름은 places 의 regionKinds(기본 ['region'])
//     지명에서도 찾고, 출력에 region: true. capitalByNe 이고 손글씨 수도가 없는 나라의 면 안에 places 수도가 없으면(라바트 — Natural Earth 10m
//     해안선이 도시 점보다 안쪽이라 면 밖 2km) 그 나라 Natural Earth 「Admin-0 capital」에서 nearKm 안 가장 가까운 places 수도(places+ne).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';
import { WORK, REPO, loadFit, key, km, readJson, round, contains, nearKm, stampHash, writeIfChanged } from './geo_util.mjs';
import { resolveUnit, stripUnitArgs } from './unit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = resolveUnit();   // 단원 고르기(--unit uN · env ATLAS_UNIT · 옛 ATLAS_UNIT_CONFIG, 기본 u2) — scripts/atlas/unit.mjs
const CONFIG = UNIT.configPath;

// 한글 음절 = 0xAC00 + (초성 × 21 + 중성) × 28 + 종성 (유니코드 한글 음절 배치)
const HANGUL_FIRST = 0xac00, HANGUL_COUNT = 11172, SYLLABLES_PER_INITIAL = 21 * 28;
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** 한글 음절 → 초성(그 밖 글자는 그대로), 공백은 뺀다. */
export function choseong(s) {
  return [...key(s)].map((ch) => {
    const c = ch.codePointAt(0) - HANGUL_FIRST;
    return c >= 0 && c < HANGUL_COUNT ? INITIALS[Math.floor(c / SYLLABLES_PER_INITIAL)] : ch;
  }).join('');
}
/** 초성만으로 된 글자인가(공백 빼고). */
export const isChoseong = (s) => /^[ㄱ-ㅎ]+$/.test(key(s));

/** 경위도가 든 나라(없으면 maxKm 안 가장 가까운 나라) → feature | null. */
export function countryAt(countries, p, maxKm) {
  const hit = countries.find((f) => contains(f.geometry, p));
  if (hit) return hit;
  let best = null, bd = maxKm;
  for (const f of countries) { const d = nearKm(f.geometry, p); if (d < bd) { bd = d; best = f; } }
  return best;
}

const round4 = (ll) => ll.map((v) => round(v, 4));

/** 색칠하기 지도의 나라 글자 목록에 설정 ignoreLabels(뺄 글자)·joinLabels(이을 글자 묶음, 쪽 흐름 순서대로 붙어 나와야 함)를 적용한 새 목록.
 *  설정이 없으면 그대로. 설정 글자가 지면에 없으면 경고(W 에 더함). */
export function countryLabels(list, cfg, W = []) {
  const ignore = new Set((cfg.ignoreLabels ?? []).map(key));
  const out = [];
  for (const g of cfg.ignoreLabels ?? []) if (!list.some((l) => key(l.text) === key(g))) W.push(`ignoreLabels ${g}: 지면에 없음`);
  const joins = (cfg.joinLabels ?? []).map((g) => g.map(key));
  const used = new Set();
  for (let i = 0; i < list.length; i++) {
    if (used.has(i) || ignore.has(key(list[i].text))) continue;
    const j = joins.find((g) => g.every((t, k) => list[i + k] && key(list[i + k].text) === t));
    if (!j) { out.push(list[i]); continue; }
    const parts = list.slice(i, i + j.length);
    parts.forEach((_, k) => used.add(i + k));
    const b = parts.map((p) => p.bbox);
    out.push({ text: parts.map((p) => p.text).join(' '),
      bbox: [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))] });
  }
  for (const g of joins) if (!out.some((l) => key(l.text) === g.join(''))) W.push(`joinLabels ${g.join('+')}: 지면에서 차례대로 찾지 못함`);
  return out;
}

/** 문제 자료 만들기. 입력은 모두 메모리 자료 → {countries, warnings}. */
export function buildColoring({ labels, fit, places, countries, nePlaces, cfg }) {
  const W = [], conv = makeConverter(fit);
  const centre = (b) => conv.invert([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  const placeCountries = places.filter((p) => cfg.countryKinds.includes(p.kind));
  const placeCapitals = places.filter((p) => cfg.capitalKinds.includes(p.kind));
  const placeRegions = cfg.regions ? places.filter((p) => (cfg.regionKinds ?? ['region']).includes(p.kind)) : [];
  const ll = (p) => [p.lon, p.lat];
  const out = [];
  const dist = (g, p) => (contains(g.geometry, p) ? 0 : nearKm(g.geometry, p));
  for (const lab of countryLabels(labels.countries, cfg, W)) {
    const text = key(lab.text), cho = choseong(text);
    const pos = centre(lab.bbox);
    if (!pos) { W.push(`${lab.text}: 경위도 되돌리기 실패`); continue; }
    // ① Natural Earth 한국어 이름(NAME_KO)의 초성이 같은 나라 중 글자에서 가장 가까운 것, ② 없으면 글자 자리의 나라 면
    let f = null, bd = cfg.nameKm;
    const forced = cfg.isoByLabel?.[text];
    if (forced) { f = countries.find((g) => g.properties.ADM0_A3 === forced) ?? null; if (!f) W.push(`${lab.text}: isoByLabel ${forced} 이 Natural Earth 에 없음`); }
    else for (const g of countries) {
      if (choseong(g.properties.NAME_KO ?? '') !== cho) continue;
      const d = dist(g, pos); if (d < bd) { bd = d; f = g; }
    }
    if (!f) f = countryAt(countries, pos, cfg.nearKm);
    if (!f) { W.push(`${lab.text}: ${cfg.nearKm}km 안에 나라 면 없음 (${round4(pos)})`); continue; }
    // 이름 = 교과서 지명(places 나라)에서: 다 적힌 글자는 그 이름, 초성은 초성이 같은 지명(Natural Earth 이름과 같으면 그것, 아니면 하나뿐일 때)
    const isRegion = Boolean(cfg.regions?.[f.properties.ADM0_A3]);
    const cand = (isRegion ? [...placeCountries, ...placeRegions] : placeCountries).filter((p) => choseong(p.name) === cho);
    const names = [...new Set(cand.map((p) => p.name))];
    let name = null;
    if (!isChoseong(text)) name = names.find((n) => key(n) === text) ?? null;
    else if (names.some((n) => key(n) === key(f.properties.NAME_KO))) name = names.find((n) => key(n) === key(f.properties.NAME_KO));
    else if (names.length === 1) name = names[0];
    if (!name) { W.push(`${lab.text}: 교과서 나라 지명 정하지 못함(후보 ${names.join(',') || '없음'}, Natural Earth ${f.properties.NAME_KO})`); continue; }
    const here = countryAt(countries, pos, 0);   // 글자 가운데가 든 면(0km = 안에 있을 때만)
    const c = { name, label: lab.text, iso: f.properties.ADM0_A3, neName: f.properties.NAME, labelLonlat: round4(pos), f };
    if (here && here !== f) c.labelIso = here.properties.ADM0_A3;
    if (isRegion) c.region = true;
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
    let c = null;
    if (cfg.capitalByNe) {   // 그 지명 가까이 Natural Earth 나라 수도의 나라(문제 나라 가운데)
      let bd = cfg.nearKm;
      for (const q of nePlaces) {
        if (q.cls !== 'Admin-0 capital') continue;
        const d = km(ll(p), q.ll), hit = out.find((o) => o.iso === q.adm0);
        if (hit && d < bd) { bd = d; c = hit; }
      }
    }
    c ??= out.find((c) => countryAt(countries, ll(p), cfg.nearKm) === c.f);
    if (!c) { W.push(`수도 글자 ${lab.text}: 나라 없음`); continue; }
    if (printed.has(c.iso)) W.push(`${c.name}: 손글씨 수도 둘(${printed.get(c.iso).name}, ${p.name})`);
    printed.set(c.iso, p);
  }
  for (const iso of Object.keys(cfg.regions ?? {})) if (!out.some((c) => c.iso === iso)) W.push(`regions ${iso}: 색칠하기 지도 글자에 없음`);
  for (const c of out) {
    let cap = printed.get(c.iso), how = 'printed';
    if (!cap && cfg.noCapital?.[c.iso]) { delete c.f; continue; }
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
      } else if (cfg.capitalByNe) {   // 면 밖으로 조금 나간 해안 수도(라바트): Natural Earth 수도 가까이(nearKm) 가장 가까운 places 수도
        const ne = nePlaces.filter((q) => q.adm0 === c.iso && q.cls === 'Admin-0 capital');
        let bd = cfg.nearKm;
        for (const p of placeCapitals) for (const q of ne) { const d = km(ll(p), q.ll); if (d < bd) { bd = d; cap = p; } }
        how = 'places+ne';
        if (!cap) W.push(`${c.name}: 면 안 places 수도 없음(Natural Earth 수도 ${cfg.nearKm}km 안에도 없음)`);
      } else W.push(`${c.name}: 면 안 places 수도 없음`);
    }
    if (cap) { c.capital = cap.name; c.capitalLonlat = round4(ll(cap)); c.capitalFrom = how; }
    delete c.f;
  }
  out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return { countries: out, warnings: W };
}

/** 입력 읽기. 색칠하기 지도 글자(labels)가 지금 코드·설정으로 뽑은 것인지(inputsHash = 도장 labels) 확인한다. */
export function loadInputs() {
  const unit = readJson(CONFIG), cfg = unit.content, cc = cfg.coloring;
  const labelsFile = `${WORK}/${cfg.labels}`;
  if (!fs.existsSync(labelsFile)) throw new Error(`${labelsFile} 없음 (python -I scripts/atlas/extract_text.py --labels 먼저)`);
  const labels = readJson(labelsFile);
  if (labels.inputsHash !== stampHash(unit, 'labels')) throw new Error(`${labelsFile} 가 지금 코드·설정과 맞지 않음 (python -I scripts/atlas/extract_text.py --labels 먼저)`);
  const countries = readJson(`${WORK}/${cc.neCountries}`).features;
  const nePlaces = readJson(`${WORK}/${cc.nePlaces}`).features.map((f) => ({
    adm0: f.properties.ADM0_A3, cls: f.properties.FEATURECLA, ll: f.geometry.coordinates }));
  return { unit, labels, fit: loadFit(cc.map), places: readJson(path.join(REPO, cfg.places)), countries, nePlaces, cfg: cc, out: path.join(REPO, cfg.coloringOut) };
}

/** 쓸 문서(키 순서 고정). inputsHash = 도장 coloring(색칠하기 지도 글자·places·fit·Natural Earth·코드·설정). */
export function coloringDoc(inp, countries) {
  return {
    _doc: 'coloring_quiz.mjs 생성물(직접 고치지 말고 고칠 값은 overrides.json). name = 나라 이름(교과서 지명), label = 색칠하기 지도 글자(초성 또는 이름), iso = Natural Earth ADM0_A3, labelIso = 글자가 놓인 다른 나라, capitalFrom = printed(색칠하기 지도에 적힌 수도)·places(일반도 수도 지명)·places+ne(여럿 중 Natural Earth 수도에 가까운 것).',
    page: inp.cfg.page, map: inp.cfg.map, inputsHash: stampHash(inp.unit, 'coloring'), countries,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bad = stripUnitArgs(process.argv.slice(2)).rest.filter((a) => a !== '--write');
  if (bad.length) { console.error(`모르는 옵션: ${bad.join(' ')} (쓸 수 있는 것: --write)`); process.exit(2); }
  try {
    const inp = loadInputs();
    const { countries, warnings } = buildColoring(inp);
    for (const c of countries) console.log([c.iso, c.label, c.name, c.capital ?? '-', c.capitalFrom ?? ''].join('\t'));
    console.log(`나라 ${countries.length}개`);
    if (warnings.length) {
      console.log(`\n경고 ${warnings.length}개:`); for (const w of warnings) console.log('  - ' + w);
      process.exit(1);
    }
    if (process.argv.includes('--write')) {
      const changed = writeIfChanged(inp.out, JSON.stringify(coloringDoc(inp, countries), null, 1) + '\n');
      console.log(`  ${path.relative(REPO, inp.out)} (${changed ? '씀' : '같음, 그대로'})`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
