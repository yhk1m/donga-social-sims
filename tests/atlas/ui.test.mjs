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
const { topicNav, mapTools, legendBlock, legendPanel, tintLegendBlock, detailCard, pageViewer, tooltip, creditBlock } = await import('../../src/atlas/ui.js');
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
  const handlers = { click: new Set(), hover: new Set(), viewchange: new Set(), options: new Set() };
  const calls = [];
  const opts = { graticule: true, labels: true, relief: true, tint: false };
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
    setOptions(o) { calls.push(['setOptions', o]); Object.assign(opts, o); for (const fn of handlers.options) fn({ ...opts }); },
    get options() { return { ...opts }; },
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
    assert.equal(segBtns.length, 10, '도법 5 · 중심 경도 2 · 바탕 색 3');
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
    // 바탕 색 한 묶음(없음·고도 색·자연색): 누르면 setOptions({tint, natural}) 둘을 함께, 주제가 옵션을 바꾸면(map 'options') 단추가 따라감
    assert.equal(findAll(t.el, byClass('at-tools-check-input')).length, 3, '경위선·지명·음영 체크 상자(고도 색은 바탕 묶음으로)');
    const baseBtn = (v) => findAll(t.el, byClass('at-tools-seg-btn')).find((b) => b.getAttribute('data-v') === v);
    const pressed = () => ['none', 'tint', 'natural'].filter((v) => baseBtn(v).getAttribute('aria-pressed') === 'true');
    assert.deepEqual(pressed(), ['none']);
    baseBtn('tint').dispatch('click');
    assert.deepEqual(map.calls.at(-1), ['setOptions', { tint: true, natural: false }]);
    assert.deepEqual(pressed(), ['tint']);
    baseBtn('natural').dispatch('click');
    assert.deepEqual(map.calls.at(-1), ['setOptions', { tint: false, natural: true }]);
    assert.deepEqual(pressed(), ['natural']);
    map.setOptions({ tint: false, natural: false });
    assert.deepEqual(pressed(), ['none'], '지도 옵션을 따라감');
    map.setOptions({ tint: true });
    assert.deepEqual(pressed(), ['tint']);
    map.setOptions({ tint: false });
    t.destroy();
    assert.equal(map.handlerCount, 0, '구독 0');
    assert.equal(stage.listenerCount, 0, '무대 키 리스너 0');
    assert.equal(stage.getAttribute('tabindex'), null);
    assert.equal(stage.childNodes.length, 2, '도구·축척 떼어 냄');
  }
});

