// © 2026 김용현
// tests/atlas/regressUnit.test.mjs — 단원 일반 회귀 도구(scripts/atlas/regress_unit.mjs) 명세 검사(U4-G0)
//   명세(unitSpec)만 본다 — 해시·캡처 비교는 실제 기준선으로 `--check` 해서 확인(계획 U4-G0 Step 4·5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { unitSpec, pagePrefixes, workPattern, need, hashable, staleWarnings, missingInputs } from '../../scripts/atlas/regress_unit.mjs';

const W = { ATLAS_WORK: 'C:/W' };

test('쪽 접두: 단원 표 pages 범위', () => {
  assert.deepEqual(pagePrefixes([16, 25]), ['p16', 'p17', 'p18', 'p19', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25']);
  assert.deepEqual(pagePrefixes([34, 39]), ['p34', 'p35', 'p36', 'p37', 'p38', 'p39']);
  assert.throws(() => pagePrefixes(null), /pages/);
  assert.throws(() => pagePrefixes([30, 26]), /pages/);
});

test('u2 명세는 regress_u2 옛 목록·자리 그대로(기준선을 다시 찍지 않아도 맞게)', () => {
  const s = unitSpec('u2', W);
  assert.deepEqual(s.repoDirs, ['sims/atlas-u2-asia/data', 'content/atlas/u2', 'docs/assets/atlas/u2', 'docs/assets/atlas/common']);
  assert.equal(s.embed, 'embed/atlas-u2-asia.html');
  assert.equal(s.base, 'C:/W/units/u2/baseline'); assert.equal(s.shots, 'C:/W/shots/e2'); assert.equal(s.compare, 'C:/W/compare-u2.html');
  assert.equal(s.compareName, 'compare-u2.html');
  assert.deepEqual(s.workExtra, ['text/p17-labels.json', 'tables/charts-u2.json', 'tables/climate-world.json', 'tables/index.json']);
  assert.deepEqual(s.prefixes, pagePrefixes([16, 25]));
});

test('u2 작업 파일 무늬는 옛 정규식과 같은 파일을 고른다', () => {
  const p = workPattern(pagePrefixes([16, 25]));
  const names = ['p16-a.json', 'p25-x.json', 'p26-europe.json', 'p15-a.json', 'p2-a.json', 'p17.json'];
  const old = /^p(1[6-9]|2[0-5])-.*\.json$/;
  assert.deepEqual(names.filter((n) => p.vec.test(n)), names.filter((n) => old.test(n)));
  const fits = ['p17-coloring.fit.json', 'p20a.fit.json', 'p26-europe.fit.json', 'p17-coloring.raw.geojson'];
  assert.deepEqual(fits.filter((n) => p.fit.test(n)), fits.filter((n) => /^p(1[6-9]|2[0-5]).*\.fit\.json$/.test(n)));
  const pl = ['places-p16-asia.json', 'places-p26-europe.json', 'places-p25-x.json'];
  assert.deepEqual(pl.filter((n) => p.places.test(n)), ['places-p16-asia.json', 'places-p25-x.json']);
});

test('u3 명세: 단원 작업 폴더·공개본·26~33쪽만', () => {
  const s = unitSpec('u3', W);
  assert.deepEqual(s.repoDirs, ['sims/atlas-u3-europe/data', 'content/atlas/u3', 'docs/assets/atlas/u3', 'docs/assets/atlas/common', 'docs/atlas-u3-europe']);
  assert.ok(!s.repoDirs.includes('docs/assets/atlas/u2'));
  assert.equal(s.embed, 'embed/atlas-u3-europe.html');
  assert.equal(s.base, 'C:/W/units/u3/baseline');
  assert.equal(s.shots, 'C:/W/units/u3/shots/compare'); assert.equal(s.compare, 'C:/W/units/u3/compare.html');
  assert.equal(s.compareName, 'compare.html');
  assert.deepEqual(s.prefixes, pagePrefixes([26, 33]));
  assert.ok(s.workExtra.includes('units/u3/tables/charts-u3.json') && s.workExtra.includes('units/u3/text/p27-labels.json'));
  assert.ok(s.workExtra.includes('units/u3/tables/climate-world.json') && s.workExtra.includes('units/u3/tables/index.json'));
  assert.ok(s.workExtra.includes('units/u3/geo/city-holdout.json'));
  assert.ok(s.workExtra.every((f) => !f.startsWith('tables/') && !f.startsWith('text/')), 'u2 자리 표·글 파일은 넣지 않음');
});

test('모르는 단원·쪽 없는 단원·설정 값 없는 단원은 오류', () => {
  assert.throws(() => unitSpec('u9', W), /u9/);
  const units = { ux: { sim: 'atlas-ux', title: 'x', pages: null, config: 'config/u3.json' } };
  assert.throws(() => unitSpec('ux', W, { units }), /ux.*pages/);
  const noCfg = { uy: { sim: 'atlas-uy', title: 'y', pages: [40, 41], config: 'config/nope-uy.json' } };
  assert.throws(() => unitSpec('uy', W, { units: noCfg }), /uy/);
});

test('need(): 설정에 없는 키는 키 이름을 담은 오류(U4-3 Step 0)', () => {
  const cfg = { content: { labels: 'units/u9/text/x.json' }, charts: { out: {} } };
  assert.equal(need(cfg, 'u9', 'content.labels'), 'units/u9/text/x.json');
  assert.throws(() => need(cfg, 'u9', 'content.charts'), /u9.*content\.charts/);
  assert.throws(() => need(cfg, 'u9', 'charts.out.climate'), /charts\.out\.climate/);
  assert.throws(() => need({}, 'u9', 'places.index.out'), /places\.index\.out/);
  assert.throws(() => need({ a: { b: '' } }, 'u9', 'a.b'), /a\.b/, '빈 문자열도 없음');
});

test('해시에서 *.md 는 뺌 — 이미지·자료 키는 그대로', () => {
  assert.equal(hashable('repo:content/atlas/u3/issues.md'), false);
  assert.equal(hashable('repo:content/atlas/u3/ISSUES.MD'), false);
  for (const k of ['repo:content/atlas/u3/topics.json', 'repo:docs/assets/atlas/u3/photo/a.webp', 'work:vec/p26-europe.json', 'repo:embed/atlas-u3-europe.html']) assert.equal(hashable(k), true, k);
});

test('낡은 출력 경고: 캡처·조각 < 입력, 대조표 < 캡처', () => {
  assert.deepEqual(staleWarnings({ inputs: 100, shots: 200, compare: 300, embed: 150 }), []);
  const w = staleWarnings({ inputs: 500, shots: 200, compare: 100, embed: 400 });
  assert.equal(w.length, 3);
  assert.match(w[0], /캡처/); assert.match(w[1], /조각/); assert.match(w[2], /대조표/);
  assert.deepEqual(staleWarnings({ inputs: 500, shots: null, compare: null, embed: null }), [], '없는 출력은 경고 아님(빠짐은 missingInputs 몫)');
});

test('빠진 기준선·캡처는 무엇을 돌릴지 알림(ENOENT 아님)', () => {
  const S = unitSpec('u3', W);
  const none = missingInputs(S, 'check', () => false);
  assert.equal(none.length, 5);
  assert.ok(none.some((m) => /--baseline/.test(m)) && none.some((m) => /compare_shots/.test(m)) && none.some((m) => /npm run embed/.test(m)));
  assert.deepEqual(missingInputs(S, 'check', () => true), []);
  assert.ok(missingInputs(S, 'baseline', () => false).every((m) => !/기준선/.test(m)), '기준선을 찍을 때는 기준선이 없어도 됨');
});
