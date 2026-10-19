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
