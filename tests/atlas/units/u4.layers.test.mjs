// © 2026 김용현
// tests/atlas/units/u4.layers.test.mjs — Ⅳ 아프리카 주제 레이어 생성물(sims/atlas-u4-africa/data/layer-*.json) 검사 (U4-4)
//   분류 이름은 교과서 범례 글자 그대로. 나라 단위 단계구분도(countryClass)는 {iso: cls | [cls…]}(줄무늬면 배열).
//   계획 시험에서 바꾼 것(실측 — 계획 「실행 중 결정」 U4-4): 고리 기호 자리는 설정 lonlat(아프리카 둘레 바다 — 리뷰 결정),
//   태양광 지명은 properties.text(지역 이름 글자 꼴), 소말릴란드는 소말리아와 같은 값(Q3 — U4-9 합치기 전후 모두 맞게).
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { geoContains, geoDistance } from 'd3-geo';
import { WORK } from '../../../scripts/atlas/geo_util.mjs';

const D = 'sims/atlas-u4-africa/data';
const read = (id) => JSON.parse(readFileSync(`${D}/layer-${id}.json`, 'utf8'));
const cls = (L, iso) => [].concat(L.classes[iso] ?? []).map((c) => L.legend.find((x) => x.cls === c)?.label);

test('p37 기후 구분: 범례 10(열대 3·건조 2·온대 4 묶음 + 고산 빗금), 면 경위도가 아프리카', () => {
  const gj = read('p37-climate');
  assert.equal(gj.properties.legend.length, 10);
  const groups = gj.properties.legend.map((e) => e.group ?? null);
  assert.deepEqual(groups, ['열대', '열대', '열대', '건조', '건조', '온대', '온대', '온대', '온대', null]);
  assert.equal(gj.properties.legend.at(-1).pattern, 'hatch');
  assert.equal(gj.features.length, 10, '분류마다 면 하나(온난 습윤도 — 남아공 동해안 띠)');
  for (const f of gj.features) { const [lon, lat] = f.properties.centroid; assert.ok(lon > -26 && lon < 60 && lat > -36 && lat < 38, f.properties.label); }
});

test('p37 1월·7월: 강수 7단계 + 등온선(값 10·20·30), 범례 견본 선은 뽑지 않음', () => {
  for (const id of ['p37-jan', 'p37-jul']) {
    const gj = read(id);
    assert.equal(gj.properties.legend.length, 8, id);
    const iso = gj.features.filter((f) => f.properties.type === 'isotherm');
    assert.ok(iso.length >= 5, `${id} 등온선 ${iso.length}`);
    for (const f of iso) assert.ok([10, 20, 30].includes(f.properties.value), `${id} 값 ${f.properties.value}`);
    for (const f of iso) for (const [lon] of f.geometry.coordinates.flat(f.geometry.type === 'MultiLineString' ? 1 : 0)) assert.ok(lon > -30, `${id} 바다 먼 곳에 선 없음 ${lon}`);
  }
});

test('p38 언어: 줄무늬 나라 있음, 이집트 = 아랍어 하나, 모로코 = 아랍어 + 다른 것, 남아공 세 색', () => {
  const L = read('p38-language'); assert.equal(L.multiFill, 'stripes');
  assert.equal(L.legend.length, 8);
  assert.deepEqual(cls(L, 'EGY'), ['아랍어']);
  assert.ok(cls(L, 'MAR').includes('아랍어') && cls(L, 'MAR').length >= 2);
  assert.ok(Object.values(L.classes).filter(Array.isArray).length >= 8);
  assert.deepEqual(cls(L, 'ZAF'), ['아프리칸스어', '영어', '기타']);
  assert.deepEqual(cls(L, 'SAH'), cls(L, 'MAR'), '서사하라 = 모로코와 같은 줄무늬(교과서)');
  assert.deepEqual(cls(L, 'SOL'), cls(L, 'SOM'), '소말릴란드 = 소말리아(Q3)');
  for (const iso of ['GHA', 'GMB']) assert.deepEqual(cls(L, iso), ['영어'], iso);
  for (const iso of ['TGO', 'BEN']) assert.deepEqual(cls(L, iso), ['프랑스어'], iso);
  assert.deepEqual(cls(L, 'GNQ'), ['프랑스어', '포르투갈어', '에스파냐어'], '적도 기니 세 색 — 에스파냐어 범례가 쓰이는 유일한 나라');
});

