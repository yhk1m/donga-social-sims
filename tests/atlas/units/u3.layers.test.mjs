// © 2026 김용현
// tests/atlas/units/u3.layers.test.mjs — Ⅲ 유럽 주제 레이어 생성물(sims/atlas-u3-europe/data/layer-*.json) 검사 (U3-4)
//   분류 이름은 교과서 범례 글자 그대로. 나라 단위 단계구분도(countryClass)는 {iso: cls | [cls…]}.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, statSync } from 'node:fs';

const D = 'sims/atlas-u3-europe/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
/** countryClass: iso → 범례 이름 목록 */
const labelsOf = (L, iso) => { const by = Object.fromEntries(L.legend.map((e) => [e.cls, e.label])); return [].concat(L.classes[iso] ?? []).map((c) => by[c]); };

test('p32 EU: 영국 = 탈퇴, 튀르키예 = 가입 희망, 독일 = 가입 + 유로', () => {
  const L = read('p32-eu');
  assert.deepEqual(labelsOf(L, 'GBR'), ['유럽 연합 탈퇴 국가']);
  assert.deepEqual(labelsOf(L, 'TUR'), ['유럽 연합 가입 희망 국가']);
  assert.deepEqual(labelsOf(L, 'DEU'), ['유럽 연합 가입 국가', '유로 사용 국가']);
  assert.equal(L.legend.find((e) => e.label === '유로 사용 국가').style, 'outline');
});

test('p32 EU 작은 나라 고침(U3-3 리뷰): 리히텐슈타인 없음, 룩셈부르크·몰타 가입 + 유로, 모나코 유로만, 스위스·노르웨이 없음', () => {
  const L = read('p32-eu');
  for (const iso of ['LIE', 'CHE', 'NOR', 'GGY', 'JEY']) assert.deepEqual(labelsOf(L, iso), [], iso);
  for (const iso of ['LUX', 'MLT', 'CYP', 'CYN']) assert.deepEqual(labelsOf(L, iso), ['유럽 연합 가입 국가', '유로 사용 국가'], iso);
  for (const iso of ['MCO', 'SMR', 'VAT', 'AND']) assert.deepEqual(labelsOf(L, iso), ['유로 사용 국가'], iso);
  // 10a 에만 있는 나라(Natural Earth 10m)도 분류 — 키프로스의 영국 기지·완충 지대는 섬 전체와 같게, 지브롤터는 영국과 같게
  for (const iso of ['ESB', 'WSB', 'CNM']) assert.deepEqual(labelsOf(L, iso), labelsOf(L, 'CYP'), iso);
  assert.deepEqual(labelsOf(L, 'GIB'), ['유럽 연합 탈퇴 국가']);
  for (const o of L.overrides) assert.ok(o.why, o.iso);
});

test('p30 도시화율: 나라 분류 수 ≥ 35, 범례 5단계 모두 있음, 러시아 70~80, 바티칸 고침 80~100', () => {
  const L = read('p30-urban');
  assert.ok(Object.keys(L.classes).length >= 35, `${Object.keys(L.classes).length}`);
  assert.equal(L.legend.length, 5); assert.ok(L.legend.every((e) => e.present));
  assert.deepEqual(labelsOf(L, 'RUS'), ['70~80']);
  assert.deepEqual(labelsOf(L, 'VAT'), ['80~100']);
  assert.deepEqual(labelsOf(L, 'LIE'), ['50 이하']);   // 교과서가 따로 칠함(도시화율 약 14%)
  for (const iso of ['TUR', 'MAR', 'KAZ']) assert.deepEqual(labelsOf(L, iso), [], iso);   // 교과서 회색(유럽 밖)
});

/** 점 [lon, lat] 이 MultiPolygon 안인가(짝수-홀수 규칙, 작은 지역이라 평면으로) */
const inRing = (R, [x, y]) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, yi] = R[i], [xj, yj] = R[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inMulti = (g, p) => g.coordinates.some((poly) => inRing(poly[0], p) && !poly.slice(1).some((h) => inRing(h, p)));

test('p29 기후 구분: 범례 10(면 8 + 지도에 없는 2), 경위도가 유럽, 아이슬란드는 삽입 지도의 툰드라', () => {
  const gj = read('p29-climate');
  const leg = gj.properties.legend;
  assert.equal(leg.length, 10);
  assert.deepEqual(leg.filter((e) => e.geometry === false).map((e) => e.label), ['온대 겨울 건조 기후', '냉대 겨울 건조 기후']);
  const cls = new Set(gj.features.map((f) => f.properties.cls));
  assert.equal(cls.size, 8, `분류 ${cls.size}`);
  assert.deepEqual([...new Set(leg.map((e) => e.group))], ['건조', '온대', '냉대', '한대']);
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -30 && lon < 70 && lat > 30 && lat < 82, f.properties.label); }
  const at = (p) => gj.features.filter((f) => inMulti(f.geometry, p)).map((f) => [f.properties.label, f.properties.src]);
  assert.deepEqual(at([-18, 65]), [['툰드라 기후', 'p29-climate-iceland']]);
  assert.deepEqual(at([2.35, 48.86]), [['서안 해양성 기후', 'p29-climate']]);         // 파리
  assert.deepEqual(at([37.6, 55.75]), [['냉대 습윤 기후', 'p29-climate']]);           // 모스크바
  assert.deepEqual(at([46.5, 46.6]).map((x) => x[0]), ['사막 기후']);                 // 카스피해 북서 저지(지도색 #fed08f → 사막)
  assert.deepEqual(at([5, 33]), []);                                                // 북아프리카는 교과서에서 흰 덮개로 가림
});