test('바탕 「자연색」 늦게 불러오기: 불러오는 동안 단추 aria-busy, 실패하면 단추가 앞 바탕으로 돌아가고 알림 한 줄, 다른 바탕을 고르면 알림 숨김, 성공하면 바쁨만 풂', async () => {
  const { lazyNatural } = await import('../../src/atlas/natural.js');
  const stage = div();
  const map = fakeMap();
  const t = mapTools(stage, map);
  let resolve;
  const lazy = lazyNatural(map, { attach: () => new Promise((r) => { resolve = r; }), onState: (st) => t.setBaseState('natural', st) });
  const btn = (v) => findAll(t.el, byClass('at-tools-seg-btn')).find((b) => b.getAttribute('data-v') === v);
  const note = find(t.el, byClass('at-tools-note'));
  assert.equal(note.hidden, true);
  btn('tint').dispatch('click');
  btn('natural').dispatch('click');
  assert.equal(btn('natural').getAttribute('aria-busy'), 'true', '불러오는 중');
  assert.ok(btn('natural').classList.contains('is-busy'));
  assert.equal(btn('natural').getAttribute('aria-pressed'), 'true');
  resolve(null);
  await lazy.loading;
  assert.equal(btn('natural').getAttribute('aria-busy'), null, '바쁨 풂');
  assert.equal(btn('tint').getAttribute('aria-pressed'), 'true', '앞 바탕(고도 색)으로 돌아감');
  assert.equal(btn('natural').getAttribute('aria-pressed'), 'false');
  assert.equal(note.hidden, false, '알림 한 줄');
  assert.equal(note.getAttribute('role'), 'status');
  btn('none').dispatch('click');
  assert.equal(note.hidden, true, '다른 바탕을 고르면 알림 숨김');
  btn('natural').dispatch('click');
  assert.equal(btn('natural').getAttribute('aria-busy'), 'true', '다시 시도');
  map.naturalReady = true;
  resolve(() => {});
  await lazy.loading;
  assert.equal(btn('natural').getAttribute('aria-busy'), null);
  assert.equal(btn('natural').getAttribute('aria-pressed'), 'true', '붙으면 자연색 그대로');
  assert.equal(note.hidden, true);
  lazy.destroy(); t.destroy();
  assert.equal(map.handlerCount, 0);
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

test('coloringLayer smallPx(u3 작은 나라): 나라 전체 화면 크기가 작은 나라만 동그라미(칠한 색·강조·빈 테) + 누르면 그 나라, 화면에 조금만 걸친 큰 나라는 아님, 0 이면 없음', async () => {
  const { geoEquirectangular, geoPath } = await import('d3-geo');
  const sq = (iso, x, y, d) => ({ type: 'Feature', properties: { iso, ko: iso }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x, y + d], [x + d, y + d], [x + d, y], [x, y]]] } });
  // BIG 10°, VAT 0.1°, MCO 0.5°, EDGE 20° 나라(화면 왼쪽 위 모서리에 0.2°×0.2° 만 걸침 — 잘린 조각은 2×2px), FAR 0.1°(화면 밖)
  const feats = [sq('BIG', 0, 0, 10), sq('VAT', 20, 20, 0.1), sq('MCO', 30, 30, 0.5), sq('EDGE', -29.8, 39.8, 20), sq('FAR', 150, 10, 0.1)];
  // 1° ≈ 10px 정거 원통, 화면 0..800 × 0..600 = 경위도 대략 [-10, -20, 70, 40] → geoRect 로 잘라 그림
  const proj = geoEquirectangular().scale(10 * 180 / Math.PI).translate([100, 400]);
  const arcs = [];
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() { arcs.at(-1) && (arcs.at(-1).fill = this.fillStyle); }, stroke() { arcs.at(-1) && (arcs.at(-1).stroke = this.strokeStyle); }, arc(x, y, r) { arcs.push({ x, y, r }); } };
  const path = geoPath(proj, ctx);
  const view = { width: 800, height: 600, geoRect: [-10, -20, 70, 40] };
  const plain = coloringLayer(feats);
  assert.equal(plain.hit, undefined, '기본(0)은 hit 없음 — u2 동작 그대로');
  plain.draw(ctx, path, view);
  assert.equal(arcs.length, 0, '기본(0)은 동그라미 없음');
  const layer = coloringLayer(feats, { smallPx: 8, smallIsos: ['BIG', 'VAT', 'MCO', 'EDGE', 'FAR'] });
  layer.paint('MCO', '#b8dea0');
  layer.setTarget('VAT');
  layer.draw(ctx, path, view);
  const at = (lon, lat) => proj([lon, lat]).map((v) => Math.round(v * 10) / 10);
  assert.deepEqual(arcs.map((a) => [Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10, a.r]), [[...at(20.05, 20.05), 7], [...at(30.25, 30.25), 7]],
    'BIG(100px)·EDGE(잘린 조각은 2×2px 지만 나라 전체 200px)·FAR(화면 밖)는 동그라미 없음');
  assert.equal(arcs[0].fill, '#ff922b', '문제 강조는 주황');
  assert.equal(arcs[1].fill, '#b8dea0', '칠한 색');
  const v = proj([20.05, 20.05]), m = proj([30.25, 30.25]);
  assert.equal(layer.hit([v[0] + 8, v[1]])?.properties.iso, 'VAT', '반지름(7) + 3px 안');
  assert.equal(layer.hit([m[0], m[1] + 9])?.properties.iso, 'MCO');
  assert.equal(layer.hit([v[0] + 11, v[1]]), null);
  assert.equal(layer.hit(proj([5, 5])), null, '큰 나라는 바탕 지도 맞히기에 맡김');
  layer.setTarget(null); layer.paint('MCO', null);
  arcs.length = 0; layer.draw(ctx, path, view);
  assert.equal(arcs[0].fill, 'rgba(255,255,255,0.85)', '안 칠했으면 흰 바탕');
  // 확대하면(1° = 100px) MCO 50px·VAT 10px → 동그라미 없음
  const big = geoPath(geoEquirectangular().scale(100 * 180 / Math.PI).translate([-2000, 3400]), ctx);
  arcs.length = 0; layer.draw(ctx, big, { width: 800, height: 600, geoRect: [20, 28, 28, 34] });
  assert.equal(arcs.length, 0);
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

