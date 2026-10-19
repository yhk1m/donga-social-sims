// tests/atlas/labelLayout.test.mjs — 지명 보조 계산: 글자 크기, 줄 줄이기(자간 상한), 글자별·세로 배치, 투영한 줄 끊김
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProjection } from '../../src/atlas/projections.js';
import { fontPx, trimPath, glyphLayout, pathBroken } from '../../src/atlas/labelLayout.js';

const W = 1024, H = 768;
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('pathBroken: 투영한 줄이 틈·이음매를 건너뛰면 true(적도 근처 구드 틈은 1px 남짓이라 이어진 것으로 봄)', () => {
  const g = makeProjection('goode', { centerLon: 0, width: W, height: H });
  const m = makeProjection('miller', { centerLon: 0, width: W, height: H });
  const south = [[75, -30], [85, -30]]; // 구드 남반구 80°E 단속선을 건넘
  assert.equal(pathBroken(south, g), true);
  assert.equal(pathBroken(south, m), false);
  assert.equal(pathBroken([[76.77, -4.26], [83.08, -4.27]], g), false);
  const pac = [[170, 10], [-170, 10]]; // 중심 0° 에서는 날짜변경선 이음매
  assert.equal(pathBroken(pac, m), true);
  const m150 = makeProjection('miller', { centerLon: 150, width: W, height: H });
  assert.equal(pathBroken(pac, m150), false);
  assert.equal(pathBroken([[56.13, 53.13], [56.64, 56.43], [54.88, 60.44], [54.53, 64.02]], m), false);
});

test('글자 크기: 교과서 pt → 화면 px, 작은 글자도 10.5px 이상', () => {
  assert.equal(fontPx(5.4), 10.5);
  assert.ok(fontPx(12.4) > 14 && fontPx(12.4) < 17);
  assert.ok(fontPx(4) >= 10.5);
});

test('trimPath: 줄이 길면 가운데 len 만큼만(자간 상한), 짧으면 그대로', () => {
  const pts = [[0, 0], [100, 0], [100, 100]]; // 길이 200, 가운데 = (100, 0)
  const t = trimPath(pts, 50);
  assert.deepEqual(t, [[75, 0], [100, 0], [100, 25]]);
  assert.deepEqual(trimPath(pts, 500), pts);
  assert.deepEqual(trimPath([[0, 0], [10, 0]], 4), [[3, 0], [7, 0]]);
});

test('glyphLayout: 완만한 곧은 지명은 한 덩어리(null), 가파르면 글자를 세워 위→아래로', () => {
  const measure = () => 10;
  assert.equal(glyphLayout({ name: '가나', at: [0, 0], angle: 20, spacing: 0, span: 20, size: 10 }, measure), null);
  // 아래로 내려가는 줄(+80°): 첫 글자가 위
  const down = glyphLayout({ name: '가나다', at: [0, 0], angle: 80, spacing: 5, span: 40, size: 10 }, measure);
  assert.equal(down.upright, true);
  assert.deepEqual(down.glyphs.map((g) => g.ch), ['가', '나', '다']);
  assert.ok(down.glyphs[0].at[1] < down.glyphs[2].at[1]);
  assert.ok(down.glyphs.every((g) => g.angle === 0));
  close(down.glyphs[1].at[0], 0, 1e-9); close(down.glyphs[1].at[1], 0, 1e-9);
  // 올라가는 줄(−80°): 글자 순서를 뒤집어 여전히 위→아래로 읽힘
  const up = glyphLayout({ name: '가나다', at: [0, 0], angle: -80, spacing: 5, span: 40, size: 10 }, measure);
  assert.deepEqual(up.glyphs.map((g) => g.ch), ['가', '나', '다']);
  assert.ok(up.glyphs[0].at[1] < up.glyphs[2].at[1]);
  // 굽은 줄(glyphs)이 가파르면 세움, 완만하면 그대로(회전 유지)
  const curved = { name: '가나다', glyphs: [{ ch: '가', at: [0, 30], angle: -70 }, { ch: '나', at: [5, 15], angle: -75 }, { ch: '다', at: [8, 0], angle: -80 }], angle: -75, size: 10 };
  const c = glyphLayout(curved, measure);
  assert.equal(c.upright, true);
  assert.deepEqual(c.glyphs.map((g) => [g.ch, g.at]), [['가', [8, 0]], ['나', [5, 15]], ['다', [0, 30]]]);
  const gentle = { name: '가나', glyphs: [{ ch: '가', at: [0, 0], angle: 10 }, { ch: '나', at: [10, 3], angle: 25 }], angle: 18, size: 10 };
  assert.deepEqual(glyphLayout(gentle, measure), { upright: false, glyphs: gentle.glyphs });
});
