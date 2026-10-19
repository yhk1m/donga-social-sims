// tests/atlas/ui.test.mjs — 화면 부품(src/atlas/ui.js)·퀴즈(quiz.js)·그래프(charts.js)를 가짜 DOM 으로:
// 모두 { el, destroy } 를 돌려주고, 주제를 바꿀 때처럼 만들고 부수기를 되풀이해도 지도·범례 구독과 무대 키 입력이 남지 않는지,
// 범례 누르기·카드·원본 쪽 보기·말풍선·키보드 확대/이동·퀴즈 채점을 본다. 픽셀은 헤드리스 Chrome 캡처로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
const { topicNav, mapTools, legendBlock, detailCard, pageViewer, tooltip, creditBlock } = await import('../../src/atlas/ui.js');
const { coloringLayer, coloringQuiz, heritageQuiz } = await import('../../src/atlas/quiz.js');
const { renderChart } = await import('../../src/atlas/charts.js');
const { createLegendState } = await import('../../src/atlas/legendState.js');
test.after(() => dom.restore());

const DATA = path.join(REPO, 'sims/atlas-u2-asia/data');
const topics = readJson(path.join(DATA, 'topics.json'));
const charts = readJson(path.join(DATA, 'charts.json'));
const div = () => document.createElement('div');

/** 렌더러 흉내: on() 구독 수, 부른 메서드 기록 */
function fakeMap() {
  const handlers = { click: new Set(), hover: new Set(), viewchange: new Set() };
  const calls = [];
  let view = { key: 'miller', centerLon: 0, k: 2, x: 0, y: 0, width: 800, height: 600, kmPerPx: 10 };
  return {
    calls, destroyed: false,
    get view() { return view; },
    setView(v) { view = { ...view, ...v }; for (const fn of handlers.viewchange) fn(view); },
    on(type, fn) { handlers[type].add(fn); return () => handlers[type].delete(fn); },
    emit(type, e) { for (const fn of [...handlers[type]]) fn(e); },
    get handlerCount() { return Object.values(handlers).reduce((a, x) => a + x.size, 0); },
    setProjection(k) { calls.push(['setProjection', k]); view = { ...view, key: k }; },
    setCenterLon(c) { calls.push(['setCenterLon', c]); view = { ...view, centerLon: c }; },
    setOptions(o) { calls.push(['setOptions', o]); },
    flyTo(t, ms) { calls.push(['flyTo', t, ms]); },
    fitBounds(b, o) { calls.push(['fitBounds', b, o]); },
    invert(xy) { return [xy[0] / 10, xy[1] / 10]; },
    refreshLayer(id) { calls.push(['refreshLayer', id]); return true; },
  };
}
const find = (el, pred) => {
  if (pred(el)) return el;
  for (const c of el.childNodes || []) { const r = find(c, pred); if (r) return r; }
  return null;
};
const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const byClass = (c) => (n) => n.classList?.contains(c);

test('topicNav: 주제 8개·쪽 표시, update 로 지금 주제 강조, 누르면 onSelect, destroy 로 떼어 냄', () => {
  const panel = div();
  const picked = [];
  const nav = topicNav(panel, topics, (id) => picked.push(id), { current: 'climate' });
  const btns = findAll(nav.el, byClass('at-toc-btn'));
  assert.equal(btns.length, 8);
  assert.match(btns[0].textContent, /일반도.*16·18·19쪽/);
  assert.equal(btns[3].getAttribute('aria-current'), 'true');
  nav.update('heritage');
  assert.equal(btns[3].getAttribute('aria-current'), null);
  assert.ok(btns[7].classList.contains('is-current'));
  btns[1].dispatch('click');
  assert.deepEqual(picked, ['coloring']);
  nav.destroy();
  assert.equal(panel.childNodes.length, 0);
});

