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
