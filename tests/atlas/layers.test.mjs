// © 2026 김용현
// tests/atlas/layers.test.mjs — 주제 레이어(build_layers.mjs 생성물) 검사
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { convertPath, alignHole, countryClassLayerJson, decorateLegend } from '../../scripts/atlas/build_layers.mjs';

const DIR = 'sims/atlas-u2-asia/data';
const load = (id) => JSON.parse(readFileSync(`${DIR}/layer-${id}.json`, 'utf8'));
const classes = (gj) => new Set(gj.features.map((f) => f.properties.cls));

test('p21 기후 구분 레이어: 범례 분류마다 도형이 있고 경위도 범위가 아시아', () => {
  const gj = JSON.parse(readFileSync('sims/atlas-u2-asia/data/layer-p21-climate.json', 'utf8'));
  const classes = new Set(gj.features.map((f) => f.properties.cls));
  assert.ok(classes.size >= 8, `분류 ${classes.size}`);
  for (const f of gj.features) {
    const [lon, lat] = f.properties.centroid;
    assert.ok(lon > 20 && lon < 160 && lat > -15 && lat < 80, f.properties.cls);
  }
});

// 교과서 범례 개수(지면에서 센 값) = 레이어 분류 수
const EXPECT = {
  'p21-climate': { legend: 14, area: 14 },     // 13색 + 고산 기후(빗금)
  'p21-jan': { legend: 8, area: 7, lines: 'isotherm' },   // 강수량 7단계 + 등온선
  'p21-jul': { legend: 8, area: 7, lines: 'isotherm' },
  'p22-religion': { legend: 8, area: 8 },
  'p23-growth': { legend: 7, area: 7 },
  'p24-exports': { legend: 5, area: 5 },
  'p24-trade': { legend: 9, area: 7, lines: 'flow' },     // 교역액 7단계 + 수입·수출
  'p24-resources': { legend: 6, symbol: 6 },
  'p22-singapore': { legend: 5, symbol: 5 },
  'p23-density-cities': { legend: 1, symbol: 1 },
};

for (const [id, e] of Object.entries(EXPECT)) {
  test(`${id}: 범례 ${e.legend}개가 모두 레이어에 있다`, () => {
    const gj = load(id);
    assert.equal(gj.type, 'FeatureCollection');
    assert.equal(gj.properties.id, id);
    assert.equal(typeof gj.properties.approx, 'boolean');
    assert.equal(gj.properties.legend.length, e.legend);
    for (const l of gj.properties.legend) assert.ok(l.present, `빠진 분류 ${l.label}`);
    assert.equal(classes(gj).size, e.legend);
    const byType = (t) => new Set(gj.features.filter((f) => f.properties.type === t).map((f) => f.properties.cls)).size;
    if (e.area) assert.equal(byType('area'), e.area);
    if (e.symbol) assert.equal(byType('symbol'), e.symbol);
    if (e.lines) assert.ok(gj.features.some((f) => f.properties.type === e.lines));
    for (const f of gj.features) {
      const p = f.properties;
      assert.ok(p.cls && p.color && /^#[0-9a-f]{6}$/.test(p.color), JSON.stringify(p));
      if (p.type === 'area') {
        assert.equal(f.geometry.type, 'MultiPolygon');
        assert.ok(p.label && Array.isArray(p.centroid));
      }
      if (p.type === 'symbol') assert.ok(p.kind && p.size > 0 && p.label, `기호 label ${JSON.stringify(p)}`);
    }
  });
}

test('좌표는 경위도 범위이고 소수 3자리 이하', () => {
  for (const id of Object.keys(EXPECT)) {
    const s = readFileSync(`${DIR}/layer-${id}.json`, 'utf8');
    assert.ok(!/\d\.\d{4,}/.test(s.replace(/"(widthPt|size|centroid)":[^,}\]]+/g, '')), `${id}: 4자리 이상 소수`);
    for (const f of JSON.parse(s).features) {
      const flat = JSON.stringify(f.geometry.coordinates).match(/-?\d+(\.\d+)?/g).map(Number);
      for (let i = 0; i < flat.length; i += 2) {
        assert.ok(Math.abs(flat[i]) <= 180 && Math.abs(flat[i + 1]) <= 90, `${id} ${flat[i]},${flat[i + 1]}`);
      }
    }
  }
});

