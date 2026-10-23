// tests/atlas/worldQuiz.test.mjs — U1-3e 대륙·대양 맞히기(worldQuiz.withContinentQuiz · registerLayerType('continentQuiz'), 교사 Q6 A·Q8 A).
// 따로 된 프로세스(node --test)라 등록 전(모르는 레이어 종류)을 본 뒤 installAmericasExtras() → installPolarExtras() → installWorldExtras() 로 등록한다.
// 가짜 DOM: 뿌리(root) → 무대(.at-stage) → svg → 레이어 <g>, 사이드바(aside) → 주제 칸(.at-topic). 실제 자료(작업 폴더 continents.json)는 있으면 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readJson, WORK } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';
import { register } from 'node:module';

register('./helpers/cssHooks.mjs', import.meta.url);

const dom = installFakeDom();
const { layerFromRef } = await import('../../src/atlas/layerRef.js');
const AX = await import('../../src/atlas/americasExtra.js');
const PX = await import('../../src/atlas/polarExtra.js');
const WX = await import('../../src/atlas/worldExtra.js');
const QZ = await import('../../src/atlas/worldQuiz.js');
const { h, s } = await import('../../src/shared/dom.js');
test.after(() => dom.restore());

// ── 가짜 셸·지도 ───────────────────────────────────────────────────────────
/** 뿌리 → 무대(.at-stage > svg > g) + 사이드바(.ds-panel > .at-topic). 레이어 <g> 를 돌려줌 */
function shell({ sidebar = true } = {}) {
  const root = h('div', { class: 'ds-sim' });
  const stage = h('div', { class: 'ds-stage at-stage' });
  const svg = s('svg', { class: 'at-overlay' });
  const gLayers = s('g', { class: 'at-layers' });
  const g = s('g', { class: 'at-layer' });
  gLayers.append(g); svg.append(gLayers); stage.append(svg); root.append(stage);
  const body = h('div', { class: 'at-topic ds-block' });
  if (sidebar) root.append(h('aside', { class: 'ds-panel' }, body));
  return { root, stage, g, body };
}
function fakeMap() {
  const handlers = {}; const refreshed = []; const fits = [];
  return {
    refreshed, fits, destroyed: false, view: null,
    refreshLayer(id) { refreshed.push(id); return true; },
    fitBounds(b, o) { fits.push(b); },
    on(t, fn) { (handlers[t] ??= new Set()).add(fn); return () => handlers[t].delete(fn); },
    emit(t, e) { for (const fn of handlers[t] || []) fn(e); },
    count(t) { return handlers[t]?.size || 0; },
  };
}
/** 요소 트리에서 조건에 맞는 것 모두 */
function all(el, pred, out = []) {
  for (const c of el.children || []) { if (pred(c)) out.push(c); all(c, pred, out); }
  return out;
}
const byClass = (el, c) => all(el, (x) => x.classList?.contains(c));
const one = (el, c) => byClass(el, c)[0] || null;
const project = ([lon, lat]) => (lon > 170 ? null : [lon + 200, 100 - lat]); // 170°E 넘으면 「뒷면」

const sq = (lon, lat, d = 2) => [[[lon, lat], [lon, lat + d], [lon + d, lat + d], [lon + d, lat], [lon, lat]]];
const country = (iso, ko, ...polys) => ({ type: 'Feature', properties: { iso, ko }, geometry: { type: 'MultiPolygon', coordinates: polys } });
const LEGEND = [{ cls: 'asia', label: '아시아', color: '#f0a580' }, { cls: 'europe', label: '유럽', color: '#b6cedd' },
  { cls: 'africa', label: '아프리카', color: '#cfe3b5' }, { cls: 'oceania', label: '오세아니아', color: '#cbdb90' }, { cls: 'antarctica', label: '남극', color: '#d9d2e6' }];
