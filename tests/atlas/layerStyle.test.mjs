// tests/atlas/layerStyle.test.mjs — 주제 레이어 순수 함수(src/atlas/layerStyle.js): 범례 투명도, 확대에 따른 크기, 곡선·화살촉, 선 나누기·거리, 이미지 색인, 색 맞추기
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaOf, zoomScale, symbolPx, flowWidthPx, lineWidthPx, barMetrics, bendControl, quadPath, arrowSize, endTangent, arrowHead, trimRunEnd, unwrapLine, joinParts,
  splitJumps, distToPolyline, lineLabelAt, imageIndex, parseHex, nearestColor, shapePath, legendItems, SHAPES,
} from '../../src/atlas/layerStyle.js';
import { createLegendState } from '../../src/atlas/legendState.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≠ ${b}`);

test('alphaOf: 범례가 없거나 활성 분류면 1, 다른 분류만 고른 상태면 dimAlpha', () => {
  assert.equal(alphaOf(null, 'c1', 0.15), 1);
  const L = createLegendState(['c1', 'c2']);
  assert.equal(alphaOf(L, 'c1', 0.15), 1);
  L.toggle('c2');
  assert.equal(alphaOf(L, 'c1', 0.15), 0.15);
  assert.equal(alphaOf(L, 'c2', 0.15), 1);
  // 범례에 없는 분류(범례 항목만 있는 지도 등)는 고른 분류가 있으면 흐리게
  assert.equal(alphaOf(L, 'zz', 0.2), 0.2);
});

test('zoomScale: 기준 확대에서 1, 위아래로 상한·하한', () => {
  near(zoomScale(2.2), 1);
  assert.ok(zoomScale(8) > 1 && zoomScale(8) <= 2);
  assert.ok(zoomScale(1) < 1 && zoomScale(1) >= 0.75);
  assert.equal(zoomScale(40), 2);
  assert.equal(zoomScale(0.01), 0.75);
  near(zoomScale(4, { ref: 1, exp: 0.5, min: 0, max: 10 }), 2);
});

test('symbolPx: 지면 pt 크기 → 화면 px, 확대에 따라 커지되 상한·하한', () => {
  const a = symbolPx(3.6, 2.2), b = symbolPx(3.6, 10);
  assert.ok(b > a);
  assert.ok(symbolPx(3.6, 40) <= 18 && symbolPx(0.1, 1) >= 4);
  assert.ok(symbolPx(2.2, 2.2) < symbolPx(3.6, 2.2), '작은 기호는 작게');
});

test('flowWidthPx·lineWidthPx: 굵기 단계 순서를 지키고 하한이 있다', () => {
  const ws = [0.6, 1, 1.5, 2].map((w) => flowWidthPx(w, 1.2));
  for (let i = 1; i < ws.length; i++) assert.ok(ws[i] > ws[i - 1]);
  assert.ok(flowWidthPx(0.6, 1) >= 1.2);
  assert.ok(flowWidthPx(2, 30) <= 9);
  assert.ok(lineWidthPx(1, 10) > lineWidthPx(1, 1));
  assert.ok(lineWidthPx(0.1, 1) >= 0.8);
});

test('barMetrics: 1억 명 칸 수만큼 쌓고, 칸 크기는 확대를 따르되 상한·하한', () => {
  const m = barMetrics(14, 2.2);
  assert.equal(m.cells, 14);
  near(m.height, 14 * m.cell + 13 * m.gap, 1e-9);
  assert.ok(m.width >= m.cell);
  assert.ok(barMetrics(14, 40).cell <= 12 && barMetrics(14, 1).cell >= 3);
  assert.equal(barMetrics(0, 2).cells, 1, '값이 없으면 한 칸');
});

test('bendControl: 두 점 가운데에서 수직으로 거리 × bend 만큼(진행 방향 왼쪽)', () => {
  const c = bendControl([0, 0], [100, 0], 0.2);
  near(c[0], 50); near(c[1], -20);
  const d = bendControl([0, 0], [0, 100], 0.1);
  near(d[0], 10); near(d[1], 50);
});

test('quadPath: 두 점은 이차 베지어 하나, 셋 이상은 가운데점을 지나는 이차 곡선 이음(끝점은 정확히)', () => {
  assert.equal(quadPath([[0, 0], [100, 0]], { bend: 0.2 }), 'M0,0Q50,-20 100,0');
  const d = quadPath([[0, 0], [10, 0], [10, 10], [20, 10]]);
  assert.equal(d, 'M0,0L5,0Q10,0 10,5Q10,10 15,10L20,10');
  assert.equal(quadPath([[1, 2]]), '');
  assert.equal(quadPath([]), '');
});