test('면 바깥 고리는 시계 방향(d3 규약)', () => {
  const signed = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
  for (const id of ['p21-climate', 'p22-religion', 'p23-growth', 'p24-exports', 'p22-kashmir']) {
    for (const f of load(id).features) {
      if (f.geometry.type !== 'MultiPolygon') continue;
      for (const poly of f.geometry.coordinates) assert.ok(signed(poly[0]) < 0, `${id} ${f.properties.cls}`);
    }
  }
});

test('빗금 분류(고산 기후)가 따로 남는다', () => {
  const hatch = load('p21-climate').features.filter((f) => f.properties.pattern === 'hatch');
  assert.equal(hatch.length, 1);
  assert.match(hatch[0].properties.label, /고산/);
});

test('흐름선: 수입은 우리나라로, 수출은 우리나라에서, 굵기 단계가 있다', () => {
  const flows = load('p24-trade').features.filter((f) => f.properties.type === 'flow');
  // 교과서: 수출입액 상위 10개국씩
  assert.equal(flows.filter((f) => f.properties.cls === 'import').length, 10);
  assert.equal(flows.filter((f) => f.properties.cls === 'export').length, 10);
  const cls = (c, name) => flows.find((f) => f.properties.cls === c && f.properties.label === name)?.properties.value;
  assert.equal(cls('export', '중국'), '10 이상');
  assert.equal(cls('export', '미국'), '10 이상');
  assert.equal(cls('export', '베트남'), '5~10');
  assert.equal(cls('export', '멕시코'), '1~2');
  assert.equal(cls('import', '중국'), '10 이상');
  for (const f of flows) assert.equal(f.properties.width, { '1~2': 0.6, '2~5': 1.0, '5~10': 1.5, '10 이상': 2.0 }[f.properties.value]);
  const korea = [127, 37.5];
  const near = (p) => Math.hypot(p[0] - korea[0], p[1] - korea[1]) < 4;
  for (const f of flows) {
    // 날짜변경선을 건너는 선(미국·멕시코)은 MultiLineString 으로 나뉘어 있다
    const c = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : f.geometry.coordinates;
    if (f.properties.cls === 'import') assert.ok(near(c[c.length - 1]), '수입 끝점');
    else assert.ok(near(c[0]), '수출 시작점');
    assert.ok(['1~2', '2~5', '5~10', '10 이상'].includes(f.properties.value));
  }
});

test('카슈미르는 Natural Earth 경계 + 교과서 종교 면(진한·흐린)·지명·범례 이름(…교도)', () => {
  const gj = load('p22-kashmir');
  assert.equal(gj.properties.source, 'Natural Earth');
  assert.equal(gj.properties.approx, true);
  const labels = gj.features.map((f) => f.properties.label);
  for (const l of ['파키스탄이 주장하는 국경', '인도가 주장하는 국경', '중국이 주장하는 국경', '인도-파키스탄 정전 라인']) assert.ok(labels.includes(l), l);
  assert.deepEqual(gj.properties.legend.filter((e) => e.kind === 'fill').map((e) => e.label), ['이슬람교도 비율이 높은 지역', '힌두교도 비율이 높은 지역', '불교도 비율이 높은 지역']);
  assert.ok(gj.properties.legend.every((e) => e.geometry !== false), '종교 3분류도 면이 있음');
  const shades = gj.features.filter((f) => f.properties.type === 'area').map((f) => `${f.properties.cls}:${f.properties.shade}`);
  assert.deepEqual(shades.sort(), ['rel-buddhism:buddhism', 'rel-hindu:hindu', 'rel-islam:faint', 'rel-islam:strong']);
  const texts = gj.features.filter((f) => f.properties.type === 'label').map((f) => f.properties.text);
  for (const t of ['카', '슈', '미', '르', '파키스탄 지배 지역', '인도 지배 지역', '중국-인도 분쟁 지역', '중국', '파키스탄', '인도']) assert.ok(texts.includes(t), t);
  assert.equal(gj.features.filter((f) => f.properties.type === 'locator').length, 1);
  for (const f of gj.features) {
    const [lon, lat] = JSON.stringify(f.geometry.coordinates).match(/-?\d+\.?\d*/g).map(Number);
    assert.ok(lon > 70 && lon < 82 && lat > 31 && lat < 38);
  }
});