const OCEANS = [{ cls: 'pacific', label: '태평양' }, { cls: 'atlantic', label: '대서양' }, { cls: 'indian', label: '인도양' }, { cls: 'arctic', label: '북극해' }, { cls: 'southern', label: '남극해' }];
const COUNTRIES = () => ({ 50: [country('AAA', '가나라', sq(100, 30)), country('BBB', '나나라', sq(10, 50)), country('ESP', '스페인', sq(-5, 38))] });
const TAGS = [
  { cls: 'asia', text: 'ㅇㅅㅇ 대륙', at: [100, 45] }, { cls: 'europe', text: 'ㅇㄹ 대륙', at: [15, 60] }, { cls: 'africa', text: 'ㅇㅍㄹㅋ 대륙', at: [20, 5] },
  { cls: 'oceania', text: 'ㅇㅅㅇㄴㅇ 대륙', at: [135, -25] }, { cls: 'antarctica', text: 'ㄴㄱ 대륙', at: [175, -80] },
  { cls: 'pacific', text: 'ㅌㅍㅇ', at: [-150, 0] }, { cls: 'atlantic', text: 'ㄷㅅㅇ', at: [-30, 10] }, { cls: 'indian', text: 'ㅇㄷㅇ', at: [80, -20] },
  { cls: 'arctic', text: 'ㅂㄱㅎ', at: [60, 80] }, { cls: 'southern', text: 'ㄴㄱㅎ', at: [-60, -65] },
];
const DATA = () => ({ type: 'FeatureCollection', properties: {
  layerType: 'continents', legend: LEGEND, classes: { AAA: 'asia', BBB: 'europe', ESP: 'europe' },
  centers: { asia: [91, 43] }, bounds: {}, names: { asia: ['가나라'], europe: ['나나라', '에스파냐'], africa: [], oceania: [], antarctica: [] },
  nameIso: { 가나라: 'AAA', 나나라: 'BBB', 에스파냐: 'ESP' }, oceans: OCEANS, tags: TAGS },
  features: OCEANS.map((o, i) => ({ type: 'Feature', properties: { cls: o.cls, ocean: true }, geometry: { type: 'MultiPolygon', coordinates: [sq(-170 + i * 30, -10, 5)] } })) });

function make({ seed = 7, sidebar = true, data = DATA() } = {}) {
  const sh = shell({ sidebar }); const map = fakeMap();
  const cf = COUNTRIES();
  const L = QZ.withContinentQuiz(WX.continentsLayer('cq', data, { countryFeatures: cf, map }), data, { map, seed, countryFeatures: cf });
  L.drawSvg(sh.g, project, { k: 1 });
  return { ...sh, map, L };
}
const tagEls = (g) => byClass(g, 'at-wq-tag');
const tagOf = (g, cls) => tagEls(g).find((t) => t.getAttribute('data-cls') === cls);
const tagText = (t) => one(t, 'at-wq-tag-text').textContent;
const optBtns = (stage) => byClass(stage, 'at-quiz-opt');
const click = (el) => el.dispatch('click', { stopPropagation() {} });
const answer = (stage, label) => click(optBtns(stage).find((b) => b.getAttribute('data-v') === label));

test('등록 전: continentQuiz 는 모르는 레이어 종류 → 등록 뒤 layerFromRef 로 만들어짐(범례·meta 는 대륙 레이어 그대로)', () => {
  assert.throws(() => layerFromRef({ ref: 'cq', type: 'continentQuiz' }, DATA(), { countryFeatures: COUNTRIES() }), /모르는 레이어 종류/);
  AX.installAmericasExtras(); PX.installPolarExtras(); WX.installWorldExtras();
  const L = layerFromRef({ ref: 'cq', type: 'continentQuiz', label: '대륙과 대양' }, DATA(), { countryFeatures: COUNTRIES(), map: fakeMap() });
  assert.deepEqual(L.legendItems.map((e) => e.cls), LEGEND.map((e) => e.cls));
  assert.equal(typeof L.select, 'function'); assert.equal(typeof L.drawSvg, 'function'); assert.equal(typeof L.draw, 'function');
  L.destroy();
});

