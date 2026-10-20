// © 2026 김용현
// src/atlas/quiz.js — 17쪽 색칠하기·나라 이름 맞히기, 25쪽 세계유산 「어느 나라·어느 종교?」. 상태는 메모리에만 둔다(localStorage 없음).
//
//   const layer = coloringLayer(countryFeatures)        // 나라 칠하기 캔버스 레이어(z 12: 육지 위, 국경 아래) — map.addLayer(layer) 는 부르는 쪽이
//   const q = coloringQuiz(map, layer, quiz.countries, { seed })   // → { el, destroy() } — el 을 사이드바에 붙인다
//   const hq = heritageQuiz(markers, { seed, onFocus })            // → { el, destroy() } — onFocus(marker): 문제를 낼 때(지도에서 그 핀 고르기 등)
//
// 색칠하기: 팔레트 색을 고르고 지도에서 나라를 누르면 그 색으로 칠한다(같은 색으로 다시 누르면 지움, 지우개). 17쪽 나라(46개)만 칠한다.
// 이름 맞히기: 무작위 나라 하나를 칠해 강조하고 그 둘레로 화면을 옮긴 뒤 보기 4개. 맞힌 수/푼 수.
import { geoArea, geoBounds, geoCentroid } from 'd3-geo';
import { h, icon } from '../shared/dom.js';
import { indexGeometry, clipIndexed } from './geoClip.js';
import { mulberry32, quizOptions, pickNext, shuffle, photoCropStyle } from './uiCore.js';
import { imageUrl } from './ui.js';
import { segButtons } from './seg.js';

export const PALETTE = ['#f4a3a8', '#f9c784', '#fbe79a', '#b8dea0', '#9ccbe8', '#c3b1e1'];
const TARGET = { fill: '#ff922b', stroke: '#c2410c' };

/**
 * 나라 칠하기 레이어. features = 바탕 지도 나라 Feature 들({properties:{iso, ko}}) — 상세도별로 줄 수 있다: { '50': [...], '10a': [...] }
 * (view.detail 이 '10a' 면 10a, 아니면 50). layer.paint(iso, color|null), layer.colorOf(iso), layer.setTarget(iso|null), layer.clear().
 * smallPx > 0 이면(유럽 27쪽 — 바티칸·모나코는 최대 확대에서도 1~8px) smallIsos 중 화면 크기가 smallPx 보다 작은 나라를 반지름
 * smallPx/2 + 3 의 동그라미로 덧그리고(칠한 색 / 문제 강조 주황 / 안 칠했으면 흰 바탕, 굵은 테 — 수도 기호 6px 네모보다 커서 그 밑에 묻히지
 * 않음), 그 동그라미를 누르면(반지름 + 3px) 그 나라로 맞힌다(layer.hit). 크기는 화면에 잘린 도형이 아니라 나라 전체의 경위도 상자를 투영해
 * 잰다(가장자리에 조금만 걸친 큰 나라에 동그라미가 생기지 않게). 경위도 상자·중심은 나라마다 한 번만 계산하고, 화면 크기가 작은 나라만 그린다.
 * 0(기본)이면 동그라미·hit 없음 — 아시아(u2) 그림·동작 그대로.
 * smallMetric 'area'(U4-3e, 아프리카 35쪽 — 단원 선택값): 상자 대신 「가장 큰 조각의 화면 넓이의 제곱근」으로 견준다. 감비아(가늘고 김)·
 * 세이셸·카보베르데·코모로(흩어진 섬)는 상자가 커서 상자 기준으로는 동그라미가 안 생기지만 손으로 칠할 수 없다. 조각 경위도 넓이·중심은
 * 한 번만 재고, 화면 넓이는 그 중심의 투영 국소 배율(경위도 0.1° 칸의 화면 넓이)로 어림. 동그라미 자리 = 가장 큰 조각 중심.
 * 없으면('box') 유럽(u3) 그대로.
 */
