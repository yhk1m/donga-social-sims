// tests/atlas/topic.test.mjs — 주제 조립(src/atlas/topic.js buildTopic, Task E1)을 가짜 DOM·가짜 지도로:
// 8개 주제를 모두 펼치고 부수기를 되풀이해도 지도 레이어·구독·무대 요소가 남지 않는지, 레이어 묶음 바꾸기·보기 맞추기·확대 창(싱가포르)·
// 막대 하나씩 보기(자원·수출)·세계유산 퀴즈 사진 자르기를 본다. 픽셀은 헤드리스 Chrome 캡처로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { register } from 'node:module';
import { REPO, readJson } from '../../scripts/atlas/geo_util.mjs';
import { installFakeDom } from './helpers/fakeDom.mjs';

register('./helpers/cssHooks.mjs', import.meta.url);
const dom = installFakeDom();
class FakeImage { addEventListener() {} set src(v) { this._src = v; } } // 밀도 음영 이미지: 불러오지도 실패하지도 않음
globalThis.Image = FakeImage;
const { buildTopic, layerGroups, groupView, groupBounds } = await import('../../src/atlas/topic.js');
const { pageViewer, tooltip, creditBlock } = await import('../../src/atlas/ui.js');
const { photoCropStyle } = await import('../../src/atlas/uiCore.js');
const { insetProjection, geoBox } = await import('../../src/atlas/inset.js');
test.after(() => { delete globalThis.Image; dom.restore(); });

const DATA = path.join(REPO, 'sims/atlas-u2-asia/data');
const topics = readJson(path.join(DATA, 'topics.json'));
const charts = readJson(path.join(DATA, 'charts.json'));
const outline = readJson(path.join(DATA, 'inset-p22-singapore.json'));
const layerData = {};
for (const t of topics) for (const r of t.layers || []) layerData[r.ref] = readJson(path.join(DATA, `${r.ref}.json`));
const div = () => document.createElement('div');
const TRADE = [55, -45, -60, 72];

/** 렌더러 흉내: 레이어 목록(addLayer·removeLayer·clearLayers 가 destroy 를 부름 — 렌더러 계약), on() 구독 수, fitBounds 기록 */
function fakeMap() {
  const handlers = { click: new Set(), hover: new Set(), viewchange: new Set() };
  const layers = new Map();
  const calls = [];
  return {
    calls, destroyed: false,
    view: { key: 'miller', centerLon: 0, k: 2, x: 0, y: 0, width: 800, height: 600, kmPerPx: 10 },
    on(type, fn) { handlers[type].add(fn); return () => handlers[type].delete(fn); },
    get handlerCount() { return Object.values(handlers).reduce((a, x) => a + x.size, 0); },
    get layers() { return [...layers.values()]; },
    addLayer(L) { const old = layers.get(L.id); if (old && old !== L) old.destroy?.(); layers.set(L.id, L); },
    removeLayer(id) { const L = layers.get(id); if (!L) return false; layers.delete(id); L.destroy?.(); return true; },
    clearLayers() { for (const L of [...layers.values()]) L.destroy?.(); layers.clear(); },
    refreshLayer() { return true; },
    fitBounds(b, o) { calls.push(['fitBounds', b, o]); },
    flyTo(t) { calls.push(['flyTo', t]); },
    setCenterLon(c) { calls.push(['setCenterLon', c]); this.view = { ...this.view, centerLon: c }; },
    setOptions() {}, invalidate() {},
  };
}
const find = (el, pred) => {
  if (pred(el)) return el;
  for (const c of el.childNodes || []) { const r = find(c, pred); if (r) return r; }
  return null;
};
const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); for (const c of el.childNodes || []) findAll(c, pred, out); return out; };
const byClass = (c) => (n) => n.classList?.contains(c);

