// tests/atlas/basemap.test.mjs — 바탕 지도 basemap.json(D2): 객체 목록·용량·속성·단원 범위 자르기·도장
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { feature, mesh } from 'topojson-client';
import { REPO, readJson, stampHash, WORK } from '../../scripts/atlas/geo_util.mjs';
import { inUnit } from '../../src/atlas/lod.js';

const UNIT = readJson(path.join(REPO, 'scripts/atlas/config/u2.json'));
const CFG = UNIT.basemap;
const FILE = path.join(REPO, CFG.out);
const OBJECTS = ['land110', 'countries110', 'land50', 'countries50', 'rivers50', 'lakes50', 'land10a', 'countries10a', 'rivers10a', 'lakes10a'];

test('basemap.json: 객체 10개, 용량 상한 안', () => {
  const size = fs.statSync(FILE).size;
  assert.ok(size <= CFG.maxBytes, `${size} > ${CFG.maxBytes}`);
  const topo = readJson(FILE);
  assert.equal(topo.type, 'Topology');
  assert.deepEqual(Object.keys(topo.objects), OBJECTS);
  assert.deepEqual(topo.meta.unitBoxes, CFG.unitBoxes);
  assert.equal(topo.meta.bytes, undefined);
});

test('나라 속성은 iso·ko 만, 대한민국·중국·몽골이 상세도마다 있음', () => {
  const topo = readJson(FILE);
  for (const lv of ['110', '50', '10a']) {
    const fc = feature(topo, topo.objects[`countries${lv}`]);
    for (const f of fc.features) assert.deepEqual(Object.keys(f.properties).sort(), ['iso', 'ko'], `${lv} ${JSON.stringify(f.properties)}`);
    const by = Object.fromEntries(fc.features.map((f) => [f.properties.iso, f.properties.ko]));
    assert.equal(by.KOR, '대한민국', lv); assert.equal(by.CHN, '중화인민공화국', lv); assert.ok(by.MNG, lv);
  }
  // 10a 는 단원 범위 밖 나라(브라질)가 없고, 50 에는 있다
  const iso = (lv) => new Set(feature(topo, topo.objects[`countries${lv}`]).features.map((f) => f.properties.iso));
  assert.ok(iso('50').has('BRA')); assert.ok(!iso('10a').has('BRA'));
});

test('육지는 나라를 녹인 것 하나(해안 호를 나라와 나눔)', () => {
  const topo = readJson(FILE);
  for (const lv of ['110', '50', '10a']) {
    const g = topo.objects[`land${lv}`];
    assert.equal(g.type, 'GeometryCollection');
    assert.equal(g.geometries.length, 1, lv);
    // 육지 바깥 둘레 호는 모두 나라 도형에도 쓰인다
    const arcsOf = (o) => new Set(JSON.stringify(o).match(/-?\d+/g).map(Number).map((i) => (i < 0 ? ~i : i)));
    const land = arcsOf(g.geometries[0].arcs), ctry = arcsOf(topo.objects[`countries${lv}`].geometries.map((x) => x.arcs));
    const shared = [...land].filter((a) => ctry.has(a)).length;
    assert.ok(shared / land.size > 0.95, `${lv} 공유 ${shared}/${land.size}`);
  }
});

test('10a 는 단원 범위 상자 안(경도 감김 포함)', () => {
  const topo = readJson(FILE);
  const eps = 0.01;
  const grow = CFG.unitBoxes.map(([w, s, e, n]) => [w - eps, s - eps, e + eps, n + eps]);
  for (const name of ['land10a', 'countries10a', 'rivers10a', 'lakes10a']) {
    const json = JSON.stringify(feature(topo, topo.objects[name]));
    const coords = json.match(/\[-?\d+(\.\d+)?(e-?\d+)?,-?\d+(\.\d+)?(e-?\d+)?\]/g).map((s) => JSON.parse(s));
    const out = coords.filter((c) => !inUnit(c, grow));
    assert.equal(out.length, 0, `${name}: 범위 밖 ${out.length}점 ${JSON.stringify(out.slice(0, 3))}`);
  }
  // 추코트카(날짜변경선 동쪽) 땅이 있다
  const land = JSON.stringify(feature(topo, topo.objects.land10a));
  assert.match(land, /\[-17[0-9]\.\d+,6[5-9]\.\d+\]/);
});