test('꼬리표: 자료 tags 마다 하나(초성 글자·자리·키보드 초점), 뒷면(투영 null)은 숨김, 다시 그려도 요소를 새로 만들지 않음', () => {
  const { g, L } = make();
  const tags = tagEls(g);
  assert.equal(tags.length, TAGS.length);
  assert.equal(tagText(tagOf(g, 'asia')), 'ㅇㅅㅇ 대륙');
  assert.equal(tagOf(g, 'asia').getAttribute('transform'), 'translate(300.0,55.0)');
  assert.equal(tagOf(g, 'asia').getAttribute('tabindex'), '0');
  assert.equal(tagOf(g, 'asia').getAttribute('role'), 'button');
  assert.match(tagOf(g, 'asia').getAttribute('aria-label'), /ㅇㅅㅇ 대륙/);
  assert.equal(tagOf(g, 'antarctica').getAttribute('display'), 'none', '175°E — 가짜 투영의 뒷면');
  const first = tagOf(g, 'asia');
  L.drawSvg(g, ([lon, lat]) => [lon, lat], { k: 1 });
  assert.equal(tagOf(g, 'asia'), first);
  assert.equal(first.getAttribute('transform'), 'translate(100.0,45.0)');
  assert.ok(L.labelObstacles().length >= TAGS.length - 1, '꼬리표 자리는 지명 장애물');
  L.destroy();
});

test('누르기 → 그 대륙 select + 무대 보기 칸「이 대륙의 이름은?」보기 4(정답 1 · 같은 종류 · 씨앗이 같으면 같은 차례), 대양은「이 대양의 이름은?」', () => {
  const a = make({ seed: 11 });
  click(tagOf(a.g, 'asia'));
  assert.equal(a.L.selected, 'asia');
  const panel = one(a.stage, 'at-wq');
  assert.ok(panel, '무대에 보기 칸');
  assert.equal(one(panel, 'at-quiz-q').textContent, '이 대륙의 이름은? (ㅇㅅㅇ 대륙)');
  const v = optBtns(a.stage).map((b) => b.getAttribute('data-v'));
  assert.equal(v.length, 4); assert.ok(v.includes('아시아'));
  assert.ok(v.every((x) => LEGEND.some((e) => e.label === x)), `대륙 보기만 ${v}`);
  const b = make({ seed: 11 });
  click(tagOf(b.g, 'asia'));
  assert.deepEqual(optBtns(b.stage).map((x) => x.getAttribute('data-v')), v, '씨앗 결정적');
  click(tagOf(a.g, 'pacific'));
  assert.equal(a.L.selected, 'pacific');
  assert.equal(one(a.stage, 'at-quiz-q').textContent, '이 대양의 이름은? (ㅌㅍㅇ)');
  const ov = optBtns(a.stage).map((x) => x.getAttribute('data-v'));
  assert.ok(ov.includes('태평양') && ov.every((x) => OCEANS.some((o) => o.label === x)), `대양 보기만 ${ov}`);
  a.L.destroy(); b.L.destroy();
});

test('맞힘 → 꼬리표가 이름(「대륙」 붙음 그대로)·점수 1/1 · 틀림 → 그 보기만 막고 다시 고름(점수는 첫 답만), 맞힌 꼬리표를 다시 누르면 보기 없음', () => {
  const { g, stage, L } = make();
  const score = () => one(stage, 'at-quiz-score').textContent;
  assert.equal(score(), `맞힌 수 0 / 푼 수 0 · 꼬리표 ${TAGS.length}`);
  click(tagOf(g, 'asia')); answer(stage, '아시아');
  assert.equal(tagText(tagOf(g, 'asia')), '아시아 대륙');
  assert.ok(tagOf(g, 'asia').classList.contains('is-solved'));
  assert.match(one(stage, 'at-quiz-feedback').textContent, /정답/);
  assert.equal(score(), `맞힌 수 1 / 푼 수 1 · 꼬리표 ${TAGS.length}`);
  click(tagOf(g, 'indian'));
  const wrong = optBtns(stage).map((b) => b.getAttribute('data-v')).find((x) => x !== '인도양');
  answer(stage, wrong);
  const wb = optBtns(stage).find((b) => b.getAttribute('data-v') === wrong);
  assert.ok(wb.disabled && wb.classList.contains('is-wrong'));
  assert.ok(!optBtns(stage).find((b) => b.getAttribute('data-v') === '인도양').disabled, '정답 보기는 아직 누를 수 있음');
  assert.equal(tagText(tagOf(g, 'indian')), 'ㅇㄷㅇ');
  assert.match(one(stage, 'at-quiz-feedback').textContent, /다시/);
  answer(stage, '인도양');
  assert.equal(tagText(tagOf(g, 'indian')), '인도양');
  assert.equal(score(), `맞힌 수 1 / 푼 수 2 · 꼬리표 ${TAGS.length}`);
  assert.deepEqual(L.quiz.score, { right: 1, total: 2, solved: 2 });
  click(tagOf(g, 'asia'));
  assert.equal(optBtns(stage).length, 0, '이미 맞힌 꼬리표');
  assert.match(one(stage, 'at-quiz-q').textContent, /아시아 대륙/);
  L.destroy();
});