test('mapTools: 도법·중심 경도·옵션·확대 버튼, 축척 막대 갱신, 무대 키보드(무대에 초점일 때만), destroy 로 구독·키 리스너·tabindex 정리', () => {
  const stage = div();
  const base = document.createElement('canvas'); base.classList.add('at-base');
  const overlay = document.createElementNS('svg', 'svg'); overlay.classList.add('at-overlay');
  stage.append(base, overlay);
  const map = fakeMap();
  for (let round = 0; round < 3; round++) {
    map.setView({ key: 'miller', centerLon: 0, kmPerPx: 10 });
    const t = mapTools(stage, map);
    assert.equal(stage.getAttribute('tabindex'), '0');
    assert.ok(stage.getAttribute('aria-label'));
    assert.ok(base.getAttribute('aria-label'));
    assert.equal(overlay.getAttribute('role'), 'group');
    const segBtns = findAll(t.el, byClass('at-tools-seg-btn'));
    assert.equal(segBtns.length, 7);
    assert.equal(segBtns.find((b) => b.getAttribute('data-v') === 'miller').getAttribute('aria-pressed'), 'true');
    segBtns.find((b) => b.getAttribute('data-v') === 'goode').dispatch('click');
    assert.deepEqual(map.calls.at(-1), ['setProjection', 'goode']);
    assert.equal(segBtns.find((b) => b.getAttribute('data-v') === 'goode').getAttribute('aria-pressed'), 'true');
    segBtns.find((b) => b.getAttribute('data-v') === '150').dispatch('click');
    assert.deepEqual(map.calls.at(-1), ['setCenterLon', 150]);
    // 도구 버튼마다 aria-label·title
    for (const b of findAll(t.el, byClass('at-tools-btn'))) { assert.ok(b.getAttribute('aria-label')); assert.ok(b.getAttribute('title')); }
    findAll(t.el, byClass('at-tools-btn'))[0].dispatch('click');
    assert.equal(map.calls.at(-1)[0], 'flyTo'); assert.equal(map.calls.at(-1)[1].zoom, map.view.k * 2);
    // 축척: 10 km/px → 1,000 km = 100px
    assert.equal(find(t.scale, byClass('at-scale-text')).textContent, '1,000 km');
    assert.equal(find(t.scale, byClass('at-scale-bar')).style.width, '100px');
    map.setView({ kmPerPx: 3 });
    assert.equal(find(t.scale, byClass('at-scale-text')).textContent, '200 km');
    // 키보드: 무대가 대상이면 확대·이동, 도구 버튼에서 온 키는 무시
    const n = map.calls.length;
    stage.dispatch('keydown', { key: '+', target: stage });
    assert.equal(map.calls.at(-1)[1].zoom, map.view.k * 2);
    stage.dispatch('keydown', { key: 'ArrowLeft', target: stage });
    assert.deepEqual(map.calls.at(-1)[1].center, [24, 30]); // invert([400 − 160, 300]) = [24, 30]
    stage.dispatch('keydown', { key: '+', target: segBtns[0] });
    assert.equal(map.calls.length, n + 2);
    t.destroy();
    assert.equal(map.handlerCount, 0, '구독 0');
    assert.equal(stage.listenerCount, 0, '무대 키 리스너 0');
    assert.equal(stage.getAttribute('tabindex'), null);
    assert.equal(stage.childNodes.length, 2, '도구·축척 떼어 냄');
  }
});

test('legendBlock: 견본 + 이름, 누르면 legend.toggle(aria-pressed·전체 보기), 위치 근사 배지, 이미지 실패 알림, destroy 로 구독 해제', async () => {
  const data = readJson(path.join(DATA, 'layer-p24-trade.json'));
  const items = data.properties.legend.map(({ present, ...e }) => e);
  const lg = createLegendState(items.map((e) => e.cls));
  let subs = 0;
  const onChange = lg.onChange;
  lg.onChange = (f) => { subs++; const off = onChange(f); return () => { subs--; off(); }; };
  const panel = div();
  let fail;
  const ready = new Promise((r) => { fail = r; });
  const b = legendBlock(panel, lg, items, { title: '우리나라와의 무역액', lineTitle: '수출입액', credit: '(국가데이터처, 2023)', approx: true, ready });
  assert.equal(subs, 1);
  const rows = findAll(b.el, byClass('at-legend-item'));
  assert.equal(rows.length, 9);
  assert.ok(find(b.el, byClass('at-badge')));
  assert.ok(find(b.el, byClass('at-legend-widths')), '흐름선 굵기 단계');
  rows[2].dispatch('click');
  assert.equal(lg.selected(), items[2].cls);
  assert.equal(rows[2].getAttribute('aria-pressed'), 'true');
  assert.equal(find(b.el, byClass('at-legend-reset')).hidden, false);
  find(b.el, byClass('at-legend-reset')).dispatch('click');
  assert.equal(lg.selected(), null);
  assert.equal(find(b.el, byClass('at-legend-fail')).hidden, true);
  fail(false); await ready; await null;
  assert.equal(find(b.el, byClass('at-legend-fail')).hidden, false);
  b.destroy();
  assert.equal(subs, 0);
  assert.equal(panel.childNodes.length, 0);
});