test('하천·호수 속성은 s(scalerank)만, 110 에는 하천·호수 없음', () => {
  const topo = readJson(FILE);
  for (const name of ['rivers50', 'lakes50', 'rivers10a', 'lakes10a']) {
    const fc = feature(topo, topo.objects[name]);
    assert.ok(fc.features.length > 10, name);
    for (const f of fc.features) assert.deepEqual(Object.keys(f.properties), ['s'], name);
  }
  assert.ok(!('rivers110' in topo.objects) && !('lakes110' in topo.objects));
  // 국경선 메시(서로 다른 나라 사이)가 만들어짐
  assert.ok(mesh(topo, topo.objects.countries50, (a, b) => a !== b).coordinates.length > 100);
});

test('도장: meta.inputsHash = 지금 입력(설정·Natural Earth·코드) 해시', { skip: !fs.existsSync(`${WORK}/raw/ne/ne_10m_lakes.geojson`) && 'Natural Earth 원본 없음' }, () => {
  const topo = readJson(FILE);
  assert.equal(topo.meta.inputsHash, stampHash(UNIT, 'basemap'));
});

test('원본 주소는 커밋 SHA 로 고정', () => {
  assert.match(CFG.sourceUrl, /^https:\/\/raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/[0-9a-f]{40}\/geojson\/$/);
});

test('받은 GeoJSON 검사: FeatureCollection·도형 수·필수 속성', async () => {
  const { validateGeojson } = await import('../../scripts/atlas/build_basemap.mjs');
  const ok = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ADM0_A3: 'KOR', NAME_KO: '대한민국' }, geometry: null }] });
  assert.doesNotThrow(() => validateGeojson(ok, ['ADM0_A3', 'NAME_KO']));
  assert.throws(() => validateGeojson('<html>404</html>', []), /JSON/);
  assert.throws(() => validateGeojson('{"type":"Feature"}', []), /FeatureCollection/);
  assert.throws(() => validateGeojson('{"type":"FeatureCollection","features":[]}', []), /도형이 없/);
  assert.throws(() => validateGeojson(ok, ['scalerank']), /scalerank/);
});

test('받기: 시간 초과·실패는 다시 시도하고, 끝내 실패하면 오류', async () => {
  const { fetchWithRetry } = await import('../../scripts/atlas/build_basemap.mjs');
  let n = 0;
  const flaky = async (url, { signal }) => {
    assert.ok(signal, '시간 제한 signal');
    n++;
    if (n < 3) throw new Error('네트워크');
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('{}').buffer };
  };
  const buf = await fetchWithRetry('http://x', { tries: 3, timeoutMs: 1000, waitMs: 0, fetchImpl: flaky });
  assert.equal(Buffer.from(buf).toString(), '{}');
  assert.equal(n, 3);
  let m = 0;
  const bad = async () => { m++; return { ok: false, status: 500 }; };
  await assert.rejects(fetchWithRetry('http://x', { tries: 2, timeoutMs: 1000, waitMs: 0, fetchImpl: bad }), /500/);
  assert.equal(m, 2);
});

test('한반도(KOR·PRK)는 10a 에서 덜 단순화(simplifyByIso, E1) — 해안 꼭짓점이 10% 단순화 때(약 130개)보다 훨씬 많다', () => {
  const lv = CFG.levels.find((l) => l.id === '10a');
  assert.deepEqual(Object.keys(lv.simplifyByIso || {}).sort(), ['KOR', 'PRK']);
  const topo = readJson(FILE);
  const fs10 = feature(topo, topo.objects.countries10a).features;
  const count = (iso) => { let n = 0; const w = (a) => (typeof a[0] === 'number' ? n++ : a.forEach(w)); w(fs10.find((f) => f.properties.iso === iso).geometry.coordinates); return n; };
  assert.ok(count('KOR') > 2500, `KOR ${count('KOR')} (10% 때 129)`);
  assert.ok(count('PRK') > 1500, `PRK ${count('PRK')} (10% 때 137)`);
  assert.ok(count('JPN') < 1500, `JPN ${count('JPN')} (그 밖은 그대로 10%)`);
});