export function coloringLayer(features, { id = 'coloring', z = 12, alpha = 0.85, smallPx = 0, smallIsos = null, smallMetric = 'box' } = {}) {
  const sets = Array.isArray(features) ? { 50: features } : features;
  const byIso = {};
  for (const [lv, list] of Object.entries(sets)) {
    byIso[lv] = new Map();
    for (const f of list || []) if (f?.properties?.iso) byIso[lv].set(f.properties.iso, { f, idx: null });
  }
  const colors = new Map();
  let target = null;
  let marks = []; // 작은 나라 동그라미 화면 자리 [{iso, x, y}] — 마지막 draw 의 것(smallPx > 0 일 때만)
  const markR = smallPx / 2 + 3;
  const lonlatInfo = new Map(); // '<상세도>:<iso>' → { b: [[w, s], [e, n]], c: [lon, lat] } — 나라 전체(잘리기 전), 한 번만
  const geomOf = (iso, view) => {
    const lv = view?.detail === '10a' && byIso['10a']?.has(iso) ? '10a' : (byIso['50'] ? '50' : Object.keys(byIso)[0]);
    const it = byIso[lv]?.get(iso);
    if (!it) return null;
    it.idx ||= indexGeometry(it.f.geometry);
    return clipIndexed(it.idx, view?.geoRect ?? null);
  };
  const layer = {
    id, z,
    meta: { title: '색칠하기' },
    paint(iso, color) { if (color) colors.set(iso, color); else colors.delete(iso); },
    colorOf: (iso) => colors.get(iso) ?? null,
    get painted() { return new Map(colors); },
    setTarget(iso) { target = iso || null; },
    get target() { return target; },
    clear() { colors.clear(); target = null; },
    feature(iso) { return (byIso['50'] || Object.values(byIso)[0])?.get(iso)?.f ?? null; },
    draw(ctx, path, view) {
      ctx.globalAlpha = alpha;
      for (const [iso, c] of colors) {
        if (iso === target) continue;
        const g = geomOf(iso, view);
        if (!g) continue;
        ctx.beginPath(); path(g); ctx.fillStyle = c; ctx.fill();
      }
      if (target) {
        const g = geomOf(target, view);
        if (g) {
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); path(g); ctx.fillStyle = TARGET.fill; ctx.fill();
          ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = TARGET.stroke; ctx.stroke();
        }
      }
      if (smallPx > 0) drawSmall(ctx, path, view);
    },
  };
  if (smallPx > 0) {
    layer.hit = (xy) => {
      let best = null, bd = Infinity;
      for (const m of marks) {
        const d = Math.hypot(xy[0] - m.x, xy[1] - m.y);
        if (d <= markR + 3 && d < bd) { bd = d; best = m; }
      }
      return best ? layer.feature(best.iso) : null;
    };
  }
  return layer;

  /** 나라 전체 경위도 상자·중심(그 상세도 도형, 처음 한 번) — 중심이 안 나오면(넓이 없는 도형) 상자 가운데 */
  function infoOf(iso, view) {
    const lv = view?.detail === '10a' && byIso['10a']?.has(iso) ? '10a' : (byIso['50'] ? '50' : Object.keys(byIso)[0]);
    const key = `${lv}:${iso}`;
    if (lonlatInfo.has(key)) return lonlatInfo.get(key);
    const f = byIso[lv]?.get(iso)?.f;
    let v = null;
    if (f) {
      const b = geoBounds(f);
      let c = geoCentroid(f);
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
      v = { b, c };
      if (smallMetric === 'area') v.big = largestPart(f.geometry);
    }
    lonlatInfo.set(key, v);
    return v;
  }
  /** 작은 나라 동그라미(나라 전체 화면 크기 < smallPx) — 칠한 색·문제 강조 위에 덧그림, 자리는 hit 이 씀 */
  function drawSmall(ctx, path, view) {
    marks = [];
    const proj = path.projection?.();
    if (!proj) return;
    const W = view?.width ?? Infinity, H = view?.height ?? Infinity;
    for (const iso of smallIsos || [...(byIso['50']?.keys() || [])]) {
      const inf = infoOf(iso, view);
      if (!inf) continue;
      if (smallMetric === 'area') {
        const big = inf.big, px = big && areaPx(proj, big);
        if (px == null || px >= smallPx) continue;
        drawMark(ctx, iso, proj(big.c), W, H);
        continue;
      }
      const [[w, s0], [e, n]] = inf.b;
      if (e < w) continue; // 상자 기준: 날짜변경선을 넘는 나라(러시아 등)는 작은 나라가 아님
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
      for (const ll of [[w, s0], [e, s0], [e, n], [w, n], [(w + e) / 2, s0], [(w + e) / 2, n]]) {
        const q = proj(ll);
        if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) { ok = false; break; }
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
      if (!ok || Math.max(x1 - x0, y1 - y0) >= smallPx) continue;
      drawMark(ctx, iso, proj(inf.c), W, H);
    }
  }
  /** 동그라미 하나(화면 자리 q) — 화면 밖·투영 못 함이면 그리지 않음 */
  function drawMark(ctx, iso, q, W, H) {
    if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) return false;
    const [x, y] = q;
    if (x < -markR || y < -markR || x > W + markR || y > H + markR) return false; // 화면 밖
    marks.push({ iso, x, y });
    const isTarget = iso === target, c = colors.get(iso);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, markR, 0, 2 * Math.PI);
    ctx.fillStyle = isTarget ? TARGET.fill : c || 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.lineWidth = isTarget ? 2.5 : 2; ctx.strokeStyle = isTarget ? TARGET.stroke : '#4d4d4d'; ctx.stroke();
    return true;
  }
}