test('정답 모두 보기 → 꼬리표 모두 이름(점수 그대로) · 다시 하기 → 초성·점수 0·고름 풂', () => {
  const { g, stage, L } = make();
  click(tagOf(g, 'europe')); answer(stage, '유럽');
  click(byClass(stage, 'at-wq-reveal')[0]);
  assert.deepEqual(tagEls(g).map(tagText), ['아시아 대륙', '유럽 대륙', '아프리카 대륙', '오세아니아 대륙', '남극 대륙', '태평양', '대서양', '인도양', '북극해', '남극해']);
  assert.ok(tagOf(g, 'asia').classList.contains('is-revealed') && !tagOf(g, 'asia').classList.contains('is-solved'));
  assert.equal(optBtns(stage).length, 0);
  assert.deepEqual(L.quiz.score, { right: 1, total: 1, solved: 1 });
  click(byClass(stage, 'at-wq-reset')[0]);
  assert.deepEqual(tagEls(g).map(tagText), TAGS.map((t) => t.text));
  assert.ok(tagEls(g).every((t) => !t.classList.contains('is-solved') && !t.classList.contains('is-revealed')));
  assert.deepEqual(L.quiz.score, { right: 0, total: 0, solved: 0 });
  assert.equal(L.selected, null);
  L.destroy();
});

test('키보드: 꼬리표에서 Enter·Space → 누르기와 같음(기본 동작 막음), 다른 키는 그대로', () => {
  const { g, stage, L } = make();
  const ev = tagOf(g, 'africa').dispatch('keydown', { key: 'Enter' });
  assert.ok(ev.defaultPrevented); assert.equal(L.selected, 'africa'); assert.equal(optBtns(stage).length, 4);
  const sp = tagOf(g, 'arctic').dispatch('keydown', { key: ' ' });
  assert.ok(sp.defaultPrevented); assert.equal(L.selected, 'arctic');
  const tab = tagOf(g, 'asia').dispatch('keydown', { key: 'Tab' });
  assert.ok(!tab.defaultPrevented); assert.equal(L.selected, 'arctic');
  L.destroy();
});

test('Q8 사이드바 나라 목록: 주제 칸 끝(블록 뒤 — 마이크로태스크)에, 대륙을 고르면(꼬리표·범례·지도 누르기) 그 대륙 나라 이름(자료 차례) — 누르면 그 나라로 날아감, 대양·없음은 안내 글', async () => {
  const { g, body, map, L } = make();
  assert.equal(one(body, 'at-wq-names'), null, '같은 차례에서는 아직(buildTopic 이 블록을 붙이는 중)');
  const act = h('div', { class: 'at-text at-text-activity' }); body.append(act);
  await Promise.resolve();
  const box = one(body, 'at-wq-names');
  assert.equal(body.children.at(-1), box, '활동 블록 뒤');
  assert.ok(box, '사이드바 주제 칸에 목록 칸');
  const names = () => byClass(box, 'at-wq-name').map((b) => b.textContent);
  assert.deepEqual(names(), []);
  assert.match(one(box, 'at-wq-names-hint').textContent, /대륙을 고르면/);
  L.select('europe');
  assert.deepEqual(names(), ['나나라', '에스파냐']);
  assert.equal(one(box, 'at-wq-names-title').textContent, '유럽의 나라 2');
  click(byClass(box, 'at-wq-name')[1]);
  assert.equal(map.fits.length, 1);
  const [w, s0, e, n] = map.fits[0];
  assert.ok(w < -5 && e > -3 && s0 < 38 && n > 40, `에스파냐(ESP) 둘레 ${map.fits[0]}`);
  click(tagOf(g, 'pacific'));
  assert.deepEqual(names(), []);
  assert.match(one(box, 'at-wq-names-hint').textContent, /대양/);
  map.emit('click', { layerId: 'cq', feature: { properties: { cls: 'asia', iso: 'AAA' } } });
  assert.equal(L.selected, 'asia', '지도에서 나라를 누르면 그 대륙');
  assert.deepEqual(names(), ['가나라']);
  map.emit('click', { layerId: 'basemap', feature: { properties: { iso: 'GRL' } } });
  assert.equal(L.selected, 'asia', '다른 레이어·바탕 지도 누르기는 그대로');
  L.select('antarctica');
  assert.match(one(box, 'at-wq-names-hint').textContent, /나라 이름이 없/);
  L.destroy();
});