function setup() {
  const stage = div(), panel = div(), body = div();
  panel.append(body);
  const map = fakeMap();
  const viewer = pageViewer(stage);
  const tip = tooltip(stage, { map });
  const credits = creditBlock(panel);
  const base = map.handlerCount;
  const build = (topic, extra = {}) => buildTopic({
    map, stage, body, viewer, credits, tip, topic, charts, layers: layerData, countryFeatures: { 50: [] },
    insets: { 'layer-p22-singapore': outline }, boundsOf: { 'layer-p24-trade': TRADE }, centerLonOf: { 'layer-p24-trade': 150 }, seed: 7, ...extra,
  });
  return { stage, panel, body, map, viewer, tip, credits, base, build };
}
const topicOf = (id) => topics.find((t) => t.id === id);

test('layerGroups·groupView·groupBounds: 같은 이름 레이어는 한 지도, 바로가기 짝, 교역은 지정 범위', () => {
  const pop = layerGroups(topicOf('population'));
  assert.deepEqual(pop.map((g) => g.refs.length), [2, 1], '인구 분포 = 밀도 음영 + 1억 명 막대');
  const rel = topicOf('religion');
  const gs = layerGroups(rel);
  assert.deepEqual(gs.map((g) => groupView(rel, g)?.id), ['religion', 'kashmir', 'singapore']);
  assert.deepEqual(groupBounds(rel, gs[2]), rel.views.find((v) => v.id === 'singapore').bounds);
  const ind = topicOf('industry');
  const trade = layerGroups(ind).find((g) => g.refs[0].ref === 'layer-p24-trade');
  assert.deepEqual(groupBounds(ind, trade, { 'layer-p24-trade': TRADE }), TRADE);
  assert.deepEqual(groupBounds(ind, layerGroups(ind)[0]), ind.view.bounds, '딸린 view 가 없으면 주제 view');
});

test('8개 주제를 차례로 펼치고 부수기를 두 번 되풀이: 제목·블록이 생기고, destroy 뒤 레이어 0·구독은 처음 그대로·무대에 확대 창 없음·본문 빔', () => {
  const S = setup();
  for (let round = 0; round < 2; round++) {
    for (const t of topics) {
      const T = S.build(t);
      assert.equal(find(S.body, byClass('at-topic-title')).textContent, t.title);
      const pages = findAll(S.body, byClass('at-page-btn'));
      assert.equal(pages.length, t.blocks.filter((b) => b.type === 'page').length, `${t.id} 원본 쪽 보기 단추`);
      assert.ok(S.map.layers.length >= (t.layers?.length ? 1 : 0) + (t.markers?.length ? 1 : 0), `${t.id} 레이어`);
      if (t.markers?.length) assert.ok(T.pins, `${t.id} 핀`);
      T.destroy();
      assert.equal(S.map.layers.length, 0, `${t.id} 레이어 남음`);
      assert.equal(S.map.handlerCount, S.base, `${t.id} 지도 구독 남음`);
      assert.equal(S.body.childNodes.length, 0, `${t.id} 본문 남음`);
      assert.equal(findAll(S.stage, byClass('at-inset')).length, 0, `${t.id} 확대 창 남음`);
      T.destroy(); // 두 번 불러도 괜찮음
    }
  }
});