test('detailCard: 사진(lazy, 실패하면 숨김)·글·그래프, hide·destroy', () => {
  const panel = div();
  const expanded = [];
  const card = detailCard(panel, { onExpand: (sp) => expanded.push(sp.id) });
  assert.equal(card.el.hidden, true);
  const m = topics.find((t) => t.id === 'climate').markers[0];
  card.show({ title: m.title, photo: m.photo, text: m.text, chart: charts[m.chart] });
  assert.equal(card.el.hidden, false);
  const img = find(card.el, (n) => n.tagName === 'img');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(img.getAttribute('src'), m.photo.url);
  assert.ok(find(card.el, byClass('at-chart')));
  img.dispatch('error');
  assert.equal(find(card.el, byClass('at-photo')).hidden, true);
  find(card.el, byClass('at-expand')).dispatch('click');
  assert.deepEqual(expanded, [m.chart]);
  card.hide();
  assert.equal(card.el.hidden, true); assert.equal(card.el.childNodes.length, 0);
  card.destroy();
  assert.equal(panel.childNodes.length, 0);
});

test('pageViewer: 쪽 이미지·부분(bbox) 보기, Esc·닫기, destroy', () => {
  const stage = div();
  const v = pageViewer(stage);
  assert.equal(v.open, false);
  const part = topics.find((t) => t.id === 'religion').blocks.find((b) => b.id === 'page-22-part');
  v.show({ url: part.url, title: part.title, bbox: part.bbox });
  assert.equal(v.open, true);
  const crop = find(v.el, byClass('at-viewer-crop'));
  assert.match(crop.style.aspectRatio, /^1 \/ [\d.]+$/, '상자 비율 = aspect-ratio(padding-top % 는 담는 상자 너비 기준이라 틀어짐)');
  const cimg = find(crop, (n) => n.tagName === 'img');
  assert.equal(cimg.style.position, 'absolute');
  assert.equal(cimg.getAttribute('loading'), null, '부분 보기 이미지는 lazy 가 아님(불러오기 전 높이 0·화면 밖이라 lazy 면 끝내 안 불러옴)');
  v.el.dispatch('keydown', { key: 'Escape' });
  assert.equal(v.open, false);
  v.show({ url: part.url, page: 22 });
  assert.equal(find(v.el, byClass('at-viewer-title')).textContent, '교과서 22쪽');
  find(v.el, byClass('at-viewer-close')).dispatch('click');
  assert.equal(v.open, false);
  const vn = charts['p24-vietnam-2021'];
  v.show({ title: vn.title, chart: vn });
  assert.equal(find(v.el, byClass('at-viewer-title')).textContent, '베트남의 주요 수출품 변화 — 2021년 주요 수출품', '같은 제목 그래프는 부제로 가름');
  assert.ok(find(v.el, byClass('at-chart')));
  v.destroy();
  assert.equal(stage.childNodes.length, 0);
  assert.equal(v.el.listenerCount, 0);
});