test('싱가포르 이름 붙은 사원 4곳', () => {
  const named = load('p22-singapore').features.filter((f) => f.properties.name).map((f) => f.properties.name);
  assert.equal(named.length, 4);
  assert.ok(named.includes('세인트 앤드루 대성당'));
});

test('자원 기호 label = 범례 이름, 인구 막대 label = 나라', () => {
  const res = load('p24-resources').features;
  assert.ok(res.every((f) => f.properties.label === f.properties.kind));
  assert.equal(res.filter((f) => f.properties.label === '석유').length, 35);
  const pop = load('p23-density-cities').features.map((f) => f.properties.label);
  assert.ok(pop.includes('중국') && pop.includes('인도'));
});

test('기호 모양(legendShapes)·지시선 막대 자리(barAt)', () => {
  const res = load('p24-resources').properties.legend;
  assert.deepEqual(Object.fromEntries(res.map((e) => [e.label, e.shape])), { 철광석: 'diamond', 구리: 'diamond', 주석: 'diamond', 천연가스: 'triangle-down', 석유: 'circle', 석탄: 'square' });
  assert.equal(load('p23-density-cities').properties.legend[0].shape, 'bar');
  const bars = load('p23-density-cities').features.map((f) => f.properties);
  for (const p of bars) {
    if (p.anchor === 'leader') assert.ok(Array.isArray(p.barAt) && p.barAt.length === 2, p.label);
    else assert.equal(p.barAt, undefined, p.label);
  }
  // 교과서: 파키스탄·방글라데시·필리핀 막대는 지시선으로 바다 쪽에 따로 놓였다
  assert.deepEqual(bars.filter((p) => p.barAt).map((p) => p.label).sort(), ['방글라데시', '파키스탄', '필리핀']);
});

test('레이어 합계 용량이 작다(≤ 650KB)', () => {
  const ids = [...Object.keys(EXPECT), 'p22-kashmir'];
  const kb = ids.reduce((a, id) => a + statSync(`${DIR}/layer-${id}.json`).size, 0) / 1024;
  assert.ok(kb <= 650, `${kb.toFixed(1)} KB`);
});

test('alignHole: 구멍을 바깥 고리 쪽 경도로 옮긴다', () => {
  const ext = [[179, 0], [181, 0], [181, 1], [179, 0]];
  assert.deepEqual(alignHole(ext, [[-179.5, 0.2], [-179.2, 0.2], [-179.5, 0.5]]), [[180.5, 0.2], [180.8, 0.2], [180.5, 0.5]]);
  assert.deepEqual(alignHole(ext, [[180.1, 0.2]]), [[180.1, 0.2]]);
});

test('convertPath: null 은 빼고 경도는 날짜변경선을 넘어 이어 붙인다', () => {
  const table = { 1: [179, 60], 2: null, 3: [-179, 61], 4: [-178, 62] };
  const cv = { invert: (p) => table[p[0]] };
  const [out, dropped] = convertPath(cv, [[1], [2], [3], [4]]);
  assert.equal(dropped, 1);
  assert.deepEqual(out, [[179, 60], [181, 61], [182, 62]]);
});