test('legendPanel: 무대 오른쪽 아래 떠 있는 범례 칸 — 머리 「범례」 + 접기 단추(aria-expanded), 접으면 머리만', () => {
  const stage = div();
  const P = legendPanel(stage);
  assert.ok(stage.childNodes.includes(P.el));
  assert.ok(P.el.classList.contains('at-legend-panel'));
  const btn = find(P.el, byClass('at-legend-panel-toggle'));
  assert.equal(find(P.el, byClass('at-legend-panel-title')).textContent, '범례');
  assert.ok(find(btn, byClass('ds-icon')), '선 아이콘(icon())');
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(btn.getAttribute('aria-controls'), P.body.getAttribute('id'), '접기 단추가 칸 몸통을 가리킴');
  assert.match(P.body.getAttribute('id'), /^at-legend-panel-\d+-[a-z0-9]+$/, '조각이 둘이어도 겹치지 않게 난수');
  assert.notEqual(legendPanel(div()).body.getAttribute('id'), P.body.getAttribute('id'));
  btn.dispatch('click');
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(P.body.hidden, true);
  assert.ok(P.el.classList.contains('is-collapsed'));
  assert.equal(P.collapsed, true);
  btn.dispatch('click');
  assert.equal(P.body.hidden, false);
  // 내용이 없으면 칸째 숨김
  P.sync();
  assert.equal(P.el.hidden, true);
  const a = div(); P.body.append(a); a.append(div()); P.sync();
  assert.equal(P.el.hidden, false);
  a.hidden = true; P.sync();
  assert.equal(P.el.hidden, true, '보이는 내용이 없으면 숨김');
  P.destroy();
  assert.ok(!stage.childNodes.includes(P.el));
});

test('legendPanel 끌기: 머리를 끌면 무대 안에서만 옮김(pointer capture, 지도 끌기로 번지지 않음), 접기 단추에서는 시작 안 함, 무대 크기가 바뀌면 다시 맞춤, 두 번 누르면 제자리', () => {
  const stage = div();
  stage._rect = { left: 100, top: 50, width: 800, height: 600 };
  const P = legendPanel(stage);
  { const c = div(); c.append(div()); P.body.append(c); } P.sync();
  P.el._rect = { left: 100 + 800 - 250, top: 50 + 600 - 300, width: 240, height: 290 }; // 오른쪽 아래(CSS)
  const head = find(P.el, byClass('at-legend-panel-head'));
  let captured = 0;
  head.setPointerCapture = () => { captured++; };
  const ev = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, ...extra }); // (가짜 DOM 은 stopPropagation 을 덮어씀 — 번짐은 헤드리스로 확인)
  head.dispatch('pointerdown', ev(700, 400, { target: head }));
  assert.equal(captured, 1);
  head.dispatch('pointermove', ev(500, 300));
  assert.equal(P.el.style.left, `${800 - 250 - 200}px`);
  assert.equal(P.el.style.top, `${600 - 300 - 100}px`);
  assert.equal(P.el.style.right, 'auto'); assert.equal(P.el.style.bottom, 'auto');
  // 무대 밖으로는 못 나감
  head.dispatch('pointermove', ev(-2000, -2000));
  assert.equal(P.el.style.left, '0px'); assert.equal(P.el.style.top, '0px');
  head.dispatch('pointermove', ev(5000, 5000));
  assert.equal(P.el.style.left, `${800 - 240}px`); assert.equal(P.el.style.top, `${600 - 290}px`);
  head.dispatch('pointerup', ev(5000, 5000));
  assert.ok(P.el.classList.contains('is-moved'));
  // 끈 뒤 움직임은 무시
  head.dispatch('pointermove', ev(0, 0));
  assert.equal(P.el.style.left, `${800 - 240}px`);
  // 접기 단추에서 누르면 끌기 시작 안 함
  const btn = find(P.el, byClass('at-legend-panel-toggle'));
  head.dispatch('pointerdown', ev(700, 400, { target: btn }));
  head.dispatch('pointermove', ev(100, 100));
  assert.equal(P.el.style.left, `${800 - 240}px`);
  head.dispatch('pointerup', ev(100, 100));
  // 무대가 작아지면 안으로 다시 맞춤
  P.el._rect = { left: 100 + 560, top: 50 + 310, width: 240, height: 290 };
  stage._rect = { left: 100, top: 50, width: 500, height: 400 };
  P.reclamp();
  assert.equal(P.el.style.left, `${500 - 240}px`); assert.equal(P.el.style.top, `${400 - 290}px`);
  // 두 번 누르면 오른쪽 아래로(인라인 자리 지움)
  head.dispatch('dblclick', { target: head });
  assert.equal(P.el.style.left, ''); assert.equal(P.el.style.top, '');
  assert.ok(!P.el.classList.contains('is-moved'));
  P.destroy();
});

