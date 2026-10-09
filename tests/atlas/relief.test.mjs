// tests/atlas/relief.test.mjs — 지형 음영(relief.js) 순수 함수: 경위도 → 이미지 좌표, 양선형 표본(날짜변경선 감싸기·극 자르기),
// 밝기 곡선(평지 = 흰색), 화면 격자 역투영(마디만 정확히 + 칸 안은 보간, 틈·이음매는 정확히), 격자 크기 고르기, RGBA 만들기.
// 이미지 불러오기·캔버스 합성은 헤드리스 Chrome 캡처로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lonLatToImage, sampleBilinear, reliefLut, invertGrid, nextStep, shadeGrid, RELIEF_URL, RELIEF_STYLE,
} from '../../src/atlas/relief.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b}`);

test('공개 주소와 기본 모양값', () => {
  assert.equal(RELIEF_URL, 'https://yhk1m.github.io/donga-social-sims/assets/atlas/common/relief-4096.jpg');
  assert.ok(RELIEF_STYLE.opacity > 0 && RELIEF_STYLE.opacity <= 1);
});

test('lonLatToImage: 픽셀 가운데 기준(등장방형 −180..180, 90..−90), 경도는 감싸기', () => {
  const W = 360, H = 180; // 1°/px
  assert.deepEqual(lonLatToImage(-179.5, 89.5, W, H), [0, 0]);
  assert.deepEqual(lonLatToImage(179.5, -89.5, W, H), [359, 179]);
  assert.deepEqual(lonLatToImage(0.5, 0.5, W, H), [180, 89]);
  const [a] = lonLatToImage(190.5, 0, W, H), [b] = lonLatToImage(-169.5, 0, W, H);
  near(a, b, 1e-9, '경도 감싸기');
  const [c] = lonLatToImage(-720 + 0.5, 0, W, H);
  near(c, 180, 1e-9, '여러 바퀴 감싸기');
});

test('sampleBilinear: 상수 이미지는 상수, 두 픽셀 사이는 평균, 날짜변경선 건너 감싸기, 극은 자르기', () => {
  const W = 4, H = 2;
  const flat = new Uint8Array(W * H).fill(77);
  near(sampleBilinear(flat, W, H, 12.3, -40), 77, 1e-9);
  // 0행: 10 20 30 40, 1행: 50 60 70 80 (경도 90°/px, 위도 90°/px)
  const img = Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80]);
  near(sampleBilinear(img, W, H, -135, 45), 10, 1e-9, '픽셀 가운데');
  near(sampleBilinear(img, W, H, -90, 45), 15, 1e-9, '가로 가운데');
  near(sampleBilinear(img, W, H, -135, 0), 30, 1e-9, '세로 가운데');
  near(sampleBilinear(img, W, H, 180, 45), 25, 1e-9, '날짜변경선: 마지막 열(40)과 첫 열(10) 평균');
  near(sampleBilinear(img, W, H, -180, 45), 25, 1e-9, '−180 = 180');
  near(sampleBilinear(img, W, H, -135, 90), 10, 1e-9, '북극은 첫 행으로 자름');
  near(sampleBilinear(img, W, H, -135, -90), 50, 1e-9, '남극은 끝 행으로 자름');
});

test('reliefLut: 평지(ref) 이상은 흰색(곱하기에서 그대로), 어두울수록 어둡게, 단조', () => {
  const lut = reliefLut({ ref: 200, gamma: 1 });
  assert.equal(lut.length, 256);
  assert.equal(lut[200], 255);
  assert.equal(lut[255], 255);
  assert.equal(lut[0], 0);
  near(lut[100], 127.5, 0.6);
  for (let i = 1; i < 256; i++) assert.ok(lut[i] >= lut[i - 1], `단조 ${i}`);
  const g = reliefLut({ ref: 200, gamma: 1.5 });
  assert.ok(g[100] < lut[100], 'gamma > 1 이면 그늘이 더 짙게');
  assert.equal(g[200], 255);
});

