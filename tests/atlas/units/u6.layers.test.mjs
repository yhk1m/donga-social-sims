// © 2026 김용현
// U6-4 주제 레이어(오세아니아·극지방) — 생성물 sims/atlas-u6-oceania-polar/data/layer-*.json 확인
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { geoArea, geoContains } from 'd3-geo';

const D = 'sims/atlas-u6-oceania-polar/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const has = existsSync(`${D}/layer-p53-climate.json`);
const t = has ? test : test.skip;
const labelOf = (L, cls) => L.properties.legend.find((e) => e.cls === cls)?.label;

t('p53 기후 구분: 범례 9(열대 3·건조 2·온대 4) + 교과서 범례에 없는 고지대 빗금 「고산 기후(빗금)」(교사 답 Q15 — U6-10t), 면 경위도가 오세아니아', () => {
  const gj = read('p53-climate');
  assert.equal(gj.properties.legend.length, 10);
  assert.deepEqual([...new Set(gj.properties.legend.slice(0, 9).map((e) => e.group))], ['열대', '건조', '온대']);
  for (const f of gj.features) {
    const [lon, lat] = f.properties.centroid;
    assert.ok(lon > 110 && lon < 180 && lat > -50 && lat < 0, `${f.properties.label} ${lon},${lat}`);
  }
  const hatch = gj.features.filter((f) => f.properties.pattern === 'hatch');
  assert.equal(hatch.length, 1);
  const e = gj.properties.legend.find((x) => x.cls === hatch[0].properties.cls);
  assert.deepEqual([e.label, e.pattern, e.angle, e.group, e.legendHidden], ['고산 기후(빗금)', 'hatch', 45, undefined, undefined], '빗금 범례 견본');
  const [lon, lat] = hatch[0].properties.centroid;
  assert.ok(lon > 140 && lon < 148 && lat > -8 && lat < -3, '파푸아 뉴기니 고지대');
});

t('p53 1월·7월: 강수 7 + 등온선, 등온선 값(1월 20·30 · 7월 10·20)', () => {
  for (const [id, vals] of [['p53-jan', [20, 30]], ['p53-jul', [10, 20]]]) {
    const gj = read(id);
    assert.equal(gj.properties.legend.length, 8, id);
    const v = new Set(gj.features.filter((f) => f.properties.type === 'isotherm').map((f) => f.properties.value).filter((x) => x != null));
    assert.deepEqual([...v].sort((a, b) => a - b), vals, id);
  }
});

t('극·지구본 묶음은 같은 묶음의 주제 보기 레이어가 연다(교사 Q1·Q6 — 교과서 위쪽 경선), 면 레이어에도 view 기록', () => {
  const want = { 'p50-view': ['polarN', -90], 'p51-view': ['polarS', -90], 'p55-claims-view': ['polarN', 180], 'p55-bases-view': ['polarS', -90] };
  for (const [id, [proj, up]] of Object.entries(want)) {
    const L = read(id);
    assert.equal(L.properties.layerType, 'topicView', id);
    assert.equal(L.properties.view.projection, proj, id);
    assert.equal(L.properties.view.up, up, id);
    assert.equal(L.features.length, 0, id);
  }
  assert.equal(read('p50-lines').properties.view.projection, 'polarN');
  assert.equal(read('p51-shelves').properties.view.projection, 'polarS');
  assert.equal(read('p55-claims').properties.view.projection, 'polarN');
  assert.equal(read('p55-sectors').properties.view.projection, 'polarS');
  for (const id of ['p48-view', 'p49-view', 'p52-view']) assert.equal(read(id).properties.view.centerLon, 150, id);   // 교사 Q2 태평양 중심
});

t('55쪽 지구본 셋(교사 Q16): pathFlow + view globe, 아라온호 번호는 원문자 글자', () => {
  for (const id of ['p55-route', 'p55-araon-s', 'p55-araon-n']) {
    const L = read(id);
    assert.equal(L.properties.layerType, 'pathFlow', id);
    assert.equal(L.properties.view.projection, 'globe', id);
  }
  assert.equal(read('p55-route').features.length, 2);
  assert.ok(read('p55-route').features.some((f) => f.properties.dashed), '기존 항로 파선');
  const marks = (id) => read(id).features.filter((f) => f.properties.type === 'label').map((f) => f.properties.text).filter((s) => /^[①-⑨]$/.test(s)).sort();
  assert.deepEqual(marks('p55-araon-s-marks'), ['①', '②', '③', '④', '⑤', '⑥', '⑦']);
  assert.deepEqual(marks('p55-araon-n-marks'), ['①', '②', '③', '④', '⑤']);
});