test('tintLegendBlock + map: 높이·깊이 단계를 누르면 그 단계만(여러 개 고름), 다시 누르면 뺌, 전체 보기, aria-pressed 는 지도 옵션을 따라감, destroy 로 고름 풀기', () => {
  const map = fakeMap();
  map.setOptions({ tint: true, tintSelection: null });
  const T = tintLegendBlock(null, { map });
  const rows = findAll(T.el, byClass('at-tint-row'));
  assert.equal(rows.length, 18);
  assert.ok(rows.every((r) => r.tagName === 'button' && r.getAttribute('type') === 'button'), '단추(키보드·읽기 프로그램)');
  const byTitle = (t) => rows.find((r) => r.getAttribute('aria-label') === `육지 ${t}`);
  const b23 = byTitle('2,000~3,000 m'), b34 = byTitle('3,000~4,000 m');
  assert.ok(b23 && b34);
  assert.equal(b23.getAttribute('aria-pressed'), 'false');
  b23.dispatch('click');
  assert.deepEqual(map.options.tintSelection, [Number(b23.dataset.cls)]);
  b34.dispatch('click');
  assert.deepEqual([...map.options.tintSelection].sort(), [Number(b23.dataset.cls), Number(b34.dataset.cls)].sort());
  assert.equal(b23.getAttribute('aria-pressed'), 'true'); assert.equal(b34.getAttribute('aria-pressed'), 'true');
  const reset = find(T.el, byClass('at-legend-reset'));
  assert.equal(reset.hidden, false);
  b23.dispatch('click');
  assert.deepEqual(map.options.tintSelection, [Number(b34.dataset.cls)], '다시 누르면 뺌');
  reset.dispatch('click');
  assert.equal(map.options.tintSelection, null);
  assert.equal(reset.hidden, true);
  assert.equal(b34.getAttribute('aria-pressed'), 'false');
  map.setOptions({ tintSelection: [Number(b23.dataset.cls)] });
  assert.equal(b23.getAttribute('aria-pressed'), 'true', '다른 곳에서 바꿔도 따라감');
  const n = map.handlerCount;
  T.destroy();
  assert.equal(map.options.tintSelection, null, '주제를 바꾸면(범례를 버리면) 고름 풀기');
  assert.equal(map.handlerCount, n - 1);
  // map 없이 만든 범례는 누를 것 없음(그림과 글)
  const T2 = tintLegendBlock(null);
  assert.ok(findAll(T2.el, byClass('at-tint-row')).every((r) => r.tagName !== 'button'));
});

