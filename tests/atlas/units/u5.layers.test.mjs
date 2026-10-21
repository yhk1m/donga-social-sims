// © 2026 김용현
// tests/atlas/units/u5.layers.test.mjs — U5-4 아메리카 주제 레이어 생성물(sims/atlas-u5-americas/data/layer-*.json) 계약.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { geoContains, geoDistance, geoBounds } from 'd3-geo';

const D = 'sims/atlas-u5-americas/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const clsOf = (gj, name) => gj.features.find((f) => f.properties.name === name)?.properties.cls;
const label = (gj, cls) => (gj.properties?.legend || gj.legend).find((x) => x.cls === cls)?.label;
const legendOf = (gj) => gj.properties?.legend || gj.legend;

test('p45 기후 구분: 범례 14(묶음 5 + 고산), 면 경위도가 아메리카, 고산 빗금 면(로키·안데스)', () => {
  const gj = read('p45-climate'); assert.equal(legendOf(gj).length, 14);
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -170 && lon < -20 && lat > -56 && lat < 84, f.properties.label); }
  assert.deepEqual([...new Set(legendOf(gj).map((e) => e.group).filter(Boolean))], ['열대', '건조', '온대', '냉대', '한대']);
  const alp = gj.features.find((f) => f.properties.pattern === 'hatch');
  assert.equal(alp.properties.label, '고산 기후');
  assert.ok(geoContains(alp, [-106.8, 38.9]), '콜로라도 로키');
  const andes = alp.geometry.coordinates.map((poly) => geoBounds({ type: 'Polygon', coordinates: poly })).find(([[w, s], [e, n]]) => w > -82 && e < -60 && s < -25 && n > -5);
  assert.ok(andes, '안데스 띠(잘라 그리기 경로 clips — 콜롬비아~칠레 북부)');
  assert.ok(gj.features.some((f) => f.properties.label === '빙설 기후' && geoContains(f, [-40, 75])), '그린란드 빙설');
});

test('p45 1월·7월: 강수 7 + 등온선, 등온선 조각마다 값(1월 −30~20, 7월 −10~30)', () => {
  for (const [id, lo, hi] of [['p45-jan', -30, 20], ['p45-jul', -10, 30]]) {
    const gj = read(id); assert.equal(legendOf(gj).length, 8, id);
    const iso = gj.features.filter((f) => f.properties.type === 'isotherm');
    assert.ok(iso.length >= 10, id);
    for (const f of iso) assert.ok(Number.isInteger(f.properties.value) && f.properties.value >= lo && f.properties.value <= hi, `${id} ${f.properties.value}`);
    assert.deepEqual([...new Set(iso.map((f) => f.properties.value))].sort((a, b) => a - b).at(0), lo, id);
  }
});

test('p46 미국 주: 4장 모두 범례 5, 주 50 + DC, 알래스카·하와이 분류 있음, DC = 메릴랜드', () => {
  for (const id of ['p46-us-european', 'p46-us-african', 'p46-us-hispanic', 'p46-us-asian']) {
    const gj = read(id); assert.equal(legendOf(gj).length, 5, id);
    assert.equal(gj.features.length, 51, id);
    for (const s of ['Alaska', 'Hawaii']) assert.ok(clsOf(gj, s), `${id} ${s}`);
    assert.equal(clsOf(gj, 'District of Columbia'), clsOf(gj, 'Maryland'), `${id} DC`);
    assert.ok(gj.features.every((f) => f.properties.type === 'area' && f.geometry.type === 'MultiPolygon'), id);
  }
  // 그림에서 보이는 것(값을 넣지 않고 단계만): 아프리카계는 미시시피가 가장 높은 단계, 히스패닉계는 뉴멕시코, 아시아계는 하와이, 유럽계는 메인 80 이상
  const af = read('p46-us-african'), hi = read('p46-us-hispanic'), as = read('p46-us-asian'), eu = read('p46-us-european');
  assert.match(label(af, clsOf(af, 'Mississippi')), /35 이상/);
  assert.match(label(hi, clsOf(hi, 'New Mexico')), /40 이상/);
  assert.match(label(as, clsOf(as, 'Hawaii')), /20 이상/);
  assert.match(label(eu, clsOf(eu, 'Maine')), /80 이상/);
  // 옅은 단계 화면 색 보정은 printColor 를 남김
  assert.equal(legendOf(eu).find((e) => e.label === '50 미만').printColor, '#fff1e2');
});