t('p55 북극해 영유권: 면 5, 뒤집히지 않음, 극점에서 만나 극 둘레를 빈틈없이 덮음, EEZ 선', () => {
  const gj = read('p55-claims');
  const areas = gj.features.filter((f) => f.geometry.type.endsWith('Polygon'));
  assert.equal(new Set(areas.map((f) => f.properties.cls)).size, 5);
  for (const f of areas) assert.ok(geoArea(f) < 0.5, f.properties.label);   // 「지구 전체 − 면」이면 수 sr
  for (const lon of [-150, -90, -30, 0, 30, 90, 150, 180]) assert.ok(areas.some((f) => geoContains(f, [lon, 89.8])), `극 옆 ${lon}`);
  assert.ok(gj.features.some((f) => f.properties.type === 'line' && labelOf(gj, f.properties.cls) === '배타적 경제 수역'));
  assert.equal(gj.properties.legend.length, 6);
});

t('p55 남극 영유권: 나라 7, 경선은 바깥 → 극, 노르웨이는 극까지 가지 않음, 겹치는 호는 비킴', () => {
  const L = read('p55-sectors');
  assert.equal(L.properties.legend.length, 7);
  const nor = L.features.filter((f) => labelOf(L, f.properties.cls) === '노르웨이');
  assert.ok(nor.length);
  for (const f of nor) for (const [, lat] of f.geometry.coordinates) assert.ok(lat > -89, '노르웨이 선이 극까지');
  for (const f of L.features.filter((x) => x.properties.part === 'w' || x.properties.part === 'e')) {
    const c = f.geometry.coordinates;
    assert.ok(c[0][1] > c[c.length - 1][1] && c[c.length - 1][1] === -90, '경선 방향');
  }
  const part = (cls, p) => { const f = L.features.find((x) => x.properties.cls === cls && x.properties.part === p); assert.ok(f, `${cls} ${p} 없음`); return f; };
  const off = (cls, p = 'arc') => part(cls, p).properties.offsetPx ?? 0;   // 조각이 없으면 위에서 멈춤(없는 조각을 0 으로 통과시키지 않음)
  // 바깥 호 겹침(남위 60° 위 영국 −80~−20 · 아르헨티나 −74~−25 · 칠레 −90~−53): 칠레 −2.5 · 영국 0 · 아르헨티나 +2.5
  assert.equal(off('chl'), -2.5); assert.equal(off('gbr'), 0); assert.equal(off('arg'), 2.5);
  // 160°E 경선을 함께 쓰는 뉴질랜드(서쪽 경선) +2 · 오스트레일리아(동쪽 경선) −2, 프랑스 호(오스트레일리아 호 안) +2.5
  assert.equal(part('nz', 'w').geometry.coordinates[0][0], 160); assert.equal(part('aus', 'e').geometry.coordinates[0][0], 160);
  assert.equal(off('nz', 'w'), 2); assert.equal(off('aus', 'e'), -2); assert.equal(off('fra'), 2.5);
});

t('p51 기지: 세종·장보고가 있고 모두 남극 안, 과학 기지 29 + 우리나라 2', () => {
  const gj = read('p51-stations');
  const pts = gj.features.filter((f) => f.properties.type === 'symbol');
  assert.equal(pts.length, 31);
  const names = pts.map((f) => f.properties.name).join(' ');
  for (const n of ['세종', '장보고', '아문센 스콧']) assert.match(names, new RegExp(n));
  for (const f of pts) assert.ok(f.geometry.coordinates[1] < -60, f.properties.name);
  assert.equal(gj.properties.legend.length, 2);
});

t('p55 기지·북극 자원: 점 수, 단순 모양(이모지·그림 아님)', () => {
  const b = read('p55-bases');
  assert.equal(b.features.filter((f) => f.properties.type === 'symbol').length, 27);
  for (const f of b.features.filter((x) => x.properties.type === 'symbol')) assert.ok(f.geometry.coordinates[1] < -60);
  const r = read('p55-resources');
  const n = (label) => r.features.filter((f) => f.properties.type === 'symbol' && f.properties.kind === label).length;
  assert.deepEqual([n('가스전'), n('유전'), n('분쟁 지역')], [13, 9, 4]);
  for (const e of r.properties.legend) assert.ok(['triangle', 'diamond'].includes(e.shape), e.label);
});

