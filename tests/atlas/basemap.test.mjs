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
