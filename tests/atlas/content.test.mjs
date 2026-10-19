// © 2026 김용현
// tests/atlas/content.test.mjs — 주제 내용(build_content.mjs 생성물 sims/atlas-u2-asia/data/topics.json·charts.json·layers.js) 검사
// 개수·경로는 설정 content(expect·photoDir·pageDir·pageFile)에서 읽는다. $ATLAS_WORK 가 없으면 그것이 필요한 검사는 건너뛴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { applyOverrides, parseKey, buildContent, loadInputs, layersModule, validateTopics, pageFileName } from '../../scripts/atlas/build_content.mjs';
import { km, key, WORK } from '../../scripts/atlas/geo_util.mjs';

const DIR = 'sims/atlas-u2-asia/data';
const T = JSON.parse(readFileSync(`${DIR}/topics.json`, 'utf8'));
const C = JSON.parse(readFileSync(`${DIR}/charts.json`, 'utf8'));
const by = Object.fromEntries(T.map((t) => [t.id, t]));
const UNIT = JSON.parse(readFileSync('scripts/atlas/config/u2.json', 'utf8'));
const CFG = UNIT.content, EX = CFG.expect;
const HAS_WORK = existsSync(WORK);
const photoFile = (id, ext = CFG.photoExts[0]) => `${CFG.photoDir}/${id}${ext}`;
const textOptional = (m) => !!m[CFG.schema.markerTextOptionalWith];

test('주제 순서(설정 expect.topics), 쪽 범위 모두 덮음', () => {
  assert.deepEqual(T.map((t) => t.id), EX.topics);
  const pages = new Set(T.flatMap((t) => t.pages)); for (let p = CFG.pages[0]; p <= CFG.pages[1]; p++) assert.ok(pages.has(p), `${p}쪽`);
});

test('개수: 마커·그래프 마커(설정 expect, C3·C4 실측 — 지형 7, 기후 4, 세계유산 11)', () => {
  for (const [id, n] of Object.entries(EX.markers)) assert.equal(by[id].markers.length, n, id);
  for (const [id, n] of Object.entries(EX.chartMarkers)) assert.equal(by[id].markers.filter((m) => m.chart).length, n, id);
});

test('빈 글 없음, 참조한 레이어·사진·그래프가 모두 있음', () => {
  for (const t of T) {
    for (const l of t.layers) assert.ok(existsSync(`${DIR}/${l.ref}.json`), l.ref);
    for (const m of t.markers) {
      assert.ok(m.title && (m.text || textOptional(m)), m.id);
      if (m.photo) for (const ext of CFG.photoExts) assert.ok(existsSync(photoFile(m.photo.id, ext)), `${m.photo.id}${ext}`);
    }
  }
});

// 모든 글 칸이 비어 있지 않다 + 원본 표기(src·…Src·why)는 생성물에 남지 않는다
function* strings(o, path = '') {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) yield* strings(o[i], `${path}[${i}]`); return; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') yield [`${path}.${k}`, k, v]; else yield* strings(v, `${path}.${k}`);
  }
}
test('글 칸이 비어 있지 않고 원본 표기·깨진 글자가 없다', () => {
  for (const [p, k, v] of strings(T)) {
    if (['title', 'text', 'note', 'credit', 'label', 'caption', 'name', 'capital'].includes(k)) assert.ok(v.trim().length > 0, p);
    assert.ok(!/�/.test(v), `${p}: 깨진 글자`);
    assert.ok(!/\?[가-힣]/.test(v), `${p}: 읽지 못한 글리프(?)`);
  }
  const keys = JSON.stringify(T);
  assert.ok(!/"src"|Src"|"why"|"_[a-z]/.test(keys), '원본 표기가 생성물에 남음');
});

test('세계유산 마커 글은 교과서 원문만(만든 글 「국가: … / 관련 종교: …」 없음)', () => {
  for (const m of by.heritage.markers) assert.equal(m.text, undefined, m.id);
  assert.ok(!JSON.stringify(T).includes('국가: '), '만든 글이 남음');
});