// ── 나라 단위 단계구분도(country_class.py → build_layers) ─────────────────
test('countryClassLayerJson: 분류 + 범례 꾸밈(legendColors) + present, 범례 분류에 나라가 없으면·expectLegend 가 다르면 멈춤', () => {
  const cc = { legend: [{ cls: 'c1', color: '#e8562a', label: '80~100', kind: 'fill' }, { cls: 'c2', color: '#fff3c8', label: '50 이하', kind: 'fill' }],
    classes: { FRA: 'c1', ALB: 'c2' }, overrides: [{ iso: 'XKX', cls: 'c2', why: '코소보', was: null }] };
  const layer = { id: 'p30-urban', map: 'p30-urban', type: 'countryClass', legendColors: { '50 이하': { color: '#f7dc8a', why: '바탕에 묻힘' } } };
  const fit = { family: 'conicConformal' };
  const out = countryClassLayerJson(layer, cc, { page: 30, title: '도시화율', kind: 'urban' }, fit);
  assert.equal(out.type, 'countryClass');
  assert.deepEqual(out.classes, cc.classes);
  assert.deepEqual(out.legend.map((e) => [e.cls, e.color, e.printColor, e.present]), [['c1', '#e8562a', undefined, true], ['c2', '#f7dc8a', '#fff3c8', true]]);
  assert.equal(out.properties.layerType, 'countryClass');
  assert.equal(out.properties.page, 30);
  assert.equal(out.overrides.length, 1);
  assert.throws(() => countryClassLayerJson(layer, { ...cc, classes: { FRA: 'c1' } }, { page: 30 }, fit), /나라가 없는 범례 분류 50 이하/);
  assert.throws(() => countryClassLayerJson({ ...layer, expectLegend: 3 }, cc, { page: 30 }, fit), /expectLegend/);
  assert.throws(() => decorateLegend({ id: 'x', legendColors: { 없음: { color: '#000000' } } }, cc.legend), /범례에 없는 이름/);
});

test('decorateLegend: legendStyles {범례 이름: outline} → 범례 항목 style, 모르는 모양·없는 이름은 멈춤', () => {
  const raw = [{ cls: 'c1', color: '#b9d989', label: '가입국', kind: 'fill', box: [0, 0, 1, 1] }, { cls: 'c3', color: '#ffdd00', label: '유로 사용 국가', kind: 'fill' }];
  const { legend } = decorateLegend({ id: 'eu', legendStyles: { '유로 사용 국가': 'outline' } }, raw);
  assert.deepEqual(legend.map((e) => e.style), [undefined, 'outline']);
  assert.equal(legend[0].box, undefined);
  assert.throws(() => decorateLegend({ id: 'eu', legendStyles: { '유로 사용 국가': 'dots' } }, raw), /모르는 모양/);
  assert.throws(() => decorateLegend({ id: 'eu', legendStyles: { 없음: 'outline' } }, raw), /legendStyles 에 범례에 없는 이름/);
});

test('applySymbolSizes: symbolSizes 단계 pt → 범례 size·기호 size, legendStyle 은 nested-circles 만', async () => {
  const { applySymbolSizes } = await import('../../scripts/atlas/build_layers.mjs');
  const legend = [{ cls: 'c1', label: '1,000 이상' }, { cls: 'c2', label: '300~1,000' }];
  const feats = [{ properties: { type: 'symbol', cls: 'c1', size: 7.3 } }, { properties: { type: 'symbol', cls: 'c2', size: 6.1 } }, { properties: { type: 'area', cls: 'c2' } }];
  const sz = applySymbolSizes({ id: 'u', symbolSizes: { '1,000 이상': 8, '300~1,000': 6 }, legendStyle: 'nested-circles' }, legend, feats);
  assert.deepEqual(Object.values(sz), [8, 6]);
  assert.deepEqual(legend.map((e) => e.size), [8, 6]);
  assert.deepEqual(feats.map((f) => f.properties.size), [8, 6, undefined]);
  assert.throws(() => applySymbolSizes({ id: 'u', symbolSizes: { 없음: 3 } }, legend, []), /범례에 없는 이름/);
  assert.throws(() => applySymbolSizes({ id: 'u', legendStyle: 'squares' }, legend, []), /legendStyle/);
  assert.deepEqual(applySymbolSizes({ id: 'u' }, legend, []), {});
});