test('arrowSize: 선이 굵을수록 큰 화살촉, 하한이 있다', () => {
  const a = arrowSize(1), b = arrowSize(5);
  assert.ok(b.len > a.len && b.half > a.half);
  assert.ok(a.len >= 6 && a.half >= 3);
});

test('endTangent: 곡선 끝의 접선 방향(단위 벡터) — 꺾은선 곡선은 마지막 두 점, 두 점 베지어는 조절점 → 끝점', () => {
  const t = endTangent([[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(t.tip, [10, 10]);
  near(t.dir[0], 0); near(t.dir[1], 1);
  const u = endTangent([[0, 0], [100, 0]], { bend: 0.2 }); // 조절점 (50, −20) → 끝 (100, 0)
  near(u.dir[0], 50 / Math.hypot(50, 20)); near(u.dir[1], 20 / Math.hypot(50, 20));
  assert.equal(endTangent([[1, 1]]), null);
  assert.equal(endTangent([[1, 1], [1, 1]]), null, '길이 0');
});

test('arrowHead: 끝점이 화살 끝, 밑변은 진행 반대쪽 len, 폭 2·half 인 세모 경로', () => {
  const h = arrowHead([100, 50], [1, 0], 2);
  const { len, half } = arrowSize(2);
  assert.deepEqual(h.base, [100 - len, 50]);
  assert.equal(h.path, `M100,50L${100 - len},${50 + half}L${100 - len},${50 - half}Z`);
  const v = arrowHead([0, 0], [0, -1], 1); // 위쪽으로
  assert.ok(v.base[1] > 0);
});

test('trimRunEnd: 마지막 점을 진행 반대쪽으로 by 만큼 당긴다(마지막 마디가 짧으면 그대로), 원본은 그대로', () => {
  const run = [[0, 0], [10, 0], [30, 0]];
  assert.deepEqual(trimRunEnd(run, 5), [[0, 0], [10, 0], [25, 0]]);
  assert.deepEqual(run[2], [30, 0]);
  assert.deepEqual(trimRunEnd([[0, 0], [3, 0]], 5), [[0, 0], [3, 0]]);
});

test('unwrapLine·joinParts: 날짜변경선에서 나뉜 선을 경도가 이어지게 하나로', () => {
  assert.deepEqual(unwrapLine([[170, 0], [179, 1], [-179, 2], [-170, 3]]), [[170, 0], [179, 1], [181, 2], [190, 3]]);
  const j = joinParts([[[128, 37], [170, 45], [180, 50]], [[-180, 50], [-150, 48], [-114, 39]]]);
  assert.deepEqual(j, [[128, 37], [170, 45], [180, 50], [210, 48], [246, 39]]);
  assert.deepEqual(joinParts([[[1, 1], [2, 2]]]), [[1, 1], [2, 2]]);
});

test('splitJumps: 투영이 끊기는 곳(이음매·투영 못 함)에서 나눈다', () => {
  // 가짜 투영: 경도 > 180 이면 화면 왼쪽 끝으로 넘어감(대서양 중심 지도의 날짜변경선)
  const project = ([lon, lat]) => { const x = ((lon + 180) % 360 + 360) % 360 - 180; return [(x + 180) * 2, (90 - lat) * 2]; };
  const runs = splitJumps([[170, 0], [179, 0], [185, 0], [190, 0]], project);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].length, 2); assert.equal(runs[1].length, 2);
  // 이어진 선은 하나
  assert.equal(splitJumps([[0, 0], [10, 0], [20, 5]], project).length, 1);
  // 투영 못 하는 점에서 끊김
  const p2 = ([lon, lat]) => (lon === 10 ? null : [lon, lat]);
  assert.deepEqual(splitJumps([[0, 0], [5, 0], [10, 0], [15, 0], [20, 0]], p2).map((r) => r.length), [2, 2]);
  // 점 하나짜리 조각은 버림
  assert.equal(splitJumps([[0, 0], [10, 0], [20, 0]], p2).length, 0);
});

test('distToPolyline: 마디까지 가장 가까운 거리', () => {
  near(distToPolyline([5, 3], [[0, 0], [10, 0]]), 3);
  near(distToPolyline([-4, 3], [[0, 0], [10, 0]]), 5);
  near(distToPolyline([10, 5], [[0, 0], [10, 0], [10, 10]]), 0);
  assert.equal(distToPolyline([0, 0], [[3, 4]]), 5);
  assert.equal(distToPolyline([0, 0], []), Infinity);
});

test('lineLabelAt: 화면 안 가장 긴 조각의 가운데(길이 기준), 각도는 읽기 방향(−90~90)', () => {
  const r = lineLabelAt([[[0, 0], [10, 0]], [[0, 50], [100, 50], [100, 150]]], 1000, 1000);
  assert.deepEqual(r.at, [100, 50]);
  const s = lineLabelAt([[[100, 0], [0, 0]]], 1000, 1000);
  assert.deepEqual(s.at, [50, 0]);
  near(s.angle, 0);
  // 화면 밖 조각은 쓰지 않음
  assert.equal(lineLabelAt([[[-500, -500], [-400, -500]]], 100, 100), null);
});

test('imageIndex: 지면 pt → 이미지 화소(가운데 = 정수), 밖이면 null', () => {
  assert.deepEqual(imageIndex([0, 0], [0, 0, 100, 50], 200, 100), [-0.5, -0.5]);
  assert.deepEqual(imageIndex([50, 25], [0, 0, 100, 50], 200, 100), [99.5, 49.5]);
  assert.equal(imageIndex([101, 25], [0, 0, 100, 50], 200, 100), null);
  assert.equal(imageIndex([50, -1], [0, 0, 100, 50], 200, 100), null);
});

test('parseHex·nearestColor', () => {
  assert.deepEqual(parseHex('#0a10ff'), [10, 16, 255]);
  const pal = ['#9b2e33', '#ca4834', '#f9bb85', '#fcdcb1', '#fff4e3'].map(parseHex);
  assert.equal(nearestColor([155, 46, 51], pal), 0);
  assert.equal(nearestColor([250, 220, 180], pal), 3);
  assert.equal(nearestColor([255, 250, 240], pal), 4);
});

test('shapePath: 모든 모양이 반지름 1 상자 안의 닫힌 경로', () => {
  for (const sh of SHAPES) {
    const d = shapePath(sh);
    assert.ok(d.length > 0, sh);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    for (const v of nums) assert.ok(Math.abs(v) <= 1.0001, `${sh} ${v}`);
  }
  assert.equal(shapePath('nope'), shapePath('circle'));
});

test('legendItems: 레이어 범례 → 화면 범례 항목(밀도 음영 범례에는 분류 이름을 붙인다)', () => {
  const area = { type: 'FeatureCollection', properties: { legend: [{ cls: 'c1', color: '#111111', kind: 'fill', label: 'A', present: true }, { cls: 'x', color: '#222222', kind: 'fill', label: 'B', geometry: false, present: false }] }, features: [] };
  const a = legendItems(area);
  assert.deepEqual(a.map((e) => e.cls), ['c1', 'x']);
  assert.equal(a[1].geometry, false);
  const ov = { url: 'u', legend: [{ color: '#9b2e33', label: '200 이상' }, { color: '#fff4e3', label: '5 미만' }] };
  const o = legendItems(ov);
  assert.deepEqual(o.map((e) => e.cls), ['d1', 'd2']);
  assert.equal(o[0].kind, 'fill');
});

test('mapGridBlocks: 마디(block 간격)만 정확히 계산하고 칸 안은 보간 — 매끄러운 함수면 정확히 계산한 것과 거의 같고, 마디가 비면 그 칸은 하나하나', async () => {
  const { mapGridBlocks } = await import('../../src/atlas/layerStyle.js');
  const cols = 37, rows = 23;
  const lon = new Float64Array(cols * rows), lat = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { lon[j * cols + i] = 80 + i * 0.3; lat[j * cols + i] = 50 - j * 0.3; }
  lon[5 * cols + 9] = NaN; // 지도 밖 표본 하나
  let calls = 0;
  const f = ([x, y]) => { calls++; return x > 88 && y < 46 ? null : [Math.sin(x / 20) * 100, y * y / 10]; };
  const out = mapGridBlocks({ cols, rows, lon, lat }, f, { block: 4 });
  assert.ok(calls < cols * rows, `계산 ${calls}회`);
  let maxErr = 0;
  for (let k = 0; k < cols * rows; k++) {
    const e = Number.isNaN(lon[k]) ? null : f([lon[k], lat[k]]);
    if (!e) { assert.ok(Number.isNaN(out.x[k]), `밖 ${k}`); continue; }
    maxErr = Math.max(maxErr, Math.abs(out.x[k] - e[0]), Math.abs(out.y[k] - e[1]));
  }
  assert.ok(maxErr < 0.05, `최대 오차 ${maxErr}`);
});