test('묶음 바꾸기: 앞 묶음 레이어·범례 블록을 내리고 새 묶음만, 보기 맞추기(인구 → 증가율), 출처 줄 갱신', () => {
  const S = setup();
  const t = topicOf('population');
  const T = S.build(t);
  assert.deepEqual(S.map.layers.map((L) => L.id).sort(), ['layer-p23-density-cities', 'overlay-p23-density']);
  assert.equal(findAll(S.body, byClass('at-legend')).length, 2);
  const seg = findAll(S.body, byClass('ds-seg-btn')).filter((b) => b.getAttribute('title'));
  assert.equal(seg.length, 2);
  assert.equal(seg[0].getAttribute('aria-pressed'), 'true');
  seg[1].dispatch('click');
  assert.equal(T.group, 1);
  assert.deepEqual(S.map.layers.map((L) => L.id), ['layer-p23-growth']);
  assert.equal(findAll(S.body, byClass('at-legend')).length, 1);
  assert.equal(seg[1].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(S.map.calls.at(-1), ['fitBounds', t.view.bounds, undefined]);
  assert.match(find(S.panel, byClass('at-credits-list')).textContent, /세계 인구 전망/);
  T.destroy();
  assert.equal(S.map.handlerCount, S.base);
});

test('산업: 교역 묶음은 지정 범위(날짜변경선 건넘)로 맞추고, 자원·수출 100% 띠는 막대 하나씩 보기(단추로 바꿈, 크게 보기 = 막대 전부)', () => {
  const S = setup();
  const T = S.build(topicOf('industry'));
  const pickers = findAll(S.body, byClass('at-barpick'));
  assert.equal(pickers.length, 2, '자원 생산·수출 비율');
  const btns = findAll(pickers[0], byClass('at-barpick-btn'));
  assert.deepEqual(btns.map((b) => b.textContent), charts['p24-resources'].categories);
  assert.equal(find(pickers[0], byClass('at-barpick-cat')).textContent, '석탄');
  btns[1].dispatch('click');
  assert.equal(find(pickers[0], byClass('at-barpick-cat')).textContent, '석유');
  assert.equal(btns[1].getAttribute('aria-pressed'), 'true');
  const items = findAll(pickers[0], byClass('at-barpick-item'));
  assert.equal(items.length, charts['p24-resources'].stackOrder['석유'].length);
  assert.match(items[0].textContent, /^사우디아라비아\d/);
  find(pickers[0], byClass('at-expand')).dispatch('click');
  assert.ok(S.viewer.open);
  const big = findAll(S.viewer.el, (n) => n.tagName === 'svg' && n.classList?.contains('at-chart-svg'));
  assert.equal(big.length, 1);
  assert.equal(findAll(big[0], byClass('at-ct-cat')).length, 5, '크게 보기 = 교과서 모양 막대 전부(5줄)');
  const seg = findAll(S.body, byClass('ds-seg-btn')).filter((b) => b.getAttribute('title'));
  seg[2].dispatch('click');
  assert.deepEqual(S.map.calls.at(-1)[1], TRADE);
  assert.deepEqual(S.map.calls.at(-2), ['setCenterLon', 150], '교역은 태평양 중심');
  seg[0].dispatch('click');
  assert.equal(S.map.view.centerLon, 0, '묶음을 떠나면 중심 경도 되돌림');
  seg[2].dispatch('click');
  S.map.setCenterLon(30); // 사용자가 바꿨으면
  seg[1].dispatch('click');
  assert.equal(S.map.view.centerLon, 30, '사용자가 바꾼 중심 경도는 그대로');
  T.destroy();
  assert.equal(S.viewer.open, false, '주제를 바꾸면 겹침 창도 닫음');
});

test('종교·문화: 싱가포르 묶음 = 큰 지도에는 위치 상자만, 무대에 확대 창(사원 76개·범례 같음·닫기·상자 누르면 다시 열림), 범례 고르면 창 기호도 흐려짐', () => {
  const S = setup();
  const t = topicOf('religion');
  const T = S.build(t);
  assert.equal(findAll(S.stage, byClass('at-inset')).length, 0);
  const sg = T.groups.findIndex((g) => g.refs[0].ref === 'layer-p22-singapore');
  T.showGroup(sg);
  assert.deepEqual(S.map.layers.map((L) => L.id).filter((id) => !id.startsWith('markers')), ['layer-p22-singapore:box'], '기호 레이어는 큰 지도에 올리지 않음');
  const inset = find(S.stage, byClass('at-inset'));
  assert.ok(inset && !inset.hidden);
  const syms = findAll(inset, byClass('at-inset-sym'));
  assert.equal(syms.length, 76);
  assert.equal(findAll(inset, byClass('at-inset-name')).length, 4, '이름 쓴 사원 4곳');
  assert.equal(findAll(inset, byClass('at-inset-legend-item')).length, 5);
  assert.ok(find(inset, byClass('at-badge')), '위치 근사');
  // 범례: 사이드바 범례 블록을 누르면 창의 기호도 흐려짐
  const lg = find(S.body, byClass('at-legend'));
  const first = findAll(lg, byClass('at-legend-item'))[0];
  first.dispatch('click');
  const dim = syms.filter((c) => c.getAttribute('opacity') === '0.2').length;
  assert.ok(dim > 0 && dim < 76, `흐린 기호 ${dim}`);
  // 말풍선: 기호에 포인터
  syms[0].dispatch('pointerenter', { clientX: 30, clientY: 40 });
  assert.equal(S.tip.el.hidden, false);
  assert.ok(S.tip.el.textContent.length > 0);
  // 닫기 → 상자 누르면 다시 열림
  find(inset, byClass('at-inset-close')).dispatch('click');
  assert.equal(inset.hidden, true);
  const box = S.map.layers.find((L) => L.id === 'layer-p22-singapore:box');
  const g = document.createElementNS('svg', 'g');
  box.drawSvg(g, ([lon, lat]) => [lon * 10, -lat * 10]);
  find(g, byClass('at-inset-box')).dispatch('click');
  assert.equal(inset.hidden, false);
  // 다른 묶음으로 가면 창이 사라짐
  T.showGroup(0);
  assert.equal(findAll(S.stage, byClass('at-inset')).length, 0);
  assert.deepEqual(S.map.layers.map((L) => L.id).filter((id) => !id.startsWith('markers')), ['layer-p22-religion']);
  T.showGroup(sg);
  T.destroy();
  assert.equal(findAll(S.stage, byClass('at-inset')).length, 0);
  assert.equal(S.map.handlerCount, S.base);
});

test('바로가기 블록: 「지도에서 보기」를 누르면 그 묶음을 고르거나(종교) 그 범위로 맞춤(일반도)', () => {
  const S = setup();
  const T = S.build(topicOf('general'));
  const vb = findAll(S.body, byClass('at-view-btn'));
  assert.equal(vb.length, 3);
  vb[1].dispatch('click');
  assert.deepEqual(S.map.calls.at(-1)[1], topicOf('general').views[1].bounds);
  T.destroy();
  const R = S.build(topicOf('religion'));
  const btn = findAll(S.body, byClass('at-view-btn')).find((b) => /싱가포르/.test(b.textContent));
  btn.dispatch('click');
  assert.ok(find(S.stage, byClass('at-inset')));
  R.destroy();
});

test('세계유산 퀴즈: 사진은 이름 띠를 뺀 부분만(photoCrop → 상자 비율·이미지 %), 캡션은 번호만 → 답하면 이름', () => {
  const S = setup();
  const t = topicOf('heritage');
  assert.ok(t.markers.every((m) => Array.isArray(m.quiz.photoCrop)), '마커마다 photoCrop');
  const T = S.build(t);
  const cur = T.quiz.current;
  const crop = find(S.body, byClass('at-quiz-crop'));
  assert.ok(crop, '자른 상자');
  const st = photoCropStyle(cur.quiz.photoCrop, cur.photo.width, cur.photo.height);
  assert.equal(crop.style.aspectRatio, `${st.aspect}`);
  const img = find(crop, byClass('at-quiz-crop-img'));
  assert.equal(img.style.width, `${st.width}%`);
  const cap = find(S.body, byClass('at-quiz-cap'));
  assert.equal(cap.textContent, String(cur.photo.pin), '문제 낼 때는 번호만');
  T.quiz.answer(cur.quiz.country);
  assert.match(cap.textContent, new RegExp(cur.title));
  T.destroy();
});

test('photoCropStyle·insetProjection·geoBox 순수 계산', () => {
  assert.deepEqual(photoCropStyle([0, 0.25, 1, 0.75], 400, 200), { aspect: 4, width: 100, left: -0, top: -50 });
  assert.equal(photoCropStyle([0, 0, 1, 1], 400, 200), null);
  assert.equal(photoCropStyle([0.5, 0, 0.52, 1], 400, 200), null, '너무 좁음');
  assert.equal(photoCropStyle(null, 400, 200), null);
  const b = geoBox(outline);
  assert.ok(b[0] > 103.5 && b[2] < 104.2 && b[1] > 1.1 && b[3] < 1.5, `싱가포르 윤곽 범위 ${b}`);
  const P = insetProjection(b, { width: 520, pad: 10 });
  const [x0, y0] = P.project([b[0], b[3]]), [x1, y1] = P.project([b[2], b[1]]);
  assert.ok(Math.abs(x0 - 10) < 1e-9 && Math.abs(y0 - 10) < 1e-9 && Math.abs(x1 - 510) < 1e-9 && Math.abs(y1 - (P.height - 10)) < 1);
  assert.ok(P.unitKm > 0.05 && P.unitKm < 0.2, `viewBox 1 = ${P.unitKm}km`);
});

test('주제를 바꾸면 말풍선을 숨김(destroy → tip.hide)', () => {
  const S = setup();
  const T = S.build(topicOf('religion'));
  S.tip.show('술탄 모스크', [10, 10]);
  assert.equal(S.tip.el.hidden, false);
  T.destroy();
  assert.equal(S.tip.el.hidden, true);
});

test('확대 창: 열 때 닫기 단추로 초점(Esc 가 창에 걸림), Esc 로 닫힘, 도로(고속·일반)를 사원 아래에, 위치 상자는 지명 장애물(상자 + 글자)', () => {
  const S = setup();
  const proto = Object.getPrototypeOf(document.createElement('div'));
  let focused = null;
  proto.focus = function focus() { focused = this; };
  try {
    const T = S.build(topicOf('religion'));
    T.showGroup(T.groups.findIndex((g) => g.refs[0].ref === 'layer-p22-singapore'));
    const inset = find(S.stage, byClass('at-inset'));
    assert.ok(focused?.classList.contains('at-inset-close'), '닫기 단추에 초점');
    const svg = find(inset, byClass('at-inset-svg'));
    const kids = svg.children.map((c) => c.getAttribute('class'));
    assert.ok(kids.indexOf('at-inset-roads') > kids.indexOf('at-inset-land') && kids.indexOf('at-inset-roads') < kids.findIndex((c) => c === 'at-inset-sym'), `그리는 차례 ${kids.slice(0, 5)}`);
    const nRoads = outline.features.filter((f) => f.geometry.type === 'LineString').length;
    assert.ok(nRoads > 10);
    assert.equal(findAll(inset, byClass('at-inset-road')).length, nRoads);
    assert.equal(findAll(inset, byClass('at-inset-road-casing')).length, nRoads);
    assert.ok(findAll(inset, byClass('at-inset-road-expressway')).length > 0, '고속 도로');
    inset.dispatch('keydown', { key: 'Escape' });
    assert.equal(inset.hidden, true);
    focused = null;
    const box = S.map.layers.find((L) => L.id === 'layer-p22-singapore:box');
    assert.deepEqual(box.labelObstacles(), [], '그리기 전엔 없음');
    box.drawSvg(document.createElementNS('svg', 'g'), ([lon, lat]) => [lon * 10, -lat * 10]);
    const ob = box.labelObstacles();
    assert.equal(ob.length, 2);
    assert.ok(ob[1][0] > ob[0][2], '글자 상자는 상자 오른쪽');
    T.destroy();
  } finally { delete proto.focus; }
});

test('segButtons: 단추마다 ds-seg-btn·data-v·aria-pressed, set 은 표시만, 누르면 onPick(값)', async () => {
  const { segButtons } = await import('../../src/atlas/seg.js');
  const picked = [];
  const sg = segButtons([[0, '가', '가 제목'], [1, '나']], { onPick: (v) => picked.push(v), label: '고르기', className: 'x', btnClass: 'y', current: 1 });
  assert.equal(sg.el.getAttribute('class'), 'ds-seg x');
  assert.equal(sg.el.getAttribute('aria-label'), '고르기');
  assert.deepEqual(sg.btns.map((b) => [b.getAttribute('class'), b.getAttribute('data-v'), b.getAttribute('aria-pressed'), b.getAttribute('title')]),
    [['ds-seg-btn y', '0', 'false', '가 제목'], ['ds-seg-btn y', '1', 'true', null]]);
  sg.btns[0].dispatch('click');
  assert.deepEqual(picked, [0]);
  assert.equal(sg.btns[0].getAttribute('aria-pressed'), 'false', '누르기만으로는 표시 안 바뀜(부르는 쪽이 set)');
  sg.set(0);
  assert.equal(sg.value, 0);
  assert.equal(sg.btns[0].getAttribute('aria-pressed'), 'true');
});