test('applySymbolValues: symbolValues {이름: [값…]} + valueIcons → 기호 properties.values, 모르는 이름·값 수 다르면 멈춤', async () => {
  const { applySymbolValues } = await import('../../scripts/atlas/build_layers.mjs');
  const feats = [{ properties: { type: 'symbol', name: '리스본' } }, { properties: { type: 'symbol', name: '포르투' } }];
  applySymbolValues({ id: 'lis', valueIcons: ['charger', 'person'], symbolValues: { 리스본: ['2.09', 7.1] } }, feats);
  assert.deepEqual(feats[0].properties.values, [{ icon: 'charger', text: '2.09' }, { icon: 'person', text: '7.1' }]);
  assert.equal(feats[1].properties.values, undefined);
  assert.throws(() => applySymbolValues({ id: 'lis', valueIcons: ['charger'], symbolValues: { 없음: ['1'] } }, feats), /기호에 없는 이름/);
  assert.throws(() => applySymbolValues({ id: 'lis', valueIcons: ['charger', 'person'], symbolValues: { 리스본: ['1'] } }, feats), /값 수/);
});

test('boxRingLonLat: 삽입 지도 틀 둘레를 fit 으로 되돌린 닫힌 경위도 고리(여러 지도 한 레이어의 덮개), 되돌릴 수 없으면 멈춤', async () => {
  const { boxRingLonLat } = await import('../../scripts/atlas/build_layers.mjs');
  const cv = { invert: ([x, y]) => [x / 10 - 30, 70 - y / 10] };
  const ring = boxRingLonLat(cv, [50, 30, 170, 70], 4);
  assert.equal(ring.length, 17);
  assert.deepEqual(ring[0], ring[16]);
  assert.deepEqual(ring[0], [-25, 67]);
  assert.deepEqual(ring[8], [-13, 63]);
  assert.throws(() => boxRingLonLat({ invert: () => null }, [0, 0, 1, 1], 2), /되돌릴 수 없음/);
});

test('snapSymbols: 이름(끝 「(연도)」 뺌)이 Natural Earth 에 하나뿐이고 30km 넘게 어긋나면 옮김, 둘 이상·가까우면 그대로', async () => {
  const { snapSymbols } = await import('../../scripts/atlas/build_layers.mjs');
  const pt = (name, c) => ({ type: 'Feature', properties: { type: 'symbol', name }, geometry: { type: 'Point', coordinates: c } });
  const ne = new Map([['스톡홀름', [{ lon: 18.066, lat: 59.324 }]], ['발렌시아', [{ lon: -0.4, lat: 39.49 }, { lon: -68, lat: 10.2 }]], ['오슬로', [{ lon: 10.75, lat: 59.91 }]]]);
  const fs = [pt('스톡홀름(2010)', [16.96, 58.79]), pt('발렌시아(2024)', [-1.5, 39]), pt('오슬로(2019)', [10.6, 59.85])];
  assert.equal(snapSymbols(fs, ne, 30), 1);
  assert.deepEqual(fs[0].geometry.coordinates, [18.066, 59.324]);
  assert.ok(fs[0].properties.snapped.km > 80);
  assert.deepEqual(fs[1].geometry.coordinates, [-1.5, 39]);
  assert.equal(fs[2].properties.snapped, undefined);
});

// ── U4-3a·c·f 파이프라인: multiFill 넘김 · 고리 기호 레이어 · 미확정 국경 ─────────────────
const { chartSymbolsLayerJson, disputedLayerJson, clipLineToBox } = await import('../../scripts/atlas/build_layers.mjs');

test('countryClassLayerJson: multiFill(country_class 설정 multi) 은 그대로 넘기고, 없으면 키도 없음(u3 생성물 그대로)', () => {
  const cc = { legend: [{ cls: 'c1', color: '#3a9a48', label: '아랍어', kind: 'fill' }, { cls: 'c2', color: '#a7a9ac', label: '기타', kind: 'fill' }], classes: { MAR: ['c1', 'c2'], EGY: 'c1' } };
  const layer = { id: 'p38-language', map: 'p38-language', type: 'countryClass' };
  const fit = { family: 'azimuthalEquidistant' };
  assert.equal(countryClassLayerJson(layer, { ...cc, multiFill: 'stripes' }, { page: 38 }, fit).multiFill, 'stripes');
  assert.ok(!('multiFill' in countryClassLayerJson(layer, cc, { page: 38 }, fit)));
});