test('블록: id 고유, 종류별 필수 칸(설정 schema.blockTypes)과 참조', () => {
  const types = CFG.schema.blockTypes;
  for (const t of T) {
    assert.equal(new Set(t.blocks.map((b) => b.id)).size, t.blocks.length, `${t.id} 블록 id 중복`);
    for (const b of t.blocks) {
      const at = `${t.id}.blocks.${b.id}`;
      assert.ok(b.id, at); assert.ok(types[b.type], `${at}: 모르는 종류 ${b.type}`);
      for (const k of types[b.type].required) if (b.type !== 'photo' || k !== 'ref') assert.ok(b[k] != null && b[k] !== '', `${at}: ${k}`);
      if (b.type === 'chart') assert.ok(C[b.ref], `${at}: 그래프 ${b.ref}`);
      for (const r of b.charts ?? (b.chart ? [b.chart] : [])) assert.ok(C[r], `${at}: 그래프 ${r}`);
      if (b.photo) { assert.ok(existsSync(photoFile(b.photo.id)), at); assert.match(b.photo.url, /^https:\/\//); }
      if (b.type === 'page') {
        assert.ok(t.pages.includes(b.page), `${at}: 주제 쪽 밖 ${b.page}`);
        const f = pageFileName(CFG.pageFile, b.page);
        assert.ok(existsSync(`${CFG.pageDir}/${f}`), at);
        assert.ok(b.url.startsWith('https://') && b.url.endsWith(`/${f}`), b.url);
      }
      if (b.view) assert.ok((t.views ?? []).some((v) => v.id === b.view), `${at}: 없는 보기 ${b.view}`);
    }
  }
  // 주제마다 원본 쪽 보기가 쪽마다 하나씩
  for (const t of T) for (const p of t.pages) assert.ok(t.blocks.some((b) => b.type === 'page' && b.page === p && !b.bbox), `${t.id} ${p}쪽 원본 쪽 보기`);
});

test('그래프: 생성물 charts.json 개수(설정 expect.charts), 모두 어딘가에서 참조', () => {
  assert.equal(Object.keys(C).length, EX.charts);
  const used = new Set();
  for (const t of T) {
    for (const m of t.markers) if (m.chart) used.add(m.chart);
    for (const b of t.blocks) { if (b.type === 'chart') used.add(b.ref); for (const r of b.charts ?? (b.chart ? [b.chart] : [])) used.add(r); }
  }
  assert.deepEqual([...used].sort(), Object.keys(C).sort());
  for (const [id, c] of Object.entries(C)) assert.equal(c.id, id);
});

test('레이어: 종류가 레이어 파일과 같고, 위치 근사·카슈미르 표시', () => {
  for (const t of T) for (const l of t.layers) {
    const gj = JSON.parse(readFileSync(`${DIR}/${l.ref}.json`, 'utf8'));
    assert.equal(l.type, gj.properties?.layerType ?? (gj.url ? 'image' : null), l.ref);
    assert.equal(!!l.approx, !!gj.properties?.approx, `${l.ref} approx`);
    assert.ok(l.label, `${l.ref} label`);
  }
  const sg = by.religion.layers.find((l) => l.ref === 'layer-p22-singapore');
  assert.equal(sg.approx, true); assert.equal(sg.approxNote, '위치 근사');
  assert.equal(by.religion.layers.find((l) => l.ref === 'layer-p22-kashmir').note, '위치: 실제 경계 자료(Natural Earth)');
});

test('마커: 경위도·보기 범위가 정상, 지형 핀(위치 근사 지도)에는 approx', () => {
  const ok = ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
  for (const t of T) {
    assert.ok(ok(t.view.center), `${t.id} view`); assert.equal(t.view.bounds.length, 4);
    for (const v of t.views ?? []) assert.ok(ok(v.center) && v.bounds[0] < v.bounds[2] && v.bounds[1] < v.bounds[3], `${t.id}.${v.id}`);
    for (const m of t.markers) {
      assert.ok(ok(m.lonlat), m.id);
      assert.ok(['pin', 'place', 'source'].includes(m.lonlatFrom), `${m.id} ${m.lonlatFrom}`);
      const [w, s, e, n] = t.view.bounds;
      assert.ok(m.lonlat[0] >= w && m.lonlat[0] <= e && m.lonlat[1] >= s && m.lonlat[1] <= n, `${m.id} 보기 범위 밖`);
    }
  }
  for (const m of by.relief.markers) if (m.lonlatFrom === 'pin') assert.equal(m.approx, true, m.id);
  for (const t of T) for (const m of t.markers) if (m.lonlatFrom !== 'pin' && m.photo?.pin) assert.ok(m.textbookLonlat, m.id);
});

test('기후 마커: 도시 위치(지명)와 그래프 도시가 같다', () => {
  for (const m of by.climate.markers) {
    assert.equal(m.lonlatFrom, 'place');
    assert.ok(C[m.chart].title.startsWith(m.place), `${m.id}: ${m.place} ↔ ${C[m.chart].title}`);
  }
});

test('세계유산: 실제 위치 출처(UNESCO)·교과서 핀 위치·국가와 종교 정답', () => {
  const answerKey = by.heritage.quiz.answerKey;
  for (const m of by.heritage.markers) {
    assert.equal(m.lonlatFrom, 'source');
    assert.match(m.source.url, /^https:\/\/whc\.unesco\.org\/en\/list\/\d+\/$/, m.id);
    assert.equal(m.textbookLonlat.length, 2, m.id);
    assert.ok(km(m.lonlat, m.textbookLonlat) < 600, `${m.id}: 교과서 핀과 ${km(m.lonlat, m.textbookLonlat).toFixed(0)}km`);
    assert.ok(m.quiz.country && m.quiz.religions.length, m.id);
    // 쪽에 인쇄된 정답(answer, 공백 무시) 또는 정답 쪽 원문(answerKey) 안에 있음
    if (m.quiz.answer) assert.equal(key(m.quiz.answer), `${m.quiz.country}${m.quiz.religions.join(',')}`, m.id);
    else assert.ok(key(answerKey).includes(key(`${m.quiz.country}, ${m.quiz.religions.join(', ')}`)), `${m.id}: 정답 원문에 없음`);
  }
  assert.equal(by.heritage.quiz.type, 'heritage');
  assert.equal(by.heritage.quiz.items.length, by.heritage.markers.length);
});

test('색칠하기: 나라 수(설정 expect.coloringCountries), Natural Earth 나라 코드·교과서 이름·수도', () => {
  const q = by.coloring.quiz;
  assert.equal(q.type, 'coloring');
  assert.equal(q.page, CFG.coloring.page);
  assert.equal(q.countries.length, EX.coloringCountries);
  assert.equal(new Set(q.countries.map((c) => c.iso)).size, EX.coloringCountries);
  const places = JSON.parse(readFileSync(`${DIR}/places.json`, 'utf8'));
  const countryNames = new Set(places.filter((p) => CFG.coloring.countryKinds.includes(p.kind)).map((p) => key(p.name)));
  const capitalNames = new Set(places.filter((p) => CFG.coloring.capitalKinds.includes(p.kind)).map((p) => key(p.name)));
  for (const c of q.countries) {
    assert.ok(countryNames.has(key(c.name)), `${c.name}: 교과서 나라 지명 아님`);
    assert.ok(capitalNames.has(key(c.capital)), `${c.name}: 수도 ${c.capital}`);
    assert.match(c.iso, /^[A-Z0-9]{3}$/);
    assert.ok(['printed', 'places', 'places+ne'].includes(c.capitalFrom), c.capitalFrom);
  }
});

test('색칠하기 나라 코드가 Natural Earth 에 있다', { skip: !existsSync(`${WORK}/${CFG.coloring.neCountries}`) && 'Natural Earth 파일 없음' }, () => {
  const codes = new Set(JSON.parse(readFileSync(`${WORK}/${CFG.coloring.neCountries}`, 'utf8')).features.map((f) => f.properties.ADM0_A3));
  for (const c of by.coloring.quiz.countries) assert.ok(codes.has(c.iso), `${c.name}: ${c.iso}`);
});

test('overrides: 키 형식(markers.<id>·blocks.<id>·layers.<ref>·quiz)·from 필수·없는 칸·낡은 값·금지 이름', () => {
  assert.deepEqual(parseKey('relief.markers.r-gobi.text'), { topic: 'relief', path: [{ coll: 'markers', id: 'r-gobi' }, 'text'] });
  assert.deepEqual(parseKey('general.blocks.asia-text.title'), { topic: 'general', path: [{ coll: 'blocks', id: 'asia-text' }, 'title'] });
  assert.deepEqual(parseKey('climate.layers.layer-p21-jan.label'), { topic: 'climate', path: [{ coll: 'layers', id: 'layer-p21-jan' }, 'label'] });
  assert.deepEqual(parseKey('heritage.quiz.answerKey'), { topic: 'heritage', path: ['quiz', 'answerKey'] });
  assert.deepEqual(parseKey('heritage.markers.h01.quiz.country'), { topic: 'heritage', path: [{ coll: 'markers', id: 'h01' }, 'quiz', 'country'] });
  for (const bad of ['general.blocks[0].title', 'a', 'a..b', 'a.markers.m1', 'a.__proto__.x', 'a.markers.m1.constructor', 'prototype.x'])
    assert.throws(() => parseKey(bad), Error, bad);
  const topics = [{ id: 'a', markers: [{ id: 'm1', text: 'x' }], blocks: [{ id: 'b1', title: '가 나' }], layers: [{ ref: 'L-1', label: 'p' }] }];
  const out = applyOverrides(topics, {
    'a.markers.m1.text': { value: 'y', from: 'x' }, 'a.blocks.b1.title': { value: '가나', from: '가 나' },
    'a.layers.L-1.note': { value: '새 칸', from: null },
  });
  assert.equal(out[0].markers[0].text, 'y'); assert.equal(out[0].blocks[0].title, '가나'); assert.equal(out[0].layers[0].note, '새 칸');
  assert.equal(topics[0].markers[0].text, 'x', '입력은 그대로');
  assert.throws(() => applyOverrides(topics, { 'a.markers.m1.text': { value: 'y' } }), /from/);
  assert.throws(() => applyOverrides(topics, { 'a.markers.m9.text': { value: 'y', from: 'x' } }), /m9/);
  assert.throws(() => applyOverrides(topics, { 'b.blocks.b1.title': { value: 'y', from: '가 나' } }), /주제 b/);
  assert.throws(() => applyOverrides(topics, { 'a.blocks.b9.title': { value: 'y', from: '가 나' } }), /b9/);
  assert.throws(() => applyOverrides(topics, { 'a.markers.m1.title': { value: 'y', from: 'x' } }), /칸 title 없음/);
  assert.throws(() => applyOverrides(topics, { 'a.markers.m1.text': { value: 'y', from: null } }), /null/);
  assert.throws(() => applyOverrides(topics, { 'a.markers.m1.text': { value: 'y', from: 'z' } }), /낡은/);
  assert.equal(Object.prototype.polluted, undefined);
});

test('실제 overrides.json: 모든 키에 from, 모두 풀리고 생성물에 반영됨', () => {
  const ov = JSON.parse(readFileSync('content/atlas/u2/overrides.json', 'utf8')).items;
  const src = JSON.parse(readFileSync('content/atlas/u2/topics.json', 'utf8'));
  applyOverrides(src, ov);   // 던지지 않음
  for (const [k, o] of Object.entries(ov)) {
    assert.ok('from' in o, k);
    const { topic, path } = parseKey(k);
    let node = by[topic];
    for (const p of path) node = typeof p === 'object' ? node[p.coll].find((x) => x[p.coll === 'layers' ? 'ref' : 'id'] === p.id) : node[p];
    assert.equal(node, o.value, k);
  }
});

test('원본 형식 검사: 모르는 키·종류, id 중복, 필수 칸은 경고(조용히 버리지 않음)', () => {
  const S = CFG.schema;
  const base = () => [{ id: 'a', title: 'A', pages: [1], blocks: [{ id: 'b1', type: 'text', text: 'x' }], markers: [{ id: 'm1', title: 't', text: 'x' }], layers: [], quiz: null }];
  assert.deepEqual(validateTopics(base(), S), []);
  const cases = [
    [(t) => { t[0].blocks[0].colour = 1; }, /모르는 키 colour/],
    [(t) => { t[0].blocks[0].type = 'poem'; }, /모르는 블록 종류 poem/],
    [(t) => { delete t[0].blocks[0].id; }, /id 필수/],
    [(t) => { t[0].blocks.push({ id: 'b1', type: 'page', page: 1 }); }, /blocks: id 중복 b1/],
    [(t) => { t[0].markers.push({ id: 'm1', title: 'u' }); }, /markers: id 중복 m1/],
    [(t) => { t.push({ ...t[0] }); }, /주제 id 중복: a/],
    [(t) => { t[0].markers[0].quiz = { country: 'x', colour: 1 }; }, /quiz: 모르는 키 colour/],
    [(t) => { t[0].quiz = { type: 'trivia' }; }, /모르는 퀴즈 종류 trivia/],
    [(t) => { t[0].extra = 1; }, /a: 모르는 키 extra/],
    [(t) => { delete t[0].title; }, /id·title 필수/],
  ];
  for (const [mut, re] of cases) { const t = base(); mut(t); assert.ok(validateTopics(t, S).some((w) => re.test(w)), String(re)); }
  // 원본 표기 키(src·…Src·why·_)는 허용
  const t = base(); t[0].blocks[0].src = { page: 1, bbox: [0, 0, 1, 1] }; t[0].blocks[0].titleSrc = { page: 1, bbox: [0, 0, 1, 1] }; t[0]._note = 'x';
  assert.deepEqual(validateTopics(t, S), []);
});

test('layers.js: 참조한 레이어만 정적 import, fetch 없음, 이상한 ref 는 거부', () => {
  const js = readFileSync(`${DIR}/layers.js`, 'utf8');
  const refs = [...new Set(T.flatMap((t) => t.layers.map((l) => l.ref)))].sort();
  const imported = [...js.matchAll(/^import \w+ from '\.\/([\w-]+)\.json';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imported, refs);
  for (const r of refs) assert.ok(js.includes(`'${r}': `), r);
  assert.ok(!/\bfetch\s*\(|\bimport\s*\(/.test(js));
  assert.equal(layersModule(refs), js);
  for (const bad of ["a'b", '../x', 'a b', 'a.json']) assert.throws(() => layersModule([bad]), /쓸 수 없는/, bad);
});

test('다시 만들어도 생성물이 바이트까지 같다', { skip: !HAS_WORK && `작업 폴더 없음(${WORK})` }, () => {
  const a = buildContent(loadInputs()), b = buildContent(loadInputs());
  assert.deepEqual(a.warnings, []);
  assert.equal(JSON.stringify(a.topics), JSON.stringify(b.topics));
  assert.equal(JSON.stringify(a.topics), readFileSync(`${DIR}/topics.json`, 'utf8').trimEnd());
  assert.equal(JSON.stringify(a.charts), readFileSync(`${DIR}/charts.json`, 'utf8').trimEnd());
});

test('원본에 모르는 키가 있으면 빌드가 경고(쓰지 않음)', { skip: !HAS_WORK && `작업 폴더 없음(${WORK})` }, () => {
  const inp = loadInputs();
  inp.topics = structuredClone(inp.topics); inp.topics[0].blocks[0].typo = 1;
  assert.ok(buildContent(inp).warnings.some((w) => /모르는 키 typo/.test(w)));
});

test('출처 글: 설정 expectCredits 의 출처가 모두 주제 자료(topics·charts)에 있다', () => {
  const hay = key(JSON.stringify(T) + JSON.stringify(C));
  for (const [p, list] of Object.entries(CFG.expectCredits)) {
    if (!/^\d+$/.test(p)) continue;
    for (const c of list) assert.ok(hay.includes(key(c)), `${p}쪽 출처 ${c}`);
  }
  const sg = by.religion.blocks.find((b) => b.role === 'subtitle' && b.view === 'singapore');
  assert.equal(sg.credit, '(Public Holidays Global, 2023)');
});

test('범례 제목: 교과서가 범례 제목을 인쇄한 레이어에 legendTitle(선 범례는 lineLegendTitle)', () => {
  const L = Object.fromEntries(T.flatMap((t) => t.layers.map((l) => [l.ref, l])));
  const want = {
    'layer-p21-climate': ['기후 구분'], 'layer-p21-jan': ['강수량(mm)', '기온 (°C)'], 'layer-p21-jul': ['강수량(mm)', '기온 (°C)'],
    'layer-p22-religion': ['지역별 종교 분포 비율'], 'overlay-p23-density': ['인구 밀도(명/km²)'], 'layer-p23-density-cities': ['인구'],
    'layer-p23-growth': ['인구 증가율(%)'], 'layer-p24-trade': ['우리나라와의 무역액(억 달러, 2022)', '우리나라의 수출입액 (백억 달러, 2022)'],
  };
  for (const [ref, [area, line]] of Object.entries(want)) {
    assert.equal(L[ref].legendTitle, area, ref);
    assert.equal(L[ref].lineLegendTitle, line, `${ref} 선`);
  }
  for (const l of Object.values(L)) if (!(l.ref in want)) assert.equal(l.legendTitle, undefined, `${l.ref}: 교과서에 범례 제목 없음`);
});

test('인구 밀도 음영 범례: 지면 범례 단계 수(설정 expectLegend)만큼 색·이름', () => {
  const ov = JSON.parse(readFileSync(`${DIR}/overlay-p23-density.json`, 'utf8'));
  const oc = UNIT.photos.overlays.find((o) => o.id === 'p23-density');
  assert.equal(ov.legend.length, oc.expectLegend);
  for (const e of ov.legend) { assert.match(e.color, /^#[0-9a-f]{6}$/); assert.ok(e.label.trim()); }
  assert.equal(by.population.layers.find((l) => l.ref === 'overlay-p23-density').legendTitle, '인구 밀도(명/km²)');
});

test('낡은 산출물 검사: 도장(입력 내용 해시)이 다르면 무엇을 먼저 돌릴지 알리고 멈춤', async () => {
  const { checkStamp } = await import('../../scripts/atlas/build_content.mjs');
  const { stampHash } = await import('../../scripts/atlas/geo_util.mjs');
  for (const name of Object.keys(CFG.stamps).filter((k) => !k.startsWith('_'))) {
    assert.doesNotThrow(() => checkStamp(UNIT, name, stampHash(UNIT, name), 'x'));
    assert.throws(() => checkStamp(UNIT, name, 'deadbeef', '먼저 할 일'), /먼저 할 일 먼저/);
    assert.throws(() => checkStamp(UNIT, name, undefined, 'x'), /도장 없음/);
  }
  // 설정 부분이 바뀌면 해시도 바뀐다(설명 키 _… 는 상관없음)
  const u2 = structuredClone(UNIT); u2.content.coloring.nearKm += 1;
  assert.notEqual(stampHash(u2, 'coloring'), stampHash(UNIT, 'coloring'));
  const u3 = structuredClone(UNIT); u3.content.coloring._nearKm = '바뀐 설명';
  assert.equal(stampHash(u3, 'coloring'), stampHash(UNIT, 'coloring'));
});