test('tooltip: 지도 hover → 레이어 label / 바탕 나라 ko, 비면·보기가 바뀌면 숨김, destroy 로 구독 해제', () => {
  const stage = div();
  const map = fakeMap();
  const tip = tooltip(stage, { map });
  map.emit('hover', { xy: [100, 50], feature: { properties: { ko: '몽골' } }, layerId: 'basemap' });
  assert.equal(tip.el.hidden, false);
  assert.equal(tip.el.textContent, '몽골');
  assert.equal(tip.el.style.left, '114px');
  map.emit('hover', { xy: [10, 10], feature: { properties: { label: '석탄', name: '중국' } }, layerId: 'r' });
  assert.equal(tip.el.textContent, '석탄');
  map.setView({ k: 4 });
  assert.equal(tip.el.hidden, true, '보기가 바뀌면(포인터는 그대로) 옛 이름을 숨김');
  map.emit('hover', { xy: [10, 10], feature: { properties: { label: '석탄' } }, layerId: 'r' });
  assert.equal(tip.el.hidden, false);
  map.emit('hover', { lonlat: null, xy: null });
  assert.equal(tip.el.hidden, true);
  tip.destroy();
  assert.equal(map.handlerCount, 0);
  assert.equal(stage.childNodes.length, 0);
});

test('creditBlock: 바탕 지도 Natural Earth + 레이어 출처(중복 없이)', () => {
  const panel = div();
  const c = creditBlock(panel);
  assert.match(c.el.textContent, /바탕 지도: Natural Earth/);
  c.update(['(UN, 2021)', '(UN, 2021)', null, '(국가데이터처, 2023)']);
  assert.equal(findAll(c.el, byClass('at-credits-item')).length, 2);
  c.destroy();
  assert.equal(panel.childNodes.length, 0);
});

test('renderChart: 17개 모두 그림 요소(캔버스·SVG·표)가 생기고 실패 글이 없다', () => {
  const box = div();
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    for (const [id, spec] of Object.entries(charts)) {
      const r = renderChart(box, spec);
      const body = find(r.el, (n) => ['canvas', 'svg', 'table'].includes(n.tagName));
      assert.ok(body, id);
      assert.ok(!/그리지 못했습니다/.test(r.el.textContent), id);
      r.destroy();
    }
  } finally { console.error = orig; }
  assert.deepEqual(errs, []);
  assert.equal(box.childNodes.length, 0);
  // 직접 그린 띠그래프: 칸마다 <title>(말풍선), 문서 전역 id 없음
  const r = renderChart(box, charts['p24-resources']);
  assert.equal(findAll(r.el, (n) => n.tagName === 'title').length, charts['p24-resources'].series.reduce((a, s) => a + s.values.filter((v) => v != null).length, 0));
  assert.equal(findAll(r.el, (n) => n.getAttribute?.('id')).length, 0);
});

test('coloringQuiz: 누르면 고른 색으로 칠하고(같은 색 다시 = 지움), 이름 맞히기 보기 4개·채점, destroy 로 구독 해제·강조 지움', () => {
  const q17 = topics.find((t) => t.id === 'coloring').quiz.countries;
  const feats = q17.map((c) => ({ type: 'Feature', properties: { iso: c.iso, ko: c.name }, geometry: { type: 'Polygon', coordinates: [[[c.labelLonlat[0] - 1, c.labelLonlat[1] - 1], [c.labelLonlat[0] + 1, c.labelLonlat[1] - 1], [c.labelLonlat[0] + 1, c.labelLonlat[1] + 1], [c.labelLonlat[0] - 1, c.labelLonlat[1] - 1]]] } }));
  const layer = coloringLayer(feats);
  const map = fakeMap();
  for (let round = 0; round < 2; round++) {
    const q = coloringQuiz(map, layer, q17, { seed: 42 });
    assert.equal(map.handlerCount, 1);
    map.emit('click', { feature: { properties: { iso: 'MNG' } }, layerId: 'basemap' });
    assert.equal(layer.colorOf('MNG'), '#f4a3a8');
    assert.equal(map.calls.at(-1)[0], 'refreshLayer');
    map.emit('click', { feature: { properties: { iso: 'MNG' } }, layerId: 'basemap' });
    assert.equal(layer.colorOf('MNG'), null, '같은 색으로 다시 누르면 지움');
    map.emit('click', { feature: { properties: { iso: 'USA' } }, layerId: 'basemap' });
    assert.equal(layer.colorOf('USA'), null, '17쪽 나라가 아니면 안 칠함');
    q.setMode('name');
    const cur = q.current;
    assert.equal(layer.target, cur.iso);
    assert.equal(map.calls.find((c) => c[0] === 'fitBounds')[0], 'fitBounds');
    const opts = findAll(q.el, byClass('at-quiz-opt'));
    assert.equal(opts.length, 4);
    assert.ok(opts.some((b) => b.getAttribute('data-v') === cur.name));
    q.answer(cur.name);
    assert.deepEqual(q.score, { right: 1, total: 1 });
    q.answer(cur.name); // 이미 답함
    assert.deepEqual(q.score, { right: 1, total: 1 });
    q.destroy();
    assert.equal(map.handlerCount, 0);
    assert.equal(layer.target, null);
  }
});