test('chartSymbolsLayerJson: 설정 items 의 고리 가운데(지면 pt)를 fit 으로 되돌리고 그래프 자료의 계열·ring 을 옮김, 없는 그래프·되돌릴 수 없으면 멈춤', () => {
  const cv = { invert: ([x, y]) => (x < 0 ? null : [x / 10 - 20, 40 - y / 10]) };
  const charts = { 'p38-bauxite': { id: 'p38-bauxite', type: 'pie', ring: 0.6, title: '보크사이트', center: ['39,100', '(만 톤)', '2020년'],
    series: [{ name: '기니', values: [22], color: '#f7941d', measured: [21.8] }, { name: '기타', values: [78], color: '#d1d3d4' }] } };
  const layer = { id: 'p38-resource-charts', map: 'p38-resources', type: 'chartSymbols', items: [{ chart: 'p38-bauxite', centerPt: [150.123, 200.456], sizePt: 28 }] };
  const out = chartSymbolsLayerJson(layer, charts, cv, { page: 38, title: '주요 자원', kind: 'resources' }, { family: 'azimuthalEquidistant' });
  assert.equal(out.type, 'chartSymbols');
  assert.deepEqual(out.items[0].lonlat, [-4.988, 19.954]);
  assert.deepEqual(out.items[0].series, [{ name: '기니', values: [22], color: '#f7941d' }, { name: '기타', values: [78], color: '#d1d3d4' }]);
  assert.deepEqual([out.items[0].title, out.items[0].sizePt, out.items[0].ring, out.items[0].center.length], ['보크사이트', 28, 0.6, 3]);
  assert.equal(out.properties.page, 38);
  assert.deepEqual(chartSymbolsLayerJson(layer, Object.values(charts), cv, { page: 38 }).items[0].chart, 'p38-bauxite', '그래프 자료 배열도 받음');
  assert.throws(() => chartSymbolsLayerJson({ ...layer, items: [{ chart: 'p38-none', centerPt: [1, 1] }] }, charts, cv, { page: 38 }), /p38-none/);
  assert.throws(() => chartSymbolsLayerJson({ ...layer, items: [{ chart: 'p38-bauxite', centerPt: [-1, 1] }] }, charts, cv, { page: 38 }), /되돌릴 수 없음/);
  assert.throws(() => chartSymbolsLayerJson({ ...layer, items: [] }, charts, cv, { page: 38 }), /items/);
});