test('고름이 다른 것으로 바뀌면(범례·지도) 보던 문제는 닫힘 · 사이드바가 없으면 목록은 무대 보기 칸 아래', () => {
  const { g, stage, L } = make({ sidebar: false });
  click(tagOf(g, 'asia'));
  assert.equal(optBtns(stage).length, 4);
  L.select('europe');
  assert.equal(optBtns(stage).length, 0, '다른 대륙을 고르면 문제 닫힘');
  assert.ok(one(one(stage, 'at-wq'), 'at-wq-names'), '사이드바 없으면 무대 칸 안');
  L.destroy();
});

test('destroy → 무대 칸·사이드바 목록·꼬리표 없음, 지도 click 구독 풂, 고름 풂 · 접기 단추 · 붙이기 전에 destroy 해도 목록이 남지 않음', async () => {
  const early = make();
  early.L.destroy();
  await Promise.resolve();
  assert.equal(one(early.body, 'at-wq-names'), null);
  const { g, stage, body, map, L } = make();
  await Promise.resolve();
  const panel = one(stage, 'at-wq');
  const toggle = one(panel, 'at-wq-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(panel.classList.contains('is-collapsed'));
  click(tagOf(g, 'asia'));
  assert.ok(!panel.classList.contains('is-collapsed'), '꼬리표를 누르면 접힌 칸을 폄');
  assert.equal(map.count('click'), 1);
  const seen = []; L.onSelect((v) => seen.push(v));
  L.destroy();
  assert.equal(one(stage, 'at-wq'), null);
  assert.equal(one(body, 'at-wq-names'), null);
  assert.equal(tagEls(g).length, 0);
  assert.equal(map.count('click'), 0);
  assert.deepEqual(seen, [null], '고름을 풀고 끝냄');
});

test('tags 없는 자료: 꼬리표 0 · 칸은 「꼬리표 없음」(멈추지 않음)', () => {
  const d = DATA(); delete d.properties.tags;
  const { g, stage, L } = make({ data: d });
  assert.equal(tagEls(g).length, 0);
  assert.match(one(stage, 'at-quiz-score').textContent, /꼬리표 0/);
  L.destroy();
});

// ── 실제 자료(작업 폴더 — 꼬리표가 있을 때만) ─────────────────────────────
const REAL = `${WORK}/geo/p10-continents.continents.json`;
test('실제 10·11쪽 꼬리표: 12(대륙 7 · 대양 5, cls 마다 하나), 글자 = 그 이름 초성(+ 대륙), 자리 = 그 대륙·대양 상자 둘레, 목록 이름은 모두 nameIso 에 나라',
  { skip: fs.existsSync(REAL) && readJson(REAL).properties.tags ? false : '꼬리표 자료 없음' }, () => {
    const p = readJson(REAL).properties;
    const labels = Object.fromEntries([...p.legend, ...p.oceans].map((e) => [e.cls, e.label]));
    assert.equal(p.tags.length, 12);
    assert.deepEqual(p.tags.map((t) => t.cls).sort(), Object.keys(labels).sort());
    const cho = (t) => [...t].map((c) => { const o = c.charCodeAt(0) - 0xac00; return o >= 0 && o < 11172 ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(o / 588)] : ''; }).join('');
    for (const t of p.tags) {
      const ocean = p.oceans.some((o) => o.cls === t.cls);
      assert.equal(t.text, `${cho(labels[t.cls])}${ocean ? '' : ' 대륙'}`, t.cls);
      const [w, s0, e, n] = p.bounds[t.cls]; const pad = 25;
      const lon = t.at[0] < w - pad ? t.at[0] + 360 : t.at[0];
      assert.ok(lon >= w - pad && lon <= e + pad && t.at[1] >= s0 - pad && t.at[1] <= n + pad, `${t.cls} ${t.at} ∉ ${p.bounds[t.cls]}`);
    }
    for (const list of Object.values(p.names)) for (const nm of list) assert.ok(p.nameIso[nm], `${nm} → 나라`);
  });