test('simplifyArgs: 나라별 비율 → mapshaper variable 식(설정 그대로의 식도 글자 그대로), 잘못된 값은 오류', async () => {
  const { simplifyArgs } = await import('../../scripts/atlas/build_basemap.mjs');
  const lv = CFG.levels.find((l) => l.id === '10a');
  assert.deepEqual(simplifyArgs(lv.simplify, lv.simplifyByIso), ['variable', "percentage=iso=='KOR'?1:iso=='PRK'?1:0.1"]);
  assert.deepEqual(simplifyArgs('10%'), ['10%']);
  assert.deepEqual(simplifyArgs('10%', { KOR: '100%', PRK: '50%' }), ['variable', "percentage=iso=='KOR'?1:iso=='PRK'?0.5:0.1"]);
  assert.throws(() => simplifyArgs('10%', { kor: '50%' }));
  assert.throws(() => simplifyArgs('10%', { KOR: '150%' }));
});

test('checkByIso: simplifyByIso 열쇠가 그 상세도 나라 iso 에 없으면 오류(오타·자르기 밖), 지금 basemap.json 은 통과', async () => {
  const { checkByIso } = await import('../../scripts/atlas/build_basemap.mjs');
  const topo = readJson(FILE);
  checkByIso(topo, CFG.levels);
  assert.throws(() => checkByIso(topo, [{ id: '10a', simplifyByIso: { KOR: '100%', BRA: '50%' } }]), /BRA/);
  assert.throws(() => checkByIso(topo, [{ id: '10a', simplifyByIso: { XXX: '50%' } }]), /XXX/);
});

// ---------- U4-9 나라 고치기(mergeIsos·cutIsos — u4 설정에만) ----------
test('countryArgs: 고치기 설정이 없으면(u2·u3) 나라 층 mapshaper 인자가 옛 글자 그대로', async () => {
  const { countryArgs, editArgs } = await import('../../scripts/atlas/build_basemap.mjs');
  const old = (lv, raw) => {   // U4-9 전 buildLevel 의 인자 목록을 그대로 옮긴 것
    const clip = lv.clip ? ['-clip', 'unit-boxes.json'] : [];
    const { simplifyArgs } = { simplifyArgs: (s, b) => (b && Object.keys(b).length ? ['variable', `percentage=${Object.entries(b).map(([k, v]) => `iso=='${k}'?${parseFloat(v) / 100}:`).join('')}${parseFloat(s) / 100}`] : [s]) };
    const simp = (s) => (s ? ['-simplify', ...simplifyArgs(s, lv.simplifyByIso), 'keep-shapes'] : []);
    return ['-i', `${raw}/${lv.countries}.geojson`, `name=countries${lv.id}`, ...clip,
      '-each', 'iso=ADM0_A3,ko=NAME_KO', '-filter-fields', 'iso,ko', ...simp(lv.simplify),
      '-dissolve2', '+', `name=land${lv.id}`,
      '-o', 'format=topojson', 'no-quantization', `target=land${lv.id},countries${lv.id}`, `part-${lv.id}-countries.json`];
  };
  for (const u of ['u2', 'u3']) {
    const cfg = readJson(path.join(REPO, `scripts/atlas/config/${u}.json`)).basemap;
    assert.ok(!cfg.mergeIsos && !cfg.cutIsos, u);
    for (const lv of cfg.levels) assert.deepEqual(countryArgs(lv, '../raw/ne', { mergeIsos: cfg.mergeIsos, cutIsos: cfg.cutIsos }), old(lv, '../raw/ne'), `${u} ${lv.id}`);
  }
  assert.deepEqual(editArgs('countries50', {}), []);
  assert.deepEqual(editArgs('countries50', { mergeIsos: { _doc: 'x' }, cutIsos: [] }), []);
});