t('p48 우리나라 윤곽: 같은 경도 남반구 거울상(교사 Q4)', () => {
  const gj = read('p48-korea');
  assert.equal(gj.properties.mode, 'sameLat');
  const [lon, lat] = gj.properties.home;
  assert.ok(lon > 120 && lon < 135 && lat < -30 && lat > -46, `${lon},${lat}`);
  assert.ok(gj.properties._mirror);
});

t('p54 FTA: 협정국 14 연도 글자 나라 + 오스트레일리아 따로, 북한은 아님 / 남극 조약 2분류', () => {
  const C = read('p54-fta');
  for (const iso of ['KOR', 'GBR', 'NZL', 'USA', 'CHN', 'JPN', 'HKG', 'SGP', 'IDN', 'MYS', 'THA', 'IND', 'PER', 'CHL']) assert.equal(C.classes[iso], 'c1', iso);
  assert.equal(C.classes.AUS, 'c2');
  assert.equal(C.classes.PRK, undefined);
  const labels = read('p54-fta-labels').features.filter((f) => f.properties.type === 'label').map((f) => f.properties.text);
  assert.equal(labels.filter((s) => /\(\d{4}년\)$/.test(s)).length, 14);
  for (const s of ['동해', '독도', '이어도 종합 해양 과학 기지']) assert.ok(labels.includes(s), s);
  const T = read('p55-treaty');
  assert.equal(T.legend.length, 2);
  for (const iso of ['KOR', 'AUS', 'ARG', 'USA']) assert.equal(T.classes[iso], 'c1', iso);
  assert.equal(T.classes.MEX, undefined);
  // U6-10t: 교과서 지면 그대로 — 레소토·에스와티니·캅카스 셋·북마케도니아 회색, 코스타리카는 지면 초록(2022년 가입 당사국)
  for (const iso of ['LSO', 'SWZ', 'GEO', 'ARM', 'AZE', 'MKD', 'BOL']) assert.equal(T.classes[iso], undefined, iso);
  assert.equal(T.classes.CRI, 'c2');
  assert.equal(Object.keys(T.classes).length, 64);
});

t('극 일반도 선: 50쪽 범례 4(북극권 위선 66.56°N)·51쪽 범례 3, 빙붕 면은 채움 + 이음매 없는 테두리', () => {
  const a = read('p50-lines'), s = read('p51-lines');
  assert.deepEqual(a.properties.legend.map((e) => e.label), ['북극권', '유빙 한계', '영구빙 한계', '해양 경계']);
  assert.deepEqual(s.properties.legend.map((e) => e.label), ['남극권', '유빙 한계', '영구빙 한계']);
  const circle = a.features.find((f) => f.properties.cls === 'g1');
  assert.ok(circle.geometry.coordinates.length > 100 && circle.geometry.coordinates.every(([, lat]) => Math.abs(lat - 66.5626) < 1e-6));
  const sh = read('p51-shelves');
  const line = sh.features.find((f) => f.properties.type === 'line');
  for (const L of line.geometry.coordinates) for (let i = 1; i < L.length; i++) assert.ok(!(Math.abs(Math.abs(L[i][0]) - 180) < 1e-3 && Math.abs(Math.abs(L[i - 1][0]) - 180) < 1e-3), '180° 이음매 변');
  assert.ok(sh.features.some((f) => f.geometry.type === 'MultiPolygon' && geoContains(f, [-175, -81])), '로스 빙붕');
});

t('예산: 레이어 합계 ≤ 700KB, 기후 셋 ≤ 300KB, 빙붕 ≤ 60KB', () => {
  const kb = (id) => readFileSync(`${D}/layer-${id}.json`).length / 1024;
  const ids = JSON.parse(readFileSync('scripts/atlas/config/u6.json', 'utf8')).layers;
  const total = Object.keys(ids).reduce((a, id) => a + kb(id), 0);
  assert.ok(total <= 700, `${total.toFixed(1)}KB`);
  assert.ok(kb('p53-climate') + kb('p53-jan') + kb('p53-jul') <= 300);
  assert.ok(kb('p51-shelves') <= 60);
});