test('p46 캐나다: 범례 8, 퀘벡 남부는 프랑스어 75% 이상, 온타리오 남부는 영어', () => {
  const gj = read('p46-canada'); assert.equal(legendOf(gj).length, 8);
  const at = (p) => gj.features.find((f) => geoContains(f, p))?.properties.label;
  for (const p of [[-73.6, 45.5], [-72, 48.5]]) assert.equal(at(p), '프랑스어 75% 이상', `${p}`);   // 몬트리올·사그네
  assert.match(at([-80.5, 43.5]), /^영어/);              // 온타리오 남부
  assert.equal(at([-95, 62]), '원주민 언어');            // 누나부트 키발리크
  assert.ok(gj.features.some((f) => f.properties.label === '프랑스어 50% 이하'), '가장 작은 분류도 남음(minArea)');
});

test('p46 중남미 민족: 범례 7, 혼혈은 가로 줄(angle 0)·아프리카계는 빗금(45°), 멕시코 = 에스파냐계 + 혼혈', () => {
  const gj = read('p46-ethnic'); assert.equal(legendOf(gj).length, 7);
  const L = legendOf(gj);
  assert.equal(L.find((x) => x.label === '혼혈').angle, 0);
  assert.equal(L.find((x) => x.label === '혼혈').pattern, 'hatch');
  assert.equal(L.find((x) => x.label === '아프리카계').pattern, 'hatch');
  assert.equal(L.find((x) => x.label === '아프리카계').angle, 45);
  const at = (p) => gj.features.filter((f) => geoContains(f, p)).map((f) => f.properties.label).sort();
  assert.deepEqual(at([-102, 24]), ['에스파냐계', '혼혈']);
  assert.deepEqual(at([-70, -30]), ['에스파냐계']);   // 칠레·아르헨티나 경계 안데스
  assert.ok(gj.features.find((f) => f.properties.label === '아프리카계').properties.angle === 45);
});

test('p46 지구본: 식민지 3 · 이동 4(화살표 10 — 에스파냐·포르투갈·프랑스 2씩, 노예 이동 점선 4), 지구본으로 여는 view', () => {
  const C = read('p46-colonies'); assert.equal(legendOf(C).length, 3);
  assert.deepEqual(legendOf(C).map((e) => e.label), ['에스파냐', '포르투갈', '프랑스']);
  const F = read('p46-migration-flows'); assert.equal(F.properties.legend.length, 4); // pathFlow = FeatureCollection(U5-3c 결정)
  assert.deepEqual(F.properties.view, { projection: 'globe', rotate: [30.3, -9.2] }); // p46-migration 정사 중심 −30.3°, 9.2°
  const n = (c) => F.features.filter((f) => f.properties.cls === c).length;
  assert.deepEqual(['spain', 'portugal', 'france', 'slave'].map(n), [2, 2, 2, 4]);
  assert.ok(F.features.filter((f) => f.properties.cls === 'slave').every((f) => f.properties.dashed));
  // 화살 끝은 아메리카(경도 −100 ~ −34), 꼬리는 그보다 동쪽(유럽·아프리카 — 갈래 화살표 둘은 대서양·카리브에서 갈라짐)
  for (const f of F.features) {
    const c = f.geometry.coordinates, head = c.at(-1), tail = c[0];
    assert.ok(head[0] > -100 && head[0] < -34, `${f.properties.id} 끝 ${head}`);
    assert.ok(tail[0] > head[0], `${f.properties.id} 꼬리 ${tail}`);
  }
  assert.equal(F.features.filter((f) => f.geometry.coordinates[0][0] > -20).length, 8, '유럽·아프리카에서 떠나는 화살표 8');
});

test('p47 본사: 원 99(본 지도 84 + 실리콘 밸리 15), 동해·독도·이어도 글자, 지름 ∝ √값, 큰 원부터', () => {
  const gj = read('p47-hq'), sv = read('p47-hq-sv');
  const pts = gj.features.filter((f) => f.properties.value), sp = sv.features.filter((f) => f.properties.value);
  assert.equal(pts.length, 84); assert.equal(sp.length, 15);
  const names = gj.features.filter((f) => f.properties.type === 'label').map((f) => f.properties.text);
  for (const n of ['동해', '독도', '이어도 종합 해양 과학 기지']) assert.ok(names.includes(n), n);
  const dokdo = gj.features.find((f) => f.properties.text === '독도').geometry.coordinates;
  assert.ok(geoDistance(dokdo, [131.87, 37.24]) * 6371 < 350, `독도 글자 자리(지면 글자 가운데 — 47쪽 1pt ≈ 1°) ${dokdo}`);
  const L = gj.properties.legend, s200 = L.find((e) => e.label === '200').size, s10 = L.find((e) => e.label === '10').size;
  assert.ok(Math.abs(s200 / s10 - Math.sqrt(20)) < 0.05);
  const sizes = pts.map((f) => f.properties.size);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  assert.ok(sp.every((f) => f.properties.rDeg > 0), '확대 창 원 rDeg');
  assert.equal(sv.properties.legend.length, 0, '확대 창 레이어 범례 숨김');
  assert.deepEqual(gj.properties.symbolStyle, { pxPerPt: 4, maxPx: 36 });
});

