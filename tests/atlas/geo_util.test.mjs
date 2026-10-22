// © 2026 김용현
// tests/atlas/geo_util.test.mjs — 아틀라스 Node 공용 도구 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { key, km, median, cmp } from '../../scripts/atlas/geo_util.mjs';
import { merge } from '../../scripts/atlas/build_places.mjs';

test('key·km·median', () => {
  assert.equal(key('고비 사막'), key('고비사막'));
  assert.ok(Math.abs(km([126.98, 37.57], [139.69, 35.69]) - 1153) < 10);   // 서울–도쿄
  assert.equal(median([3, 1, 2]), 2);
  assert.ok(Number.isNaN(median([])));
});

test('cmp 는 NaN·Infinity 에서도 일관된 순서', () => {
  assert.equal(cmp(Infinity, Infinity), 0);
  assert.equal(cmp(NaN, 1), 1); assert.equal(cmp(1, NaN), -1); assert.equal(cmp(NaN, NaN), 0);
  assert.deepEqual([3, NaN, 1, Infinity].sort(cmp), [1, 3, Infinity, NaN]);
});

test('merge: 축척을 모르는 지도(Infinity)가 섞여도 위치는 기호 있는 큰 축척 출현', () => {
  const o = (map, scale, symbol, ll) => ({ name: 'A', kind: 'city', point: true, ll, size: 5.7, page: 16, map, scale, overview: map === 'ov', ...(symbol ? { symbol } : {}) });
  const [p] = merge([o('x', Infinity, true, [100, 10]), o('y', Infinity, true, [100.01, 10]), o('ov', 4e7, true, [100.02, 10])]);
  assert.deepEqual([p.lon, p.lat], [100.02, 10]);
});

// ── neBox 상자 목록(U6-2 선행 — 오세아니아: 날짜변경선 건너 둘 + 극 둘레) ─────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { neBoxes, inNeBox, neIndex } from '../../scripts/atlas/geo_util.mjs';
import u6cfg from '../../scripts/atlas/config/u6.json' with { type: 'json' };

test('neBoxes·inNeBox: 상자 하나는 예전 비교 그대로, 상자 목록은 어느 상자든, 경도 최소 > 최대는 날짜변경선 건넘', () => {
  const one = [20, -15, 180, 82];
  assert.deepEqual(neBoxes(one), [one]);
  for (const [lon, lat] of [[20, -15], [180, 82], [100, 0], [19.9, 0], [100, 82.1], [-170, 10], [126.98, 37.57]]) {
    const old = !(lon < 20 || lon > 180 || lat < -15 || lat > 82);
    assert.equal(inNeBox(one, lon, lat), old, `${lon},${lat}`);
  }
  const list = u6cfg.places.neBox;
  assert.equal(neBoxes(list).length, 4);
  assert.ok(inNeBox(list, 151.2, -33.9));     // 시드니(48쪽 서쪽 상자)
  assert.ok(inNeBox(list, -171.8, -13.8));    // 아피아(날짜변경선 건너 동쪽 상자)
  assert.ok(inNeBox(list, -157.9, 21.3));     // 호놀룰루(동쪽 상자 위 끝 25°N 안)
  assert.ok(inNeBox(list, 25, 70));           // 북극 둘레
  assert.ok(inNeBox(list, -60, -62));         // 남극 둘레
  assert.ok(!inNeBox(list, 2.35, 30));        // 사하라 — 어느 상자에도 없음
  assert.ok(!inNeBox(list, -100, 20));        // 멕시코 — 동쪽 상자(−150° 까지) 밖
  const wrap = [170, -30, -170, 0];           // 날짜변경선 건넌 상자 하나
  assert.ok(inNeBox(wrap, 175, -10) && inNeBox(wrap, -175, -10) && inNeBox(wrap, 180, -10));
  assert.ok(!inNeBox(wrap, 0, -10) && !inNeBox(wrap, 175, 5));
  for (const bad of [undefined, [1, 2, 3], [[1, 2, 3, 4], [1, 2, 'x', 4]], [[1, 2, 3, NaN]]]) assert.throws(() => neBoxes(bad), /neBox/);
});

test('neIndex: 상자 목록이면 어느 상자 안 지점만, 상자 하나는 예전 거르기 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebox-'));
  const file = path.join(dir, 'pp.geojson');
  const pt = (ko, en, lon, lat) => ({ type: 'Feature', properties: { NAME_KO: ko, NAME: en }, geometry: { type: 'Point', coordinates: [lon, lat] } });
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features: [
    pt('시드니', 'Sydney', 151.2, -33.9), pt('아피아', 'Apia', -171.8, -13.8), pt('나이로비', 'Nairobi', 36.8, -1.3),
    pt('롱이어비엔', 'Longyearbyen', 15.6, 78.2), pt('해밀턴', 'Hamilton', 175.3, -37.8), pt('해밀턴', 'Hamilton', -79.9, 43.3) ] }));
  try {
    const byList = neIndex(file, u6cfg.places.neBox);
    assert.deepEqual([...byList.keys()].sort(), ['롱이어비엔', '시드니', '아피아', '해밀턴'].sort());
    assert.deepEqual(byList.get('해밀턴').map((p) => p.ne + p.lon), ['Hamilton175.3', 'Hamilton-79.9']);   // 캐나다 해밀턴은 북위 35° 넘어 극 둘레 상자 안
    const byOne = neIndex(file, [100, -50, 180, 0]);
    assert.deepEqual([...byOne.keys()].sort(), ['시드니', '해밀턴'].sort());
    assert.equal(byOne.get('해밀턴').length, 1);
    assert.equal(neIndex(path.join(dir, 'none.geojson'), [0, 0, 1, 1]), null);
  } finally { fs.unlinkSync(file); fs.rmdirSync(dir); }
});