test('editArgs: 합치기·자르기 인자(고친 나라만 따로 녹임), 잘못된 설정·이름 없음은 오류', async () => {
  const { editArgs } = await import('../../scripts/atlas/build_basemap.mjs');
  const a = editArgs('countries50', { mergeIsos: { SOM: ['SOL'] }, cutIsos: [{ from: 'MAR', to: 'SAH', box: [-18, 20, -8, 27.6667] }] }, { SOM: '소말리아', SAH: '서사하라' });
  const s = a.join(' ');
  assert.match(s, /^-filter \["SOM","SAH","SOL","MAR"\]\.indexOf\(iso\)>=0 \+ name=edits target=countries50/);
  assert.match(s, /-clip bbox=-18,20,-8,27\.6667 target=cutin0 -each iso='SAH' target=cutin0 -erase bbox=-18,20,-8,27\.6667 target=cutout0/);
  assert.match(s, /-each if \(\["SOL"\]\.indexOf\(iso\)>=0\) iso='SOM' target=edits/);
  assert.match(s, /-dissolve2 iso copy-fields=ko target=edits -each ko=\(\{"SOM":"소말리아","SAH":"서사하라"\}\)\[iso\]\|\|ko target=edits -merge-layers target=countries50,edits name=countries50 force$/);
  assert.throws(() => editArgs('c', { mergeIsos: { SOM: 'SOL' } }, { SOM: 'x' }), /배열/);
  assert.throws(() => editArgs('c', { cutIsos: [{ from: 'MAR', to: 'SAH', box: [1, 2, 0, 3] }] }, { SAH: 'x' }), /box/);
  assert.throws(() => editArgs('c', { mergeIsos: { som: ['SOL'] } }, { som: 'x' }), /세 글자/);
  assert.throws(() => editArgs('c', { mergeIsos: { SOM: ['SOL'] } }, {}), /SOM 이름/);
});

test('u4 바탕 지도: 소말릴란드는 소말리아에 합침(Q3), 서사하라 전체 = 북위 27°40′ 남쪽(Q1 교과서대로), 용량·도장', async () => {
  const { checkEdits } = await import('../../scripts/atlas/build_basemap.mjs');
  const U4 = readJson(path.join(REPO, 'scripts/atlas/config/u4.json'));
  const file = path.join(REPO, U4.basemap.out);
  assert.ok(fs.statSync(file).size <= U4.basemap.maxBytes);
  const topo = readJson(file);
  checkEdits(topo, U4.basemap);
  if (fs.existsSync(`${WORK}/raw/ne/ne_10m_lakes.geojson`)) assert.equal(topo.meta.inputsHash, stampHash(U4, 'basemap'));
  for (const lv of ['110', '50', '10a']) {
    const fc = feature(topo, topo.objects[`countries${lv}`]).features;
    const one = (iso) => { const l = fc.filter((f) => f.properties.iso === iso); assert.equal(l.length, 1, `${lv} ${iso}`); return l[0]; };
    assert.ok(!fc.some((f) => f.properties.iso === 'SOL'), lv);
    assert.equal(one('SOM').properties.ko, '소말리아');
    assert.equal(one('SAH').properties.ko, '서사하라');
    // 모로코 면의 가장 남쪽 = 27°40′(서사하라 땅이 모로코에 남지 않음), 서사하라 서쪽 해안 끝(다클라 반도 ~ 엘아이운) 포함
    let minLat = 90; const walk = (a) => (typeof a[0] === 'number' ? (minLat = Math.min(minLat, a[1])) : a.forEach(walk));
    walk(one('MAR').geometry.coordinates);
    assert.ok(Math.abs(minLat - 27.6667) < 0.001, `${lv} 모로코 남쪽 끝 ${minLat}`);
    const m = mesh(topo, topo.objects[`countries${lv}`], (a, b) => a !== b && [a.properties.iso, b.properties.iso].sort().join() === 'MAR,SAH');
    assert.ok(m.coordinates.length >= 1 && m.coordinates.flat().every(([, y]) => Math.abs(y - 27.6667) < 0.001), `${lv} 경계 = 27°40′`);
  }
});