test('disputedLayerJson: FEATURECLA·나라 짝(차례 상관없음)·단원 상자로 고른 Natural Earth 선 → 점선 선 레이어(범례 「미확정 국경」), 짝에 선이 없으면 멈춤', () => {
  const ln = (cla, l, r, coords) => ({ type: 'Feature', properties: { FEATURECLA: cla, ADM0_LEFT: l, ADM0_RIGHT: r }, geometry: { type: 'LineString', coordinates: coords } });
  const gj = { type: 'FeatureCollection', features: [
    ln('Disputed (please verify)', 'Egypt', 'Sudan', [[34.08, 22], [36.88, 22.0001]]),
    ln('Line of control (please verify)', 'Western Sahara', 'Morocco', [[-8.8, 27.66], [-8.7, 27.66]]),
    ln('International boundary (verify)', 'Egypt', 'Sudan', [[25, 22], [31.4, 22]]),          // 분쟁 계열 아님
    ln('Disputed (please verify)', 'Palestine', 'Israel', [[34.2, 31.2], [34.6, 31.6]]),        // 짝 아님
    ln('Disputed (please verify)', 'Kenya', 'South Sudan', [[34.38, 4.62], [35.61, 5.03]]),
    ln('Disputed (please verify)', 'Kenya', 'South Sudan', [[100, 4.62], [101, 5.03]]),         // 상자 밖
  ] };
  const layer = { id: 'ne-disputed', source: 'ne-disputed', type: 'line', color: '#ed1c24', label: '미확정 국경',
    disputed: { featurecla: ['Disputed (please verify)', 'Line of control (please verify)'], pairs: [['Western Sahara', 'Morocco'], ['Egypt', 'Sudan'], ['South Sudan', 'Kenya']] } };
  const out = disputedLayerJson(layer, gj, [[-37, -39, 67, 42]]);
  assert.equal(out.properties.layerType, 'area');   // 주제 레이어 type 'area' — areaLayer 가 점선 선 Feature 를 그림(build_content 가 type ≠ layerType 이면 경고)
  assert.equal(out.features.length, 1);
  const f = out.features[0];
  assert.deepEqual([f.properties.type, f.properties.dashed, f.properties.color, f.geometry.type], ['line', true, '#ed1c24', 'MultiLineString']);
  assert.equal(f.geometry.coordinates.length, 3);
  assert.deepEqual(f.geometry.coordinates[0], [[34.08, 22], [36.88, 22]], '소수 3자리');
  assert.deepEqual(out.properties.legend, [{ cls: 'c1', color: '#ed1c24', label: '미확정 국경', kind: 'line', dashed: true, present: true }]);
  assert.throws(() => disputedLayerJson({ ...layer, disputed: { ...layer.disputed, pairs: [...layer.disputed.pairs, ['Somalia', 'Ethiopia']] } }, gj, [[-37, -39, 67, 42]]), /Ethiopia \| Somalia/);
  assert.throws(() => disputedLayerJson({ ...layer, disputed: {} }, gj), /featurecla/);
});

test('disputedLayerJson: 상자 밖으로 걸친 선은 잘라 안쪽만(통째로 버리지 않음), 상자 밖에만 있는 짝은 멈춤 — clipLineToBox 들락거림·보간', () => {
  assert.deepEqual(clipLineToBox([[-1, 0], [1, 0]], [0, -1, 2, 1]), [[[0, 0], [1, 0]]], '왼쪽 끝 잘림');
  assert.deepEqual(clipLineToBox([[0.5, 0], [3, 0], [3, 0.5], [0.5, 0.5]], [0, -1, 2, 1]), [[[0.5, 0], [2, 0]], [[2, 0.5], [0.5, 0.5]]], '나갔다 들어오면 두 조각');
  assert.deepEqual(clipLineToBox([[5, 5], [6, 6]], [0, -1, 2, 1]), [], '밖');
  assert.deepEqual(clipLineToBox([[0.2, 0.2], [0.4, 0.4], [0.6, 0.2]], [0, -1, 2, 1]), [[[0.2, 0.2], [0.4, 0.4], [0.6, 0.2]]], '안이면 그대로');
  const ln = (l, r, coords) => ({ type: 'Feature', properties: { FEATURECLA: 'Disputed (please verify)', ADM0_LEFT: l, ADM0_RIGHT: r }, geometry: { type: 'LineString', coordinates: coords } });
  const gj = { type: 'FeatureCollection', features: [ln('Kenya', 'South Sudan', [[66, 4], [68, 4]]), ln('Egypt', 'Sudan', [[70, 22], [71, 22]])] };
  const layer = { id: 'ne-disputed', disputed: { featurecla: ['Disputed (please verify)'], pairs: [['South Sudan', 'Kenya']] } };
  const out = disputedLayerJson(layer, gj, [[-37, -39, 67, 42]]);
  assert.deepEqual(out.features[0].geometry.coordinates, [[[66, 4], [67, 4]]], '상자 끝 67°E 까지');
  assert.throws(() => disputedLayerJson({ ...layer, disputed: { ...layer.disputed, pairs: [['Egypt', 'Sudan']] } }, gj, [[-37, -39, 67, 42]]), /Egypt \| Sudan/, '상자 밖에만 있는 짝은 멈춤');
});