// 가짜 투영들(화면 xy → 경위도)
const linear = ([x, y]) => [x * 0.5 - 100, 60 - y * 0.15]; // 위도 60 … −55
test('invertGrid: 매끈한 투영은 마디만 정확히 역투영하고 칸 안은 보간 — 결과는 정확한 값과 같음', () => {
  let calls = 0;
  const inv = (p) => { calls++; return linear(p); };
  const g = invertGrid(inv, 1024, 768, { step: 2, block: 4 });
  assert.equal(g.cols, 512); assert.equal(g.rows, 384);
  for (const [i, j] of [[0, 0], [511, 383], [37, 201], [256, 100]]) {
    const [lon, lat] = linear([(i + 0.5) * 2, (j + 0.5) * 2]);
    near(g.lon[j * g.cols + i], lon, 1e-9, `lon ${i},${j}`);
    near(g.lat[j * g.cols + i], lat, 1e-9, `lat ${i},${j}`);
  }
  assert.ok(calls < (512 * 384) / 6, `역투영 ${calls}번 — 표본 수보다 훨씬 적어야`);
  assert.equal(g.exact, 0, '매끈하면 정확 계산으로 내려간 칸 없음');
});

test('invertGrid: 날짜변경선(경도가 180 → −180 으로 뛰는 곳)도 보간이 맞는 경도를 냄', () => {
  const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
  const inv = ([x, y]) => [wrap(170 + x * 0.1), 10 - y * 0.1]; // x=100 에서 180 을 넘음
  const g = invertGrid(inv, 200, 40, { step: 2, block: 4 });
  for (let i = 0; i < g.cols; i++) {
    const want = wrap(170 + (i + 0.5) * 2 * 0.1);
    const got = wrap(g.lon[5 * g.cols + i]);
    near(Math.abs(got - want) > 180 ? 360 - Math.abs(got - want) : got - want, 0, 1e-9, `열 ${i}`);
  }
});

test('invertGrid: 지도 밖(null)·틈은 NaN, 틈에 걸친 칸은 정확히 계산', () => {
  // x 300..340 은 틈(구드 단속처럼), 그 양쪽은 경도가 크게 다른 두 조각
  const inv = ([x, y]) => (x >= 300 && x < 340 ? null : x < 300 ? [x * 0.1, 50 - y * 0.1] : [x * 0.1 + 60, 50 - y * 0.1]);
  const g = invertGrid(inv, 640, 64, { step: 2, block: 4 });
  for (let i = 0; i < g.cols; i++) {
    const x = (i + 0.5) * 2, k = 7 * g.cols + i;
    const want = inv([x, 15]);
    if (!want) { assert.ok(Number.isNaN(g.lon[k]), `틈 ${i}`); continue; }
    near(g.lon[k], want[0], 1e-9, `열 ${i}`);
    near(g.lat[k], want[1], 1e-9, `열 ${i}`);
  }
  assert.ok(g.exact > 0, '틈에 걸친 칸은 정확 계산');
});

test('invertGrid: 마디는 모두 맞지만 안쪽이 휘면(보간 검사 실패) 정확히 계산', () => {
  // 칸 가운데에서만 크게 휘는 투영: 가운데 검사로 걸러야 함
  const inv = ([x, y]) => [x * 0.1 + 5 * Math.sin(x * Math.PI / 8), y * 0.1];
  const g = invertGrid(inv, 160, 32, { step: 2, block: 4 });
  for (let i = 0; i < g.cols; i++) {
    const x = (i + 0.5) * 2;
    near(g.lon[3 * g.cols + i], inv([x, 7])[0], 1e-9, `열 ${i}`);
  }
  assert.ok(g.exact > 0);
});

test('invertGrid: 화면 크기가 step 의 배수가 아니어도 끝까지 덮음', () => {
  const g = invertGrid(linear, 101, 51, { step: 3, block: 4 });
  assert.equal(g.cols, 34); assert.equal(g.rows, 17);
  const k = 16 * g.cols + 33;
  near(g.lon[k], linear([(33 + 0.5) * 3, (16 + 0.5) * 3])[0], 1e-9);
});

test('nextStep: 예산(150ms)을 넘으면 격자를 키우고, 아주 빠르면 줄인다(2~4px)', () => {
  assert.equal(nextStep(2, 40), 2);
  assert.equal(nextStep(2, 151), 3);
  assert.equal(nextStep(3, 200), 4);
  assert.equal(nextStep(4, 400), 4);
  assert.equal(nextStep(3, 30), 2);
  assert.equal(nextStep(3, 90), 3);
  assert.equal(nextStep(2, 10), 2);
  assert.equal(nextStep(2, 100, { budget: 50 }), 3);
});