test('p47 실리콘 밸리 확대 창 바탕: 틀 점 = 교과서 삽입 틀, 육지 고리', () => {
  const o = JSON.parse(readFileSync(`${D}/inset-p47-hq-sv.json`, 'utf8'));
  const fr = o.features.find((f) => f.properties.kind === 'frame');
  assert.equal(fr.geometry.coordinates.length, 8);
  const xs = fr.geometry.coordinates.map((p) => p[0]), ys = fr.geometry.coordinates.map((p) => p[1]);
  assert.ok(Math.min(...xs) < -122.9 && Math.max(...xs) > -121.3 && Math.min(...ys) < 37 && Math.max(...ys) > 38.1, '샌프란시스코만~산타크루스');
  assert.ok(o.features.some((f) => f.geometry.type === 'Polygon'));
});

test('p47 마킬라도라: 두 계열, 칸 수가 조사 수(파랑 99 · 주황 130), 주 16, 바탕 주 경계 32', () => {
  const L = read('p47-maquila');
  const sum = (c) => L.features.flatMap((f) => f.properties.series).filter((s) => s.cls === c).reduce((a, s) => a + s.count, 0);
  assert.equal(L.properties.legend.length, 2);
  assert.equal(sum('plants'), 99); assert.equal(sum('workers'), 130);
  assert.equal(new Set(L.features.map((f) => f.properties.id)).size, 16);
  const st = read('p47-mex-states');
  assert.equal(st.features.length, 32);
  assert.equal(st.properties.legend[0].style, 'outline');
  // 칸 묶음 밑(또는 지시선 끝)이 붙은 주 면 안 — 바하칼리포르니아 1묶음은 교과서도 바다에 걸침(185km)
  const byKey = new Map(st.features.map((f) => [f.properties.key, f]));
  const out = L.features.filter((f) => !geoContains(byKey.get(f.properties.id), f.properties.leader || f.geometry.coordinates)).map((f) => f.properties.id);
  assert.deepEqual(out, ['MX-BCN']);
});

test('p42·p43 우리나라 윤곽: sameLat 처음 = 교과서 자리, antipode 처음 = 실제 대척점(교과서 514km 동쪽), 지면 글자', () => {
  const a = read('p42-korea'), b = read('p43-korea');
  assert.equal(a.properties.mode, 'sameLat'); assert.equal(b.properties.mode, 'antipode');
  assert.deepEqual(a.properties.home, a.properties.textbook);
  assert.ok(a.properties.home[0] < -125 && a.properties.home[0] > -140 && a.properties.home[1] > 33 && a.properties.home[1] < 43);
  assert.ok(Math.abs(b.properties.offsetKm - 514) < 10, `${b.properties.offsetKm}`);
  assert.deepEqual(a.properties.label, ['같은 축척과', '같은 위도의 우리나라']);
  assert.deepEqual(b.properties.label, ['같은 축척의', '우리나라와 대척점']);
  assert.equal(a.properties.title, '같은 축척과 같은 위도의 우리나라');
});

test('레이어 합계 ≤ 750KB, 기후 래스터 셋 ≤ 300KB(있는 것만)', () => {
  const ids = Object.keys(JSON.parse(readFileSync('scripts/atlas/config/u5.json', 'utf8')).layers);
  const kb = (id) => (existsSync(`${D}/layer-${id}.json`) ? readFileSync(`${D}/layer-${id}.json`).length / 1024 : 0);
  const total = ids.reduce((a, id) => a + kb(id), 0);
  assert.ok(total <= 750, `합계 ${total.toFixed(1)}KB`);
  const climate = ['p45-climate', 'p45-jan', 'p45-jul'].reduce((a, id) => a + kb(id), 0);
  assert.ok(climate <= 300, `기후 ${climate.toFixed(1)}KB`);
});