test('나라 단위 레이어 공통: Q4·Q5 분류 없음(비르 타윌·아프리카 밖 나라), 고침마다 까닭', () => {
  for (const id of ['p38-language', 'p38-resources', 'p39-afcfta']) {
    const L = read(id);
    for (const iso of ['BRT', 'FRA', 'ESP', 'PRT', 'YEM', 'SHN', 'ISR', 'GBR']) assert.equal(L.classes[iso] ?? null, null, `${id} ${iso}`);
    for (const o of L.overrides) assert.ok(o.why, `${id} ${o.iso}`);
    assert.ok(L.legend.every((e) => e.present), `${id} 범례 분류마다 나라 있음`);
  }
});

test('p38 종교: 4분류 모두 면', () => {
  const gj = read('p38-religion');
  assert.deepEqual(gj.properties.legend.map((e) => e.label), ['이슬람교', '크리스트교', '토속 종교', '비거주지']);
  assert.deepEqual([...new Set(gj.features.map((f) => f.properties.cls))].sort(), ['c1', 'c2', 'c3', 'c4']);
});

test('p38 자원: 생산국 10(범례 = 나라 이름), 콩고 민주 공화국·레소토', () => {
  const L = read('p38-resources'); assert.equal(Object.keys(L.classes).length, 10);
  assert.equal(L.legend.length, 10);
  assert.deepEqual(cls(L, 'COD'), ['콩고 민주 공화국']);
  assert.deepEqual(cls(L, 'LSO'), ['레소토']);
  assert.equal(L.classes.DZA ?? null, null, '알제리는 생산국 아님(경계 어긋남 표본 고침)');
});

// 고리 자리 규칙(U4-4 리뷰): 아프리카 둘레 바다 — 가운데가 땅 밖, 둘레 상자 안, 아프리카 밖 땅에서 RING_KM 넘게(기본 보기 원판 반지름 약 600km)
const RING_KM = 700;
const ringItems = () => JSON.parse(readFileSync('scripts/atlas/config/u4.json', 'utf8')).layers['p38-resource-charts'].items;
function checkRingSpots(spots) {
  const ne = `${WORK}/raw/ne/ne_50m_admin_0_countries.geojson`;
  assert.ok(existsSync(ne), `Natural Earth 50m 나라가 있어야 함 ${ne}`);
  const gj = JSON.parse(readFileSync(ne, 'utf8'));
  const african = (f) => f.properties.CONTINENT === 'Africa' || ['MUS', 'SYC', 'CPV', 'STP', 'COM'].includes(f.properties.ADM0_A3);
  for (const [id, ll] of spots) {
    const [lon, lat] = ll;
    assert.ok(lon > -30 && lon < 70 && lat > -42 && lat < 38, `${id} 아프리카 둘레 상자 밖 ${ll}`);
    const land = gj.features.find((f) => geoContains(f, ll));
    assert.equal(land?.properties.ADM0_A3 ?? null, null, `${id} 가운데가 땅 위 ${ll}`);
    let near = Infinity, who = '';
    for (const f of gj.features) {
      if (african(f)) continue;
      for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
        for (const q of poly[0]) { const d = geoDistance(ll, q) * 6371; if (d < near) { near = d; who = f.properties.ADM0_A3; } }
    }
    assert.ok(near > RING_KM, `${id} 아프리카 밖 땅(${who})에서 ${Math.round(near)}km — ${RING_KM}km 넘어야 함`);
  }
}

test('p38 자원 고리 7 자리(설정 — 그래프 자료 없이 지금 돎): 아프리카 둘레 바다, 교과서 배치 차례, 자리마다 까닭', () => {
  const items = ringItems();
  assert.deepEqual(items.map((x) => x.chart), ['p38-bauxite', 'p38-uranium', 'p38-diamond', 'p38-chromium', 'p38-cobalt', 'p38-platinum', 'p38-manganese']);
  for (const it of items) assert.ok(Array.isArray(it.lonlat) && it._why, `${it.chart} lonlat·_why`);
  checkRingSpots(items.map((it) => [it.chart, it.lonlat]));
  // 교과서 배치: 왼쪽 열(보크사이트·크롬·우라늄·백금)은 서쪽, 오른쪽 열(다이아몬드·코발트·망간)은 동쪽, 열마다 위→아래 차례
  const at = Object.fromEntries(items.map((it) => [it.chart.slice(4), it.lonlat]));
  for (const k of ['bauxite', 'chromium', 'uranium', 'platinum']) assert.ok(at[k][0] < 15, k);
  for (const k of ['diamond', 'cobalt', 'manganese']) assert.ok(at[k][0] > 45, k);
  const desc = (ks) => ks.every((k, i) => !i || at[ks[i - 1]][1] > at[k][1]);
  assert.ok(desc(['bauxite', 'chromium', 'uranium', 'platinum']) && desc(['diamond', 'cobalt', 'manganese']));
});

