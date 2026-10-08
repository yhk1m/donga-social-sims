// tests/atlas/labels.test.mjs — 지명 배치(D4): 우선순위·확대 수준·화면 밖·기호 옆 자리·선/면 지명(글자 줄 path)·회전 충돌·뒤집힘 방지
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels, MIN_K } from '../../src/atlas/labels.js';

const measure = (t, size) => t.length * size * 0.9;
const opts = (o = {}) => ({ width: 800, height: 600, measure, k: 1, ...o });
const deg = (a) => ((a % 360) + 540) % 360 - 180;

test('겹치면 rank 높은(숫자 작은) 지명만 남음', () => {
  const pts = [{ name: '베이징', rank: 1, xy: [100, 100], size: 13 }, { name: '톈진', rank: 3, xy: [104, 102], size: 11 }];
  const out = placeLabels(pts, opts({ k: 2 }));
  assert.deepEqual(out.map((o) => o.name), ['베이징']);
});

test('확대하면 작은 지명도 나타남(minK)', () => {
  const pts = [{ name: '톈진', rank: 4, xy: [300, 300], size: 11 }];
  assert.equal(placeLabels(pts, opts({ k: 1 })).length, 0);
  assert.equal(placeLabels(pts, opts({ k: 4 })).length, 1);
  assert.equal(MIN_K[1], 1);
  // 항목별 minK 가 등급표보다 앞선다
  assert.equal(placeLabels([{ ...pts[0], minK: 1 }], opts({ k: 1 })).length, 1);
});

test('화면 밖 지명은 제외', () => {
  assert.equal(placeLabels([{ name: 'A', rank: 1, xy: [-50, 10], size: 12 }], opts()).length, 0);
});

test('기호 있는 지명: 위 자리가 남의 기호를 가리면 오른쪽으로', () => {
  const pts = [
    { name: '서울', rank: 1, xy: [400, 300], size: 12, symbol: true },
    { name: '수원', rank: 2, xy: [400, 285], size: 12, symbol: true }, // 서울 글자 위 자리에 수원 기호가 있음
  ];
  const out = placeLabels(pts, opts());
  assert.equal(out.length, 2);
  const seoul = out.find((o) => o.name === '서울'), suwon = out.find((o) => o.name === '수원');
  assert.ok(seoul.at[0] > 400 && Math.abs(seoul.at[1] - 300) < 0.01, `서울은 오른쪽 ${seoul.at}`);
  assert.equal(seoul.angle, 0);
  assert.ok(suwon.at[1] < 285 && Math.abs(suwon.at[0] - 400) < 0.01, `수원은 위 ${suwon.at}`);
  // 기호 없는 지명은 제자리 가운데
  const [x] = placeLabels([{ name: '고비사막', rank: 1, xy: [300, 300], size: 12 }], opts());
  assert.deepEqual(x.at, [300, 300]);
});

test('선·면 지명(곧은 글자 줄): 줄 가운데에 줄 방향으로, 글자 사이를 벌림', () => {
  const p = { name: '황하', rank: 2, size: 12, pathXY: [[200, 300], [300, 300.5], [400, 301]] };
  const [o] = placeLabels([p], opts());
  assert.ok(o, '놓임');
  assert.equal(o.glyphs, undefined, '곧은 줄은 글자별 위치 없음');
  assert.ok(Math.abs(o.at[0] - 300) < 1 && Math.abs(o.at[1] - 300.5) < 1, `${o.at}`);
  assert.ok(Math.abs(o.angle - 0.29) < 0.2, `angle ${o.angle}`);
  assert.ok(o.spacing > 0, `spacing ${o.spacing}`); // 줄 길이 200 > 글자 폭 21.6 → 벌림(상한 maxSpread 배)
  assert.ok(o.span <= measure('황하', 12) * 3 + 0.01, `span ${o.span}`);
});

test('선·면 지명(짧은 줄): 줄이 글자보다 짧으면 가운데에 자연 간격', () => {
  const p = { name: '타클라마칸사막', rank: 1, size: 12, pathXY: [[300, 200], [310, 210]] };
  const [o] = placeLabels([p], opts());
  assert.ok(Math.abs(o.at[0] - 305) < 0.5 && Math.abs(o.at[1] - 205) < 0.5);
  assert.ok(Math.abs(o.angle - 45) < 0.01);
  assert.equal(o.spacing, 0);
});