test('p29 1월·7월: 강수 5단계 면 + 등온선(값 붙은 선), 7월 200 이상은 범례에만', () => {
  const jan = read('p29-jan'), jul = read('p29-jul');
  const vals = (L) => [...new Set(L.features.filter((f) => f.properties.type === 'isotherm').map((f) => f.properties.value))].sort((a, b) => a - b);
  assert.deepEqual(vals(jan), [-20, -10, 0, 10]);
  assert.deepEqual(vals(jul), [10, 20]);
  const areaCls = (L) => new Set(L.features.filter((f) => f.properties.type === 'area').map((f) => f.properties.label));
  assert.equal(areaCls(jan).size, 5);
  assert.deepEqual([...areaCls(jul)].sort(), ['100~200', '25 미만', '25~50', '50~100']);
  assert.equal(jul.properties.legend.find((e) => e.label === '200 이상').geometry, false);
  for (const L of [jan, jul]) for (const f of L.features) if (f.properties.centroid) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -30 && lon < 70 && lat > 30 && lat < 82); }
});

test('p30 도시 인구 원: 5단계(겹친 원 범례) + 사례 도시 6, 1,000만 이상 = 파리·모스크바', () => {
  const L = read('p30-cities');
  const syms = L.features.filter((f) => f.properties.type === 'symbol');
  const by = (label) => syms.filter((f) => f.properties.kind === label);
  assert.equal(L.properties.legendStyle, 'nested-circles'); assert.equal(L.properties.sizeBy, 'class');
  assert.deepEqual(L.properties.legend.map((e) => e.label), ['1,000 이상', '300~1,000', '100~300', '50~100', '30~50', '사례 도시']);
  const sizes = L.properties.legend.slice(0, 5).map((e) => e.size);
  assert.deepEqual([...sizes].sort((a, b) => b - a), sizes);
  for (const e of L.properties.legend.slice(0, 5)) assert.ok(by(e.label).length > 0, e.label);
  const big = by('1,000 이상').map((f) => f.geometry.coordinates);
  assert.equal(big.length, 2);
  const near = ([lon, lat], [x, y], d) => Math.abs(lon - x) < d && Math.abs(lat - y) < d;
  assert.ok(big.some((p) => near(p, [2.35, 48.86], 0.6)) && big.some((p) => near(p, [37.6, 55.75], 0.8)), JSON.stringify(big));
  const cases = by('사례 도시');
  assert.deepEqual(cases.map((f) => f.properties.name).sort(), ['런던', '로테르담', '베네치아', '빌바오', '소피아 앙티폴리스', '슈투트가르트']);
  const ven = cases.find((f) => f.properties.name === '베네치아').geometry.coordinates;
  assert.ok(near(ven, [12.33, 45.44], 0.5), `${ven}`);
  assert.ok(syms.length > 150 && syms.length < 300, `${syms.length}`);
});

test('p31 녹색 수도: 도시 15, 이름 = 지면 「도시(연도)」, 위치가 실제 도시와 0.6° 안', () => {
  const L = read('p31-green-capital');
  const syms = L.features.filter((f) => f.properties.type === 'symbol');
  assert.equal(syms.length, 15);
  for (const f of syms) assert.match(f.properties.name, /^[가-힣]+\((20(1\d|2[0-4]))\)$/);
  assert.equal(new Set(syms.map((f) => f.properties.name.slice(-5, -1))).size, 15);   // 2010~2024 한 해 하나
  const at = Object.fromEntries(syms.map((f) => [f.properties.name.replace(/\(.*/, ''), f.geometry.coordinates]));
  const want = { 스톡홀름: [18.07, 59.33], 오슬로: [10.75, 59.91], 탈린: [24.75, 59.44], 코펜하겐: [12.57, 55.68], 리스본: [-9.14, 38.72], 류블랴나: [14.51, 46.06] };
  for (const [n, [lon, lat]] of Object.entries(want)) assert.ok(Math.abs(at[n][0] - lon) < 0.6 && Math.abs(at[n][1] - lat) < 0.6, `${n} ${at[n]}`);
});

test('p31 리스본 사례: 도시 10 × 값 2(충전소·사람 아이콘, 지면 글자 그대로)', () => {
  const L = read('p31-lisbon');
  const syms = L.features.filter((f) => f.properties.type === 'symbol');
  assert.equal(syms.length, 10);
  const v = Object.fromEntries(syms.map((f) => [f.properties.name, f.properties.values.map((x) => `${x.icon}:${x.text}`)]));
  assert.deepEqual(v['리스본'], ['charger:2.09', 'person:7.1']);
  assert.deepEqual(v['오슬로'], ['charger:5.47', 'person:39.8']);
  assert.deepEqual(v['헬싱키'], ['charger:1.16', 'person:13.8']);
  assert.deepEqual(L.properties.valueLegend.map((x) => x.icon), ['charger', 'person']);
});