// ---------- U5-9 기아나 GUF = FRA 에서 잘라 냄(cutIsos, 교사 Q5) · 원본에 없는 iso 이름 basemap.names ----------
test('editNames: 원본 NAME_KO 먼저, 원본에 없는 iso 는 설정 names(있을 때만) — 고치기가 없으면 {}', async () => {
  const { editNames } = await import('../../scripts/atlas/build_basemap.mjs');
  const read = () => ({ features: [{ properties: { ADM0_A3: 'FRA', NAME_KO: '프랑스' } }, { properties: { ADM0_A3: 'SAH', NAME_KO: '서사하라' } }] });
  const levels = [{ countries: 'x' }];
  assert.deepEqual(editNames({ levels }, 'r', read), {});
  assert.deepEqual(editNames({ levels, cutIsos: [{ from: 'FRA', to: 'GUF', box: [-55, 2, -51, 6] }] }, 'r', read), {}, 'names 없으면 GUF 이름 없음(editArgs 가 오류)');
  assert.deepEqual(editNames({ levels, cutIsos: [{ from: 'FRA', to: 'GUF', box: [-55, 2, -51, 6] }], names: { _doc: 'x', GUF: '기아나', ZZZ: '안 씀' } }, 'r', read), { GUF: '기아나' });
  assert.deepEqual(editNames({ levels, cutIsos: [{ from: 'MAR', to: 'SAH', box: [-18, 20, -8, 27.6667] }], names: { SAH: '바꾸지 않음' } }, 'r', read), { SAH: '서사하라' }, '원본 이름이 이김');
});

test('u5 바탕 지도: 기아나 GUF 하나(상자 안), 상자 안에 FRA 없음, 용량·도장, 10a = 카리브·중앙아메리카 상자', async () => {
  const { checkEdits } = await import('../../scripts/atlas/build_basemap.mjs');
  const { geoBounds } = await import('d3-geo');
  const U5 = readJson(path.join(REPO, 'scripts/atlas/config/u5.json'));
  const file = path.join(REPO, U5.basemap.out);
  assert.ok(fs.statSync(file).size <= U5.basemap.maxBytes);
  const topo = readJson(file);
  checkEdits(topo, U5.basemap);
  if (fs.existsSync(`${WORK}/raw/ne/ne_10m_lakes.geojson`)) assert.equal(topo.meta.inputsHash, stampHash(U5, 'basemap'));
  assert.deepEqual(topo.meta.unitBoxes, [[-95, 3, -48, 28]]);
  const [w, s, e, n] = U5.basemap.cutIsos[0].box;
  for (const lv of ['110', '50', '10a']) {
    const fc = feature(topo, topo.objects[`countries${lv}`]).features;
    const g = fc.filter((f) => f.properties.iso === 'GUF');
    assert.equal(g.length, 1, lv);
    assert.equal(g[0].properties.ko, '기아나');
    const [[gw, gs], [ge, gn]] = geoBounds(g[0]);
    assert.ok(gw >= w && gs >= s && ge <= e && gn <= n && ge - gw > 2.5, `${lv} 기아나 범위 ${[gw, gs, ge, gn]}`);
    const fra = fc.find((f) => f.properties.iso === 'FRA');
    const polys = fra.geometry.type === 'Polygon' ? [fra.geometry.coordinates] : fra.geometry.coordinates;
    for (const P of polys) {
      const [[pw, ps], [pe, pn]] = geoBounds({ type: 'Polygon', coordinates: P });
      assert.ok(pe < w || pw > e || pn < s || ps > n, `${lv} 상자 안에 FRA 조각 ${[pw, ps, pe, pn]}`);
    }
    if (lv !== '10a') assert.ok(polys.some((P) => geoBounds({ type: 'Polygon', coordinates: P })[1][1] > 50), `${lv} 프랑스 본토 그대로`);
  }
  // 41쪽 색칠하기 나라 35 + 지역 2 가 모두 50m 바탕 지도에 있음(앱 색칠 층이 바탕 지도 iso 로 칠함 — GUF 포함)
  const quiz = readJson(path.join(REPO, 'content/atlas/u5/coloring.json'));
  const isos50 = new Set(feature(topo, topo.objects.countries50).features.map((f) => f.properties.iso));
  const want = quiz.countries.map((q) => q.iso);
  assert.equal(want.length, 37);
  assert.ok(want.includes('GUF'));
  for (const iso of want) assert.ok(isos50.has(iso), `50m 에 ${iso} 없음`);
});