test('shadeGrid: 경위도 격자 → RGBA(회색 = 곡선 거친 표본, NaN 은 투명)', () => {
  const W = 2, H = 2; // 0행 100 100, 1행 200 200
  const img = Uint8Array.from([100, 100, 200, 200]);
  const grid = { cols: 3, rows: 1, lon: Float64Array.from([-90, NaN, 90]), lat: Float64Array.from([45, 0, -45]) };
  const lut = reliefLut({ ref: 200, gamma: 1 });
  const out = new Uint8ClampedArray(3 * 4);
  shadeGrid(grid, { width: W, height: H, data: img }, lut, out);
  assert.deepEqual([...out.slice(0, 4)], [lut[100], lut[100], lut[100], 255]);
  assert.equal(out[7], 0, 'NaN 은 투명');
  assert.deepEqual([...out.slice(8, 12)], [255, 255, 255, 255]);
});

test('invertGrid: 보간 허용 오차는 칸 크기에 비례(세계 보기처럼 칸이 넓으면 표본 간격의 1/4 안이면 보간)', () => {
  // 경도가 x 에 대해 휘는(2차) 투영: 칸 가운데 오차 ≈ 0.032°(절대 0.01 은 넘지만 표본 간격 0.4°+ 의 1/4 안)
  const inv = ([x, y]) => [0.2 * x + 0.002 * x * x - 100, 40 - y * 0.2];
  const g = invertGrid(inv, 640, 64, { step: 2, block: 4 });
  assert.equal(g.exact, 0, '모두 보간');
  for (let i = 0; i < g.cols; i++) {
    const x = (i + 0.5) * 2, want = inv([x, 0])[0], spacing = (0.2 + 0.004 * x) * 2;
    assert.ok(Math.abs(g.lon[i] - want) <= spacing / 4, `열 ${i}: ${g.lon[i]} vs ${want}`);
  }
});

test('invertGrid: 네 마디와 가운데가 모두 지도 밖인 칸은 표본마다 다시 구하지 않고 비워 둠(skipped)', () => {
  let calls = 0;
  const inv = ([x, y]) => { calls++; return x < 100 ? [x * 0.1, y * 0.1] : null; }; // 오른쪽은 모두 지도 밖
  const g = invertGrid(inv, 400, 40, { step: 2, block: 4 });
  assert.ok(g.skipped > 0);
  const nodes = (Math.floor((g.cols - 1) / 4) + 2) * (Math.floor((g.rows - 1) / 4) + 2);
  assert.ok(calls < nodes * 2 + 16 * 10, `역투영 ${calls}번(지도 밖 칸을 표본마다 구하면 안 됨)`);
  assert.ok(Number.isNaN(g.lon[5 * g.cols + 150]));
  near(g.lon[5 * g.cols + 10], 2.1, 1e-9);
});

test('invertGrid: forward 를 주면 마디·가운데를 되돌려 검사 — 지도 밖에서 엉뚱한 유한값을 내는 invert(로빈슨)도 지도 밖으로 봄', () => {
  let calls = 0;
  // 지도 = x < 100. 그 밖에서 invert 는 위도 수백만 같은 값을 내지만 forward 로 되돌리면 자리가 안 맞음
  const invert = ([x, y]) => { calls++; return x < 100 ? [x * 0.1, 40 - y * 0.1] : [x * 0.1, 1e6 + x]; };
  const forward = ([lon, lat]) => (lat > 90 ? [NaN, NaN] : [lon * 10, (40 - lat) * 10]);
  const g = invertGrid(invert, 400, 40, { step: 2, block: 4, forward });
  assert.ok(g.skipped > 0, '지도 밖 칸은 건너뜀');
  assert.ok(calls < 1500, `역투영 ${calls}번`);
  assert.ok(Number.isNaN(g.lon[5 * g.cols + 150]));
  near(g.lon[5 * g.cols + 10], 2.1, 1e-9);
  near(g.lat[5 * g.cols + 10], 40 - 1.1, 1e-9);
});

test('invertGrid: 위도가 ±90 을 넘는 역투영 값은 지도 밖', () => {
  const g = invertGrid(([x, y]) => [x, 95], 16, 16, { step: 2, block: 4 });
  assert.ok(g.lon.every(Number.isNaN));
});