test('legendPanel 다시 맞춤: 숨었거나 크기 0 이면 옮긴 자리를 지킴, 내용이 바뀌면(sync) 다시 맞춤, 놓친 포인터(lostpointercapture)는 끌기 끝, 머리 방향키·Home', () => {
  const stage = div();
  stage._rect = { left: 0, top: 0, width: 800, height: 600 };
  const P = legendPanel(stage);
  const c = div(); c.append(div()); P.body.append(c); P.sync();
  P.el._rect = { left: 550, top: 300, width: 240, height: 290 };
  const head = find(P.el, byClass('at-legend-panel-head'));
  assert.equal(head.getAttribute('tabindex'), '0');
  head.dispatch('pointerdown', { clientX: 600, clientY: 310, pointerId: 1, button: 0, target: head });
  head.dispatch('pointermove', { clientX: 400, clientY: 210, pointerId: 1 });
  assert.deepEqual(P.position, { left: 350, top: 200 });
  head.dispatch('lostpointercapture', { pointerId: 1 });
  assert.ok(!P.el.classList.contains('is-dragging'), '놓친 포인터 = 끌기 끝');
  head.dispatch('pointermove', { clientX: 0, clientY: 0, pointerId: 1 });
  assert.deepEqual(P.position, { left: 350, top: 200 }, '끝난 뒤 움직임 무시');
  P.el._rect = { left: 350, top: 200, width: 240, height: 290 };
  // 숨은 칸(범례 없는 주제)은 크기 0 — 다시 맞춰도 자리 그대로
  c.hidden = true; P.sync();
  assert.equal(P.el.hidden, true);
  P.el._rect = { left: 0, top: 0, width: 0, height: 0 };
  P.reclamp();
  assert.deepEqual(P.position, { left: 350, top: 200 });
  // 보이지만 크기를 모름(0)도 그대로
  P.el.hidden = false; P.reclamp();
  assert.deepEqual(P.position, { left: 350, top: 200 });
  // 다시 보이고 더 긴 범례(높이 500) → sync 가 무대 안으로(top ≤ 600 − 500)
  c.hidden = false;
  P.el._rect = { left: 350, top: 200, width: 240, height: 500 };
  P.sync();
  assert.deepEqual(P.position, { left: 350, top: 100 });
  // 방향키(10px, Shift 40px), Home = 제자리
  head.dispatch('keydown', { key: 'ArrowLeft', target: head });
  assert.deepEqual(P.position, { left: 340, top: 100 });
  head.dispatch('keydown', { key: 'ArrowUp', shiftKey: true, target: head });
  assert.deepEqual(P.position, { left: 340, top: 60 });
  head.dispatch('keydown', { key: 'Home', target: head });
  assert.equal(P.position, null);
  assert.equal(P.el.style.left, '');
  P.destroy();
});

test('legendBlock: 윤곽만 분류(style outline — 유로 사용국)의 견본은 칠하지 않은 테두리 상자(교과서 색)', () => {
  const items = [{ cls: 'c1', color: '#b9d989', label: '가입국', kind: 'fill' }, { cls: 'c3', color: '#ffdd00', label: '유로 사용 국가', kind: 'fill', style: 'outline' }];
  const b = legendBlock(div(), createLegendState(['c1', 'c3']), items, { title: '유럽 연합' });
  const sw = findAll(b.el, byClass('at-swatch'));
  assert.ok(sw[0].classList.contains('at-swatch-fill'));
  assert.ok(sw[1].classList.contains('at-swatch-outline') && !sw[1].classList.contains('at-swatch-fill'));
  assert.equal(sw[1].style.borderColor, '#ffdd00');
  assert.ok(!sw[1].style.background, '채움 없음');
  b.destroy();
});

test('legendBlock 겹친 원(legendStyle nested-circles): 큰 원부터 겹친 원 + 오른쪽 값 글자, 원을 누르면(Enter 도) 그 단계만', () => {
  const items = [8, 6, 4.5, 3, 2].map((size, i) => ({ cls: `c${i + 1}`, color: '#00843d', kind: 'fill', label: ['1,000 이상', '300~1,000', '100~300', '50~100', '30~50'][i], size }));
  const lg = createLegendState(items.map((e) => e.cls));
  const b = legendBlock(div(), lg, items, { title: '도시 인구', legendStyle: 'nested-circles' });
  assert.equal(findAll(b.el, byClass('at-legend-item')).length, 0, '줄 목록 대신 겹친 원');
  const nest = find(b.el, byClass('at-legend-nested'));
  const circles = findAll(nest, byClass('at-legend-nest-circle')).map((c) => Number(c.getAttribute('r')));
  assert.deepEqual(circles, [...circles].sort((x, y) => y - x), '큰 원부터(뒤에 깔림)');
  assert.deepEqual(findAll(nest, byClass('at-legend-nest-label')).map((t) => t.textContent), items.map((e) => e.label));
  const gs = findAll(nest, byClass('at-legend-nest-item'));
  gs[2].dispatch('click');
  assert.equal(lg.selected(), 'c3');
  assert.equal(gs[2].getAttribute('aria-pressed'), 'true');
  gs[4].dispatch('keydown', { key: 'Enter' });
  assert.equal(lg.selected(), 'c5');
  // 색이 다르거나 size 없는 항목(30쪽 「사례 도시」 흰 원)은 겹친 원에 넣지 않고 아래 줄 목록으로. 범례 상태가 없으면 원은 단추가 아님
  const b2 = legendBlock(div(), null, [...items, { cls: 'x', color: '#ffffff', kind: 'fill', label: '사례 도시', size: 2.9 }, { cls: 'y', color: '#000', kind: 'fill', label: '기타' }], { legendStyle: 'nested-circles' });
  const nest2 = find(b2.el, byClass('at-legend-nested'));
  assert.deepEqual(findAll(nest2, byClass('at-legend-nest-label')).map((t) => t.textContent), items.map((e) => e.label));
  assert.deepEqual(findAll(b2.el, byClass('at-legend-label')).map((t) => t.textContent), ['사례 도시', '기타']);
  for (const g of findAll(nest2, byClass('at-legend-nest-item'))) { assert.equal(g.getAttribute('role'), null); assert.equal(g.getAttribute('tabindex'), null); }
  b.destroy(); b2.destroy();
});