test('선·면 지명(굽은 줄): 글자마다 줄 위 자리와 접선 각도', () => {
  // 중심 (400, 500), 반지름 200 원호 위쪽(왼→오른쪽): 각 200°→340°
  const pathXY = [];
  for (let a = 200; a <= 340; a += 10) pathXY.push([400 + 200 * Math.cos((a * Math.PI) / 180), 500 + 200 * Math.sin((a * Math.PI) / 180)]);
  const [o] = placeLabels([{ name: '히말라야산맥', rank: 1, size: 14, pathXY }], opts());
  assert.ok(o.glyphs, '굽은 줄은 글자별 위치');
  assert.equal(o.glyphs.map((g) => g.ch).join(''), '히말라야산맥');
  for (const g of o.glyphs) {
    const r = Math.hypot(g.at[0] - 400, g.at[1] - 500);
    assert.ok(Math.abs(r - 200) < 2, `원 위 ${r}`);
    assert.ok(g.angle > -90 && g.angle <= 90, `뒤집히지 않음 ${g.angle}`);
  }
  const a0 = o.glyphs[0].angle, a1 = o.glyphs.at(-1).angle;
  assert.ok(a1 - a0 > 20, `각이 바뀜 ${a0} → ${a1}`);
  assert.ok(o.glyphs[0].at[0] < o.glyphs.at(-1).at[0], '왼쪽에서 오른쪽으로 읽힘');
});

test('뒤집힘 방지: 오른쪽→왼쪽·아래로 향한 줄은 뒤집어 읽는 방향을 바로잡음(각도 ±90° 안)', () => {
  const [a] = placeLabels([{ name: '아무르강', rank: 2, size: 12, pathXY: [[500, 300], [300, 300]] }], opts());
  assert.ok(Math.abs(deg(a.angle)) < 0.01, `angle ${a.angle}`);
  const [b] = placeLabels([{ name: '메콩강', rank: 2, size: 12, pathXY: [[400, 100], [200, 300]] }], opts());
  assert.ok(Math.abs(b.angle - -45) < 0.01, `angle ${b.angle}`);
  // 굽은 줄도 뒤집힘(원호를 오른쪽→왼쪽으로 줘도 글자는 왼쪽부터)
  const pathXY = [];
  for (let a2 = 340; a2 >= 200; a2 -= 10) pathXY.push([400 + 200 * Math.cos((a2 * Math.PI) / 180), 500 + 200 * Math.sin((a2 * Math.PI) / 180)]);
  const [c] = placeLabels([{ name: '히말라야산맥', rank: 1, size: 14, pathXY }], opts());
  assert.ok(c.glyphs[0].at[0] < c.glyphs.at(-1).at[0]);
  assert.equal(c.glyphs[0].ch, '히');
  for (const g of c.glyphs) assert.ok(g.angle > -90 && g.angle <= 90);
});

test('회전 충돌: 대각선으로 엇갈리면 뒤 지명을 뺌, 나란한 대각선은 상자(AABB)가 겹쳐도 둘 다 놓음', () => {
  const A = { name: '가나다라마바', rank: 1, size: 12, pathXY: [[150, 150], [350, 350]] };
  const cross = { name: '사아자차카타', rank: 2, size: 12, pathXY: [[150, 350], [350, 150]] };
  assert.deepEqual(placeLabels([A, cross], opts()).map((o) => o.name), ['가나다라마바']);
  const parallel = { name: '사아자차카타', rank: 2, size: 12, pathXY: [[150, 210], [350, 410]] }; // 수직 거리 약 42px
  const out = placeLabels([A, parallel], opts());
  assert.deepEqual(out.map((o) => o.name), ['가나다라마바', '사아자차카타']);
  const [a, b] = out;
  assert.ok(a.bbox[0] < b.bbox[2] && b.bbox[0] < a.bbox[2] && a.bbox[1] < b.bbox[3] && b.bbox[1] < a.bbox[3], 'AABB 는 겹침');
  for (const o of out) assert.ok(o.boxes.length > 3, '표본 상자 여럿');
});

test('기호 지명과 선 지명도 서로 충돌을 봄', () => {
  const river = { name: '양쯔강양쯔강', rank: 1, size: 12, pathXY: [[200, 300], [400, 300]] };
  const city = { name: '우한', rank: 3, size: 12, xy: [300, 300] };
  assert.deepEqual(placeLabels([river, city], opts({ k: 2 })).map((o) => o.name), ['양쯔강양쯔강']);
});

test('각도만 있고 줄이 없으면 그 각도로 놓음', () => {
  const [o] = placeLabels([{ name: '서시베리아평원', rank: 2, size: 12, xy: [400, 300], angle: -20 }], opts());
  assert.ok(Math.abs(o.angle - -20) < 0.01 && Math.abs(o.at[0] - 400) < 0.01 && Math.abs(o.at[1] - 300) < 0.01);
});

test('순수 함수: 입력을 바꾸지 않고 같은 입력이면 같은 결과', () => {
  const pts = [{ name: '베이징', rank: 1, xy: [100, 100], size: 13 }, { name: '황하', rank: 2, size: 12, pathXY: [[200, 300], [400, 301]] }];
  const snap = JSON.stringify(pts);
  const a = placeLabels(pts, opts()), b = placeLabels(pts, opts());
  assert.equal(JSON.stringify(pts), snap);
  assert.deepEqual(a, b);
});