test('chartSymbolsLayerJson: 설정 lonlat(+ _why)이 있으면 되돌린 자리 대신 그것, _why 없으면 멈춤(U4-4 리뷰)', () => {
  const cv = { invert: () => [10, 60] };
  const charts = { c: { id: 'c', type: 'pie', ring: 0.6, title: 't', series: [{ name: 'a', values: [1], color: '#112233' }] } };
  const L = { id: 'rc', items: [{ chart: 'c', centerPt: [1, 1], lonlat: [-25, 7], _why: '대서양' }] };
  assert.deepEqual(chartSymbolsLayerJson(L, charts, cv, { page: 38 }).items[0].lonlat, [-25, 7]);
  assert.deepEqual(chartSymbolsLayerJson({ id: 'rc', items: [{ chart: 'c', centerPt: [1, 1] }] }, charts, cv, { page: 38 }).items[0].lonlat, [10, 60]);
  assert.throws(() => chartSymbolsLayerJson({ id: 'rc', items: [{ chart: 'c', centerPt: [1, 1], lonlat: [0, 0] }] }, charts, cv, { page: 38 }), /_why/);
});

test('chartSymbolsLayerJson: ring true 는 donut 값을 수로, 계열 색이 colors 면 첫 색', () => {
  const cv = { invert: () => [0, 0] };
  const charts = { c: { id: 'c', type: 'pie', ring: true, donut: 0.55, title: 't', series: [{ name: 'a', values: [1], colors: ['#112233'] }] } };
  const out = chartSymbolsLayerJson({ id: 'x', items: [{ chart: 'c', centerPt: [0, 0] }] }, charts, cv, { page: 38 });
  assert.equal(out.items[0].ring, 0.55);
  assert.equal(out.items[0].series[0].color, '#112233');
});

test('disputedLayerJson basemapPairs(U4-9): 바탕 지도 두 나라 공유 경계를 덧붙임(서사하라 27°40′), 바탕 지도 없거나 경계가 없으면 멈춤', () => {
  // 위상 하나: MAR(북) · SAH(남) 가 호 0(27.6667 선)을 나눔
  const topo = { type: 'Topology', arcs: [[[-13, 27.6667], [-8.7, 27.6667]], [[-8.7, 27.6667], [-8.7, 35], [-13, 35], [-13, 27.6667]], [[-8.7, 27.6667], [-8.7, 21], [-13, 21], [-13, 27.6667]]],
    objects: { countries10a: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', arcs: [[0, ~1]], properties: { iso: 'MAR' } }, { type: 'Polygon', arcs: [[~0, 2]], properties: { iso: 'SAH' } }] } } };
  const gj = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { FEATURECLA: 'Disputed (please verify)', ADM0_LEFT: 'Egypt', ADM0_RIGHT: 'Sudan' }, geometry: { type: 'LineString', coordinates: [[34, 22], [36, 22]] } }] };
  const layer = { id: 'ne-disputed', disputed: { featurecla: ['Disputed (please verify)'], pairs: [['Egypt', 'Sudan']], basemapPairs: [['SAH', 'MAR']] } };
  const out = disputedLayerJson(layer, gj, [[-37, -39, 67, 42]], topo);
  assert.deepEqual(out.features[0].geometry.coordinates, [[[34, 22], [36, 22]], [[-13, 27.667], [-8.7, 27.667]]]);
  assert.match(out.properties.source, /바탕 지도 나라 경계\(SAH–MAR\)/);
  assert.throws(() => disputedLayerJson(layer, gj, [], null), /바탕 지도 countries10a/);
  assert.throws(() => disputedLayerJson({ ...layer, disputed: { ...layer.disputed, basemapPairs: [['MAR', 'DZA']] } }, gj, [], topo), /DZA \| MAR\(바탕 지도\)/);
  // basemapPairs 가 없으면 바탕 지도를 보지 않음(u4 전 동작)
  assert.equal(disputedLayerJson({ ...layer, disputed: { featurecla: layer.disputed.featurecla, pairs: layer.disputed.pairs } }, gj, []).features[0].geometry.coordinates.length, 1);
});
