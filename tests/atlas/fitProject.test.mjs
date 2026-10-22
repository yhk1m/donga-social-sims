// tests/atlas/fitProject.test.mjs — 앱용 교과서 투영식(src/atlas/fitProject.js)이 추출 파이프라인(scripts/atlas/georef.mjs makeConverter.apply)과 같은 값을 내는지
// (둘 다 src/atlas/fitCore.js 를 쓰므로 구성상 같아야 한다 — 이 테스트는 그 연결이 끊기지 않았는지 본다)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFitForward } from '../../src/atlas/fitProject.js';
import { makeConverter } from '../../scripts/atlas/georef.mjs';
import { browserFit } from '../../scripts/atlas/pt2lonlat.mjs';
import { REPO, WORK, readJson } from '../../scripts/atlas/geo_util.mjs';

const samples = () => {
  const out = [];
  for (let lon = 30; lon <= 170; lon += 7) for (let lat = -10; lat <= 78; lat += 6) out.push([lon, lat]);
  return out;
};
function same(fit, full, tol = 1e-6) {
  const fwd = makeFitForward(fit), cv = makeConverter(full);
  let n = 0;
  for (const ll of samples()) {
    const a = fwd(ll), b = cv.apply(ll);
    if (!b) { assert.equal(a, null, `${ll}`); continue; }
    assert.ok(a, `${ll}`);
    assert.ok(Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol, `${ll}: ${a} ≠ ${b}`);
    n++;
  }
  assert.ok(n > 100);
}

test('밀도 음영 JSON 의 fit(azimuthalEqualArea, TPS 없음) = georef 지면 좌표', () => {
  const ov = readJson(path.join(REPO, 'sims/atlas-u2-asia/data/overlay-p23-density.json'));
  assert.ok(ov.fit?.family && ov.fit.sim, 'overlay JSON 에 fit');
  same(ov.fit, { id: 'ov', ...ov.fit });
});

test('저장소 안 TPS 고정 자료(fixtures/fit-tps.json): 8개 도법 모두 georef 와 같은 값(껍질 안·줄어드는 띠·밖 모두 지남)', () => {
  const fx = readJson(path.join(REPO, 'tests/atlas/fixtures/fit-tps.json'));
  assert.equal(fx.cases.length, 8);
  for (const c of fx.cases) {
    const fit = { family: c.family, params: c.params, sim: fx.sim, tps: fx.tps };
    same(fit, { id: `fx-${c.family}`, ...fit }, 1e-9);
  }
  // 보정이 실제로 걸리는지(껍질 안 = 0 이 아님, 먼 밖 = 0)
  const fit = { family: 'azimuthalEqualArea', params: [100, 40], sim: fx.sim, tps: fx.tps };
  const withT = makeFitForward(fit), noT = makeFitForward({ ...fit, tps: undefined });
  const moved = samples().filter((ll) => { const a = withT(ll), b = noT(ll); return a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01; }).length;
  const still = samples().filter((ll) => { const a = withT(ll), b = noT(ll); return a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) === 0; }).length;
  assert.ok(moved > 20 && still > 20, `보정 ${moved}, 그대로 ${still}`);
});

test('TPS 보정이 있는 실제 fit(p16-asia, 작업 폴더에 있을 때)도 같은 값', (t) => {
  const f = `${WORK}/geo/p16-asia.fit.json`;
  if (!fs.existsSync(f)) { t.skip('작업 폴더에 p16-asia fit 없음'); return; }
  const full = readJson(f);
  assert.ok(full.tps);
  same(browserFit(full), full, 1e-9);
});

test('모든 도법 이름을 안다, 모르는 이름은 오류', () => {
  for (const family of ['azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson', 'equirectangular', 'mercator']) {
    const params = family.startsWith('conic') ? [100, 25, 50] : [100, 40];
    const fwd = makeFitForward({ family, params, sim: { a: 100, b: 0, tx: 0, ty: 0 } });
    const p = fwd([100, 30]);
    assert.ok(p && p.every(Number.isFinite), family);
  }
  assert.throws(() => makeFitForward({ family: 'nope', params: [], sim: { a: 1, b: 0, tx: 0, ty: 0 } }), /도법/);
});

test('U6-3a 극 중심 정거 방위 고정 후보 fit(params [0, ±90] · 지면 회전)도 앱 계산 = georef 지면 좌표', async () => {
  const { geoAzimuthalEquidistant } = await import('d3-geo');
  const { fitControls } = await import('../../scripts/atlas/georef.mjs');
  for (const sign of [90, -90]) {
    const P = geoAzimuthalEquidistant().rotate([-40, -sign]).scale(300).translate([400, 360]);
    const t = 0.4, cps = [];
    for (let lon = -180; lon < 180; lon += 30) for (const lat of [55, 65, 75, 85]) {
      const [x, y] = P([lon, sign > 0 ? lat : -lat]);
      cps.push({ xy: [400 + Math.cos(t) * (x - 400) - Math.sin(t) * (y - 360), 360 + Math.sin(t) * (x - 400) + Math.cos(t) * (y - 360)], lon, lat: sign > 0 ? lat : -lat });
    }
    const fit = fitControls(cps, [{ family: 'azimuthalEquidistant', params: [0, sign] }]);
    assert.equal(fit.fixed, true);
    const full = { id: `polar${sign}`, ...fit };
    same(browserFit(full), full, 1e-9);
  }
});
