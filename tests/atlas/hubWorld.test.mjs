// tests/atlas/hubWorld.test.mjs — 사회과부도 모음 통합 세계 지도(scripts/atlas/hub_world.mjs · src/atlas/hubData.js worldTree).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { geoArea } from 'd3-geo';
import { feature } from 'topojson-client';
import { SIMS } from '../../src/registry.js';
import { buildHubWorld, splitAtLon, clipRing, compactPath, HUB_WORLD } from '../../scripts/atlas/hub_world.mjs';
import { hubUnits, worldTree, cardTree } from '../../src/atlas/hubData.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const topo = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'world-atlas', 'countries-110m.json'), 'utf8'));
const table = JSON.parse(readFileSync(join(ROOT, 'scripts', 'atlas', 'hub_world_units.json'), 'utf8'));
const committed = JSON.parse(readFileSync(HUB_WORLD, 'utf8'));

test('단원표: 나라 177 모두 단원이 있음(빠진 나라 0), 값은 u2~u6 또는 나눔 규칙', () => {
  const geoms = topo.objects.countries.geometries;
  for (const g of geoms) {
    const v = table[g.id || g.properties.name];
    assert.ok(v, `빠짐: ${g.id} ${g.properties.name}`);
    if (typeof v === 'object') assert.ok(Number.isFinite(v.split) && /^u[2-6]$/.test(v.west) && /^u[2-6]$/.test(v.east));
    else assert.match(v, /^u[2-6]$/);
  }
  assert.equal(Object.keys(table).length, geoms.length);
  assert.deepEqual(table['643'], { split: 60, west: 'u3', east: 'u2' }); // 러시아
  assert.equal(table['304'], 'u5'); // 그린란드
  assert.equal(table['010'], 'u6'); // 남극
});

test('러시아 60°E 나눔: 두 쪽 넓이 합 = 전체, 서쪽은 약 1/4(날짜 변경선 추코트카는 동쪽)', () => {
  const ru = feature(topo, topo.objects.countries.geometries.find((g) => g.id === '643')).geometry;
  const { west, east } = splitAtLon(ru, 60);
  const [a, w, e] = [geoArea(ru), geoArea(west), geoArea(east)];
  assert.ok(Math.abs(w + e - a) / a < 0.01, `${w}+${e} vs ${a}`);
  assert.ok(w / a > 0.18 && w / a < 0.3, `서쪽 비 ${w / a}`);
  for (const poly of east.coordinates) for (const p of poly[0]) assert.ok(p[0] >= 60);
});

test('clipRing·compactPath', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.deepEqual(clipRing(sq, 5, true), [[0, 0], [5, 0], [5, 10], [0, 10], [0, 0]]);
  assert.equal(clipRing(sq, -1, true), null);
  assert.equal(compactPath('M1,1L1,1L2,2L3,1ZM5,5L5,5L5,5Z'), 'M1,1L2,2L3,1Z');
  assert.equal(compactPath('M0,0L4,4'), 'M0,0L4,4');
});

test('hubWorld.json 은 스크립트 결과와 같고(최신), 단원 다섯 경로 있음, 크기 ≤ 70KB', () => {
  const { splitCount, ...fresh } = buildHubWorld();
  assert.equal(splitCount, 2);
  assert.deepEqual(committed, fresh, 'node scripts/atlas/hub_world.mjs 로 다시 만드세요');
  for (const u of ['u2', 'u3', 'u4', 'u5', 'u6']) {
    assert.ok(committed.units[u].d.length > 1000, u);
    const [x, y] = committed.units[u].label;
    assert.ok(x > 0 && x < committed.w && y > 0 && y < committed.h, `${u} 이름표 안`);
  }
  assert.ok(JSON.stringify(committed).length <= 70_000);
});

const versions = JSON.parse(readFileSync(join(ROOT, 'docs', 'versions.json'), 'utf8'));
const units = hubUnits({ sims: SIMS, versions });

function walk(node, fn) {
  if (!Array.isArray(node)) return;
  fn(node);
  node.slice(2).forEach((k) => walk(k, fn));
}

test('worldTree: 단원 6 영역, 공개 = SVG 링크(카드와 같은 주소·새 창), 준비 중 = 흐린 g, 탭 순서 Ⅰ→Ⅵ', () => {
  const tree = worldTree(units, committed, { newTab: true });
  assert.equal(tree[0], 'svg');
  const areas = [];
  walk(tree, (n) => { if (n[1]?.dataset?.unit) areas.push(n); });
  const ids = new Set(areas.map((n) => n[1].dataset.unit));
  assert.equal(ids.size, 6);
  for (const u of units) {
    const mine = areas.filter((n) => n[1].dataset.unit === u.id);
    const card = cardTree(u, { newTab: true });
    for (const n of mine) {
      if (u.status === 'published') {
        assert.equal(n[0], '@sa');
        assert.equal(n[1].href, card[1].href);
        assert.equal(n[1].target, '_blank');
      } else {
        assert.equal(n[0], 'g');
        assert.match(n[1].class, /is-planned/);
      }
    }
  }
  const tabbable = areas.filter((n) => n[0] === '@sa' && n[1].tabindex !== '-1').map((n) => n[1].dataset.unit);
  const order = units.filter((u) => u.status === 'published').map((u) => u.id);
  assert.deepEqual(tabbable, order);
  const labels = [];
  walk(tree, (n) => { if (n[0] === 'text') labels.push(n); });
  assert.equal(labels.length, 6);
});

test('worldTree hrefOf: Pages 보기 페이지는 #<id>', () => {
  const tree = worldTree(units, committed, { hrefOf: (u) => `#${u.id}` });
  walk(tree, (n) => { if (n[0] === '@sa') { assert.equal(n[1].href, `#${n[1].dataset.unit}`); assert.equal(n[1].target, undefined); } });
});

test('worldTree: 공개 전 단원은 누를 수 없는 흐린 g(Ⅰ 공개 기록을 빼고 시험)', () => {
  const { 'atlas-u1-world': _u1, ...v } = versions;
  const tree = worldTree(hubUnits({ sims: SIMS, versions: v }), committed);
  const u1 = [];
  walk(tree, (n) => { if (n[1]?.dataset?.unit === 'atlas-u1-world') u1.push(n); });
  assert.ok(u1.length >= 1);
  for (const n of u1) { assert.equal(n[0], 'g'); assert.match(n[1].class, /is-planned/); assert.equal(n[1].href, undefined); }
});