/** 나라 도형에서 가장 큰 조각(구면 넓이): {a(스테라디안), c(중심 경위도)} | null — smallMetric 'area' 가 한 번만 잰다 */
export function largestPart(geom) {
  const polys = geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null;
  for (const P of polys) {
    const g = { type: 'Polygon', coordinates: P }, a = geoArea(g);
    if (a > 2 * Math.PI) continue; // 감김이 뒤집힌 조각(지구 거의 전체)
    if (!best || a > best.a) best = { a, c: geoCentroid(g) };
  }
  return best && Number.isFinite(best.c[0]) ? best : null;
}

/** 조각 {a, c} 의 화면 넓이 제곱근(px): 중심에서 경위도 0.1° 칸을 투영한 넓이로 국소 배율을 재 a 를 화면 넓이로 바꿈. 투영 못 하면 null. */
export function areaPx(proj, { a, c }) {
  const d = 0.1, q0 = proj(c), q1 = proj([c[0] + d, c[1]]), q2 = proj([c[0], c[1] + d]);
  if (![q0, q1, q2].every((q) => q && Number.isFinite(q[0]) && Number.isFinite(q[1]))) return null;
  const cell = Math.abs((q1[0] - q0[0]) * (q2[1] - q0[1]) - (q1[1] - q0[1]) * (q2[0] - q0[0]));   // 화면 px²
  const sr = (d * Math.PI / 180) ** 2 * Math.cos((c[1] * Math.PI) / 180);                     // 같은 칸의 구면 넓이
  return Math.sqrt((a / sr) * cell);
}

/** 경위도 상자를 넓힌다(작은 나라도 둘레가 보이게) */
function expandBounds([[w, s0], [e, n]], pad) {
  const e1 = e < w ? e + 360 : e;
  return [w - pad, Math.max(-80, s0 - pad), e1 + pad, Math.min(84, n + pad)];
}

/**
 * 색칠하기 + 이름 맞히기. names = topics coloring.quiz.countries([{name, iso, capital, …}]).
 * map.on('click') 을 구독해 칠하고(바탕 지도 나라 맞히기 → properties.iso), destroy 에서 풀고 강조를 지운다.
 */