test('legendBlock 값 아이콘 설명(valueLegend): 아이콘 두 개와 설명', () => {
  const b = legendBlock(div(), null, [{ cls: 'c1', color: '#8dc63f', kind: 'fill', label: '도시' }],
    { title: '리스본', valueLegend: [{ icon: 'charger', label: '1km²당 충전소' }, { icon: 'person', label: '인구 100명당 충전소' }] });
  const rows = findAll(b.el, byClass('at-legend-value'));
  assert.deepEqual(rows.map((r) => find(r, byClass('at-legend-label')).textContent), ['1km²당 충전소', '인구 100명당 충전소']);
  assert.equal(rows.filter((r) => find(r, byClass('at-legend-vicon'))).length, 2);
  b.destroy();
});

test('renderChart 유럽 형식: 묶음 막대는 csat 캔버스, 강조·축 생략 막대는 SVG(강조 색 막대 하나·물결·눈금 680)', () => {
  const box = div();
  const g = renderChart(box, { id: 'p31-tallinn', type: 'groupedBar', title: '탈린', unit: '%', categories: ['대중교통', '승용차'],
    series: [{ name: '도입 전', values: [55, 31], color: '#e60012' }, { name: '도입 후', values: [63, 28], color: '#0e90c1' }], axes: { y: { step: 10, n: 8 } } });
  assert.ok(find(g.el, (n) => n.tagName === 'CANVAS' || n.tagName === 'canvas'), '캔버스');
  assert.equal(find(g.el, byClass('ds-note')), null, '실패 글 없음');
  const b = renderChart(box, { id: 'p30-gfci', type: 'bar', title: '국제 금융 센터 지수', unit: '지수', categories: ['뉴욕', '런던', '서울'],
    series: [{ name: '지수', values: [763, 744, 727], color: '#0e90c1' }], colors: { 런던: '#e60012' }, axisBreak: [0, 680], axes: { y: { step: 20, n: 6 } } });
  const rects = findAll(b.el, (n) => n.tagName === 'rect' && n.parentNode?.classList?.contains('at-ct-bar'));
  assert.deepEqual(rects.map((r) => r.getAttribute('fill')), ['#0e90c1', '#e60012', '#0e90c1']);
  assert.equal(findAll(b.el, byClass('at-ct-wave')).length, 2, '물결선 두 줄');
  assert.ok(findAll(b.el, byClass('at-ct-tick')).some((t) => t.textContent === '680'));
  assert.equal(find(b.el, byClass('ds-note')), null);
  // 값이 빈 막대(null·undefined)는 막대 없이 「자료 없음」 말풍선만(U3-3 리뷰 — 'undefined' 글자·0 높이 막대 막기)
  const c = renderChart(box, { id: 'p30-gfci2', type: 'bar', title: '지수', unit: '지수', categories: ['뉴욕', '런던', '서울'],
    series: [{ name: '지수', values: [763, null, 727], color: '#0e90c1' }], colors: { 런던: '#e60012' }, axisBreak: [0, 680], axes: { y: { step: 20, n: 6 } } });
  const bars = findAll(c.el, byClass('at-ct-bar'));
  assert.equal(bars.length, 3);
  assert.equal(findAll(bars[1], (n) => n.tagName === 'rect').length, 0);
  assert.ok(!findAll(c.el, (n) => n.tagName === 'title').some((t) => /undefined|null|NaN/.test(t.textContent)));
  assert.equal(find(bars[1], (n) => n.tagName === 'title').textContent, '런던 자료 없음');
});