const CHARTS = `${WORK}/units/u4/tables/charts-u4.json`;
test('p38 자원 고리 7 레이어: 그래프 자료(U4-7)가 생기면 레이어 파일도 있어야 하고 자리 = 설정', { skip: !existsSync(CHARTS) && 'U4-7 그래프 자료 전(그래프 자료가 생기면 이 시험이 돎 — 레이어가 없으면 실패)' }, () => {
  assert.ok(existsSync(`${D}/layer-p38-resource-charts.json`), '그래프 자료가 있는데 고리 레이어가 없음 — build_layers --unit u4 p38-resource-charts');
  const C = read('p38-resource-charts'); assert.equal(C.items.length, 7);
  assert.deepEqual(C.items.map((x) => x.lonlat), ringItems().map((x) => x.lonlat));
  checkRingSpots(C.items.map((it) => [it.id, it.lonlat]));
});

test('p38 태양광: 범례 6, 동해·독도·이어도 글자, 세계 범위', () => {
  const gj = read('p38-solar'); assert.equal(gj.properties.legend.length, 6);
  const names = gj.features.filter((f) => f.geometry.type === 'Point').map((f) => f.properties.text);
  for (const n of ['동해', '독도', '이어도 종합 해양 과학 기지']) assert.ok(names.includes(n), n);
  const dokdo = gj.features.find((f) => f.properties.text === '독도').geometry.coordinates;
  assert.ok(Math.abs(dokdo[0] - 132) < 2.5 && Math.abs(dokdo[1] - 37.5) < 2.5, `독도 글자 자리 ${dokdo}`);
  const lons = gj.features.filter((f) => f.geometry.type === 'MultiPolygon').flatMap((f) => f.geometry.coordinates.flat(2).map((p) => p[0]));
  assert.ok(lons.some((x) => x < -10) && lons.some((x) => x > 100 && x < 180) && lons.some((x) => x < -60 || x > 200), '아프리카·아시아·아메리카 모두(태평양 중심)');
});

test('p39 사막화: 점무늬·빗금 분류가 하나씩, 범례 8, 위험성 5단계 묶음', () => {
  const gj = read('p39-desert'); const leg = gj.properties.legend;
  assert.equal(leg.length, 8);
  assert.equal(leg.filter((x) => x.pattern === 'dots').length, 1);
  assert.equal(leg.filter((x) => x.pattern === 'hatch').length, 1);
  assert.deepEqual(leg.filter((x) => x.group === '사막화의 위험성').map((x) => x.label), ['매우 높음', '높음', '보통', '낮음', '매우 낮음']);
  assert.equal(gj.features.length, 8);
});

test('p39 AfCFTA: 3분류, 에리트레아만 협정 서명 전, 소말릴란드 = 소말리아, 서사하라 비준 완료, 작은 섬나라 동그라미 → 비준 완료', () => {
  const L = read('p39-afcfta'); assert.equal(L.legend.length, 3);
  assert.deepEqual(Object.entries(L.classes).filter(([, c]) => c === 'c3').map(([i]) => i), ['ERI']);
  assert.deepEqual(cls(L, 'SOL'), cls(L, 'SOM'));
  assert.deepEqual(cls(L, 'SOM'), ['협정 서명']);
  assert.deepEqual(cls(L, 'SAH'), ['비준 완료']);
  for (const iso of ['CPV', 'STP', 'COM', 'SYC', 'MUS']) assert.deepEqual(cls(L, iso), ['비준 완료'], iso);
});

test('미확정 국경: 선 레이어 하나, 범례 「미확정 국경」 점선', () => {
  const gj = read('ne-disputed');
  assert.deepEqual(gj.properties.legend.map((e) => [e.label, e.dashed]), [['미확정 국경', true]]);
});

test('레이어 합계 용량 ≤ 650KB(계획 예산)', () => {
  const kb = readdirSync(D).filter((f) => f.startsWith('layer-')).reduce((a, f) => a + statSync(`${D}/${f}`).size, 0) / 1024;
  assert.ok(kb <= 650, `${kb.toFixed(1)} KB`);
});