export function coloringQuiz(map, layer, names, { seed = Date.now() % 1e9, onScore = null } = {}) {
  const rand = mulberry32(seed);
  const known = new Map(names.map((n) => [n.iso, n]));
  let mode = 'paint', color = PALETTE[0], cur = null, answered = false;
  const score = { right: 0, total: 0 };
  const refresh = () => { if (!map.destroyed) map.refreshLayer(layer.id); };

  // 색칠하기 화면
  const swatches = [];
  const eraser = h('button', { class: 'ds-btn at-quiz-erase', type: 'button', 'aria-pressed': 'false', on: { click: () => pick(null) } }, '지우개');
  const pick = (c) => {
    color = c;
    swatches.forEach(([pc, b]) => b.setAttribute('aria-pressed', String(pc === c)));
    eraser.setAttribute('aria-pressed', String(c === null));
  };
  for (const c of PALETTE) {
    const b = h('button', { class: 'at-quiz-color', type: 'button', style: { background: c }, 'aria-label': `색 ${PALETTE.indexOf(c) + 1}`, title: '이 색으로 칠하기', on: { click: () => pick(c) } });
    swatches.push([c, b]);
  }
  const paintedOut = h('span', { class: 'at-quiz-score' });
  const updatePainted = () => { paintedOut.textContent = `칠한 나라 ${[...layer.painted.keys()].filter((k) => known.has(k)).length} / ${names.length}`; };
  const clearBtn = h('button', { class: 'ds-btn', type: 'button', on: { click: () => { for (const iso of known.keys()) layer.paint(iso, null); updatePainted(); refresh(); } } }, '모두 지우기');
  const paintPane = h('div', { class: 'at-quiz-pane' },
    h('p', { class: 'at-quiz-q' }, '색을 고르고 지도에서 나라를 눌러 칠해 보자.'),
    h('div', { class: 'at-quiz-palette', role: 'group', 'aria-label': '팔레트' }, swatches.map(([, b]) => b), eraser),
    h('div', { class: 'at-quiz-foot' }, paintedOut, clearBtn));
  pick(PALETTE[0]);
  updatePainted();

  // 이름 맞히기 화면
  const qText = h('p', { class: 'at-quiz-q' }, '주황색으로 칠한 나라의 이름은?');
  const opts = h('div', { class: 'at-quiz-opts' });
  const feedback = h('p', { class: 'at-quiz-feedback', role: 'status' });
  const scoreOut = h('span', { class: 'at-quiz-score' });
  const nextBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => ask() } }, icon('next'), '다음 문제');
  const namePane = h('div', { class: 'at-quiz-pane' }, qText, opts, feedback, h('div', { class: 'at-quiz-foot' }, scoreOut, nextBtn));
  namePane.hidden = true;
  const updateScore = () => { scoreOut.textContent = `맞힌 수 ${score.right} / ${score.total}`; onScore?.({ ...score }); };
  updateScore();

  function ask() {
    if (!names.length) { cur = null; opts.replaceChildren(); feedback.textContent = '문제로 낼 나라가 없습니다.'; return; } // 빈 목록 지킴
    cur = pickNext(names, rand, cur);
    answered = false;
    feedback.textContent = '';
    layer.setTarget(cur.iso);
    const f = layer.feature(cur.iso);
    if (f) map.fitBounds(expandBounds(geoBounds(f), 10), { ms: 600 });
    refresh();
    const choices = quizOptions(cur.name, names.map((n) => n.name), { n: 4, rand });
    opts.replaceChildren(...choices.map((c) => h('button', { class: 'ds-btn at-quiz-opt', type: 'button', 'data-v': c, on: { click: (e) => answer(c, e.currentTarget) } }, c)));
  }
  function answer(c, btn) {
    if (answered || !cur) return;
    answered = true;
    score.total++;
    const ok = c === cur.name;
    if (ok) score.right++;
    for (const b of opts.children) {
      const v = b.getAttribute('data-v');
      if (v === cur.name) b.classList.add('is-right');
      else if (b === btn) b.classList.add('is-wrong');
      b.disabled = true;
    }
    feedback.textContent = ok ? `정답! ${cur.name}의 수도는 ${cur.capital ?? '—'}이다.` : `아쉽다. 정답은 ${cur.name}(수도 ${cur.capital ?? '—'})이다.`;
    updateScore();
  }

  const modeSeg = segButtons([['paint', '색칠하기'], ['name', '이름 맞히기']], { onPick: (v) => setMode(v), label: '퀴즈 방식', current: mode });
  function setMode(m) {
    mode = m;
    modeSeg.set(m);
    paintPane.hidden = m !== 'paint';
    namePane.hidden = m !== 'name';
    if (m === 'name') ask();
    else { layer.setTarget(null); refresh(); }
  }
  const off = map.on('click', (e) => {
    if (mode !== 'paint') return;
    const iso = e.feature?.properties?.iso;
    if (!iso || !known.has(iso)) return;
    layer.paint(iso, color && layer.colorOf(iso) !== color ? color : null);
    updatePainted();
    refresh();
  });
  const el = h('section', { class: 'at-quiz', 'aria-label': '색칠하기 퀴즈' },
    modeSeg.el, paintPane, namePane);
  return {
    el,
    setMode,
    get score() { return { ...score }; },
    get current() { return cur; },
    answer: (name) => { const b = [...opts.children].find((x) => x.getAttribute('data-v') === name); answer(name, b); },
    destroy() { off(); layer.setTarget(null); refresh(); el.remove(); },
  };
}

/**
 * 퀴즈 사진: 교과서 사진에는 번호·유산 이름(01·09·11 은 「국가/관련 종교」 칸까지 — 11 은 답이 적혀 있음)이 박혀 있어
 * marker.quiz.photoCrop([x0, y0, x1, y1] 비율, C5 원본 topics.json)으로 그 띠를 뺀 부분만 CSS 로 보인다(사진 파일은 그대로 —
 * 상세 카드는 전체 사진). 캡션은 번호만(이름은 답한 뒤 feedback 과 함께).
 */
function quizPhoto(m) {
  const url = imageUrl(m.photo?.url);
  const fig = h('figure', { class: 'at-photo at-quiz-figure' });
  if (url) {
    const img = h('img', { class: 'at-photo-img', src: url, alt: '세계유산 사진(이름 부분은 가림)', on: { error: () => { fig.hidden = true; } } });
    const st = photoCropStyle(m.quiz?.photoCrop, m.photo?.width, m.photo?.height);
    if (st) {
      img.classList.add('at-quiz-crop-img');
      Object.assign(img.style, { width: `${st.width}%`, left: `${st.left}%`, top: `${st.top}%` });
      fig.append(h('div', { class: 'at-quiz-crop', style: { aspectRatio: `${st.aspect}` } }, img));
    } else fig.append(img);
  }
  const cap = h('figcaption', { class: 'at-photo-credit at-quiz-cap' }, `${m.photo?.pin ?? ''}`);
  fig.append(cap);
  return { fig, cap };
}