// ── U4-3c 고리 그래프 · U4-3d 원 크기 줄 · U4-3b 점무늬 범례 견본 · U4-3e 작은 나라 넓이 기준 ─────────────────
test('renderChart 고리(pie + ring): 등록 전에는 「그리지 못함」(u2·u3 조각엔 코드 없음), installExtraCharts 뒤 시험지 양식 SVG — 조각 수 = 계열 수(검은 선), 가운데 글자, 아래 견본 목록; donut 만이면 csat 캔버스', async () => {
  const box = div();
  const spec = { id: 'p38-bauxite', type: 'pie', ring: 0.6, title: '보크사이트', unit: '%', categories: ['2020년'], center: ['39,100', '(만 톤)', '2020년'],
    series: [{ name: '기니', values: [22], color: '#f7941d' }, { name: '오스트레일리아', values: [27.5], color: '#8dc63f' }, { name: '기타', values: [50.5], color: '#d1d3d4' }] };
  const errs = []; const ce = console.error; console.error = (...a) => errs.push(a.join(' '));
  try { assert.ok(find(renderChart(box, spec).el, byClass('ds-note')), '등록 전: 실패 글'); } finally { console.error = ce; }
  assert.match(errs.join(), /등록되지 않음/);
  const { installExtraCharts } = await import('../../src/atlas/chartsExtra.js');
  installExtraCharts();
  const r = renderChart(box, spec);
  assert.ok(r.el.classList.contains('at-chart-svg'));
  const segs = findAll(r.el, (n) => n.tagName === 'path' && n.parentNode?.classList?.contains('at-ct-cell'));
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((p) => [p.getAttribute('fill'), p.getAttribute('stroke')]), [['#f7941d', '#231f20'], ['#8dc63f', '#231f20'], ['#d1d3d4', '#231f20']]);
  const texts = findAll(r.el, (n) => n.tagName === 'text').map((t) => t.textContent);
  for (const t of ['39,100', '(만 톤)', '2020년', '기니 22', '기타 50.5']) assert.ok(texts.includes(t), t);
  assert.equal(find(r.el, byClass('ds-note')), null);
  const c = renderChart(box, { ...spec, ring: undefined, donut: 0.595 });
  assert.ok(find(c.el, (n) => n.tagName === 'CANVAS' || n.tagName === 'canvas'), 'donut 만 → csat 원그래프(유럽 31쪽 그대로)');
});

test('renderChart 원 크기 줄(bubbleRow): 원마다 이름·값, 지름 비 = √값 비, 자료 차례', () => {
  const r = renderChart(div(), { id: 'p39-ggw', type: 'bubbleRow', title: '복원된 녹지 면적', unit: '십 km²', categories: ['에티오피아', '니제르', '지부티'],
    series: [{ name: '면적', values: [2006, 809, 0.13], color: '#8b6bb1' }] });
  const circles = findAll(r.el, (n) => n.tagName === 'circle');
  assert.equal(circles.length, 3);
  const d = circles.map((c) => 2 * Number(c.getAttribute('r')));
  assert.ok(Math.abs(d[0] / d[1] - 1.575) < 0.01);
  assert.ok(d[2] >= 2);
  assert.deepEqual(findAll(r.el, (n) => n.tagName === 'text').map((t) => t.textContent).slice(0, 2), ['에티오피아', '2,006']);
  assert.equal(find(r.el, byClass('ds-note')), null);
});