test('heritageQuiz: 사진 + 나라/종교 보기 4개, 여러 종교는 묶음이 정답, onFocus, 채점', () => {
  const markers = topics.find((t) => t.id === 'heritage').markers;
  const focused = [];
  const q = heritageQuiz(markers, { seed: 7, onFocus: (m) => focused.push(m.id) });
  assert.equal(focused.length, 1);
  assert.ok(find(q.el, (n) => n.tagName === 'img'));
  const cur = q.current;
  q.answer(cur.quiz.country);
  assert.deepEqual(q.score, { right: 1, total: 1 });
  q.setKind('religion');
  const opts = findAll(q.el, byClass('at-quiz-opt')).map((b) => b.getAttribute('data-v'));
  assert.equal(opts.length, 4);
  assert.ok(opts.includes(q.current.quiz.religions.join(', ')));
  q.answer('없는 종교');
  assert.deepEqual(q.score, { right: 1, total: 2 });
  q.destroy();
});

test('퀴즈: 빈 목록이면 문제를 내지 않고 알림(오류 없음) — 색칠하기 이름 맞히기·세계유산', () => {
  const map = fakeMap();
  const layer = coloringLayer([]);
  const q = coloringQuiz(map, layer, [], { seed: 1 });
  q.setMode('name');
  assert.equal(q.current, null);
  assert.match(find(q.el, byClass('at-quiz-feedback')).textContent, /없습니다/);
  q.answer('아무 나라');
  assert.deepEqual(q.score, { right: 0, total: 0 });
  q.destroy();
  const hq = heritageQuiz([], { seed: 1 });
  hq.setKind('religion');
  assert.equal(hq.current, null);
  assert.match(find(hq.el, byClass('at-quiz-feedback')).textContent, /없습니다/);
  hq.destroy();
});

test('legendBlock 묶음: 기후 범례는 열대·건조·온대·냉대·한대 제목 아래(고산은 따로), 제목을 누르면 그 묶음만, 항목 누르기도 그대로', () => {
  const data = readJson(path.join(DATA, 'layer-p21-climate.json'));
  const items = data.properties.legend.map(({ present, ...e }) => e);
  const lg = createLegendState(items.map((e) => e.cls));
  const b = legendBlock(div(), lg, items, { title: '기후 구분' });
  const heads = findAll(b.el, byClass('at-legend-group-head'));
  assert.deepEqual(heads.map((x) => x.textContent), ['열대', '건조', '온대', '냉대', '한대']);
  const groups = findAll(b.el, byClass('at-legend-group'));
  assert.deepEqual(groups.map((g) => findAll(g, byClass('at-legend-item')).length), [3, 2, 4, 2, 2]);
  assert.equal(findAll(b.el, byClass('at-legend-item')).length, 14, '고산 기후는 묶음 밖');
  heads[1].dispatch('click');
  assert.equal(lg.selected(), 'group:건조');
  assert.equal(heads[1].getAttribute('aria-pressed'), 'true');
  const dry = items.filter((e) => e.group === '건조').map((e) => e.cls);
  assert.ok(dry.every(lg.isActive) && !lg.isActive(items[0].cls));
  findAll(b.el, byClass('at-legend-item'))[0].dispatch('click');
  assert.equal(lg.selected(), items[0].cls);
  assert.equal(heads[1].getAttribute('aria-pressed'), 'false');
  b.destroy();
});