/**
 * 세계유산 퀴즈. markers = heritage 주제 마커(quiz: {country, religions}). 사진을 보고 나라 또는 종교를 고른다(보기 4개).
 * 종교가 여럿이면 「크리스트교, 이슬람교, 유대교」 처럼 묶음 하나가 정답이다. onFocus(marker) 는 문제를 낼 때마다 부른다.
 */
export function heritageQuiz(markers, { seed = Date.now() % 1e9, onFocus = null } = {}) {
  const rand = mulberry32(seed);
  const items = markers.filter((m) => m.quiz);
  const answerOf = (m, kind) => (kind === 'country' ? m.quiz.country : (m.quiz.religions || []).join(', '));
  let kind = 'country', order = shuffle(items, rand), k = -1, cur = null, answered = false, capEl = null; // capEl: 사진 캡션(답한 뒤 이름)
  const score = { right: 0, total: 0 };
  const photoBox = h('div', { class: 'at-quiz-photo' });
  const qText = h('p', { class: 'at-quiz-q' });
  const opts = h('div', { class: 'at-quiz-opts' });
  const feedback = h('p', { class: 'at-quiz-feedback', role: 'status' });
  const scoreOut = h('span', { class: 'at-quiz-score' });
  const nextBtn = h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => ask() } }, icon('next'), '다음 문제');
  const kindSeg = segButtons([['country', '어느 나라?'], ['religion', '어느 종교?']], { onPick: (v) => setKind(v), label: '묻는 것', current: kind });
  const updateScore = () => { scoreOut.textContent = `맞힌 수 ${score.right} / ${score.total}`; };
  function ask() {
    if (!order.length) { cur = null; opts.replaceChildren(); photoBox.replaceChildren(); feedback.textContent = '문제로 낼 세계유산이 없습니다.'; return; } // 빈 목록 지킴
    k = (k + 1) % order.length;
    if (k === 0 && cur) order = shuffle(items, rand);
    cur = order[k];
    answered = false;
    feedback.textContent = '';
    const ph = quizPhoto(cur);
    photoBox.replaceChildren(ph.fig);
    capEl = ph.cap;
    qText.textContent = kind === 'country' ? '이 세계유산이 있는 나라는?' : '이 세계유산과 관련된 종교는?';
    const ans = answerOf(cur, kind);
    const choices = quizOptions(ans, items.map((m) => answerOf(m, kind)), { n: 4, rand });
    opts.replaceChildren(...choices.map((c) => h('button', { class: 'ds-btn at-quiz-opt', type: 'button', 'data-v': c, on: { click: (e) => answer(c, e.currentTarget) } }, c)));
    onFocus?.(cur);
  }
  function answer(c, btn) {
    if (answered || !cur) return;
    answered = true;
    score.total++;
    const ans = answerOf(cur, kind);
    const ok = c === ans;
    if (ok) score.right++;
    for (const b of opts.children) {
      if (b.getAttribute('data-v') === ans) b.classList.add('is-right');
      else if (b === btn) b.classList.add('is-wrong');
      b.disabled = true;
    }
    feedback.textContent = `${ok ? '정답!' : '아쉽다.'} ${cur.title}: ${cur.quiz.country} · ${(cur.quiz.religions || []).join(', ')}`;
    if (capEl) capEl.textContent = `${cur.photo?.pin ?? ''} ${cur.title ?? ''}`.trim();
    updateScore();
  }
  function setKind(v) {
    kind = v;
    kindSeg.set(v);
    k = -1; cur = null; order = shuffle(items, rand);
    ask();
  }
  const el = h('section', { class: 'at-quiz', 'aria-label': '세계유산 퀴즈' },
    kindSeg.el,
    photoBox, qText, opts, feedback, h('div', { class: 'at-quiz-foot' }, scoreOut, nextBtn));
  updateScore();
  if (items.length) ask();
  return {
    el, setKind,
    get score() { return { ...score }; },
    get current() { return cur; },
    answer: (c) => { const b = [...opts.children].find((x) => x.getAttribute('data-v') === c); answer(c, b); },
    destroy() { el.remove(); },
  };
}