test('legendBlock 점무늬 견본(pattern dots): 점 무늬 배경, 빗금·단색 견본은 그대로', () => {
  const items = [{ cls: 'a', label: '매우 높음', color: '#ed1c24', kind: 'fill' }, { cls: 'd', label: '사하라 사막', color: '#7a6a53', kind: 'fill', pattern: 'dots' },
    { cls: 'h', label: '사헬 지역', color: '#2e3192', kind: 'fill', pattern: 'hatch' }];
  const b = legendBlock(null, createLegendState(['a', 'd', 'h']), items, { title: '사막화' });
  const sw = findAll(b.el, byClass('at-swatch-fill')).map((e) => e.style.background);
  assert.equal(sw[0], '#ed1c24');
  assert.match(sw[1], /radial-gradient\(circle, #7a6a53/);
  assert.match(sw[2], /repeating-linear-gradient\(45deg, #2e3192/);
});

test('coloringLayer smallMetric area(U4-3e): 가늘고 긴 나라·흩어진 섬나라는 가장 큰 조각 넓이로 작음(상자 기준이면 아님), 확대하면 없어짐, 없으면 상자 기준 그대로', async () => {
  const { geoEquirectangular, geoPath } = await import('d3-geo');
  const { largestPart, areaPx } = await import('../../src/atlas/quiz.js');
  const rect = (x, y, w, hh) => [[[x, y], [x, y + hh], [x + w, y + hh], [x + w, y], [x, y]]];
  const feat = (iso, coordinates) => ({ type: 'Feature', properties: { iso, ko: iso }, geometry: { type: 'MultiPolygon', coordinates } });
  // GMB 감비아 꼴 4.5° × 0.4°(1° = 10px → 45 × 4px), SYC 세이셸 꼴 10° 넓이에 0.1° 섬 셋(섬 1px, 상자 100px), BIG 10° 나라
  const feats = [feat('GMB', [rect(0, 10, 4.5, 0.4)]), feat('SYC', [rect(20, 0, 0.1, 0.1), rect(25, 5, 0.1, 0.1), rect(29.9, 9.9, 0.1, 0.1)]), feat('BIG', [rect(40, 0, 10, 10)])];
  const proj = geoEquirectangular().scale(10 * 180 / Math.PI).translate([100, 400]);
  const arcs = [];
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc(x, y, r) { arcs.push({ x, y, r }); } };
  const view = { width: 800, height: 600, geoRect: null };
  const isos = ['GMB', 'SYC', 'BIG'];
  const drawAt = (layer, p) => { arcs.length = 0; layer.draw(ctx, geoPath(p, ctx), view); return arcs.map((a) => [Math.round(a.x), Math.round(a.y)]); };
  const at = (ll) => proj(ll).map(Math.round);
  // 넓이 어림: 감비아 = √(45 × 4) ≈ 13.4px
  const gmb = largestPart(feats[0].geometry);
  assert.ok(Math.abs(areaPx(proj, gmb) - Math.sqrt(45 * 4)) < 0.3, `${areaPx(proj, gmb)}`);
  const area = coloringLayer(feats, { smallPx: 16, smallIsos: isos, smallMetric: 'area' });
  const box = coloringLayer(feats, { smallPx: 16, smallIsos: isos });
  const near = (got, want) => got.length === want.length && got.every((p, i) => Math.hypot(p[0] - want[i][0], p[1] - want[i][1]) <= 1.5);
  const got = drawAt(area, proj);
  assert.ok(near(got, [at([2.25, 10.2]), at([20.05, 0.05])]), `넓이 기준: 감비아(13.4px)·세이셸(가장 큰 섬 1px — 적도 쪽 첫 섬 가운데) ${JSON.stringify(got)}`);
  assert.deepEqual(drawAt(box, proj), [], '상자 기준: 감비아 45px·세이셸 100px 이라 작지 않음(유럽 u3 규칙 그대로)');
  assert.deepEqual(drawAt(coloringLayer(feats, { smallPx: 16, smallIsos: isos, smallMetric: 'box' }), proj), drawAt(box, proj), "'box' = 기본");
  assert.equal(area.hit(proj([2.25, 10.2]))?.properties.iso, 'GMB', '동그라미를 누르면 그 나라');
  // 확대(1° = 100px): 감비아 134px → 없어짐, 세이셸 섬 10px → 남음
  const zoom = geoEquirectangular().scale(100 * 180 / Math.PI).translate([100, 400]);
  arcs.length = 0; area.draw(ctx, geoPath(zoom, ctx), { width: 4000, height: 2000, geoRect: null });
  assert.deepEqual(arcs.map((a) => Math.round(zoom.invert([a.x, a.y])[0] * 100) / 100), [20.05]);
});
