// © 2026 김용현
// 동아 디자인 공통 화면 블록: 화면 밝기(자동, 밝게, 어둡게) + 칠판 모드.
// 이 파일과 donga.css 를 import 한 자료만 바뀐다.
//   import '../../src/shared/donga.css';
//   import { addViewBlock } from '../../src/shared/dongaUi.js';
//   addViewBlock(panel, root, { onBoard: (k) => redraw() });
// 고른 값은 저장하지 않는다(두클래스 저장 규칙). 칠판 모드 배율 --bk 는 화면 높이 1080px 에서 약 2.15.
import { h } from './dom.js';
import { addBlock } from './shell.js';

const BASE_K = 2.15;

/** 지금 칠판 모드 배율 (꺼져 있으면 1) */
export function boardK(root) {
  return root.getAttribute('data-board') === 'on' ? Number(root.style.getPropertyValue('--bk')) || 1 : 1;
}

export function addViewBlock(panel, root, { onBoard, onTheme } = {}) {
  let theme = 'auto';
  const themeBtns = [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']].map(([v, label]) =>
    h('button', {
      type: 'button', class: 'ds-seg-btn', 'aria-pressed': String(v === theme),
      on: {
        click: () => {
          theme = v;
          if (v === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
          themeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === ['auto', 'light', 'dark'].indexOf(v))));
          if (onTheme) onTheme(v);
        },
      },
    }, label));

  const state = h('span', { class: 'dg-board-state' }, '꺼짐');
  const boardBtn = h('button', {
    type: 'button', class: 'dg-board', 'aria-pressed': 'false',
    on: { click: () => setBoard(root.getAttribute('data-board') !== 'on') },
  }, h('span', {}, '칠판 모드'), state);

  function fitK() {
    const k = Math.max(1.4, Math.min(3, (root.clientHeight || window.innerHeight) / 1080 * BASE_K));
    root.style.setProperty('--bk', k.toFixed(3));
    // 사이드바 배율: 무대의 절반쯤만 키운다(2.15 → 약 1.5). 칠판에서 지도가 넓게 남는다
    root.style.setProperty('--bkp', (1 + (k - 1) * 0.45).toFixed(3));
    return k;
  }
  function setBoard(on) {
    if (on) { root.setAttribute('data-board', 'on'); fitK(); } else { root.removeAttribute('data-board'); root.style.setProperty('--bk', '1'); root.style.setProperty('--bkp', '1'); }
    boardBtn.setAttribute('aria-pressed', String(on));
    state.textContent = on ? '켜짐' : '꺼짐';
    if (onBoard) onBoard(boardK(root));
  }
  // 창 크기가 바뀌면 배율을 다시 잡는다 (window 대신 래퍼를 지켜본다)
  let lastH = 0;
  new ResizeObserver(() => {
    const hgt = root.clientHeight;
    if (hgt === lastH) return;
    lastH = hgt;
    if (root.getAttribute('data-board') !== 'on') return;
    fitK();
    if (onBoard) onBoard(boardK(root));
  }).observe(root);

  const block = h('div', { class: 'dg-view' },
    h('h2', { class: 'ds-h2' }, '화면'),
    h('div', { class: 'ds-seg', role: 'group', 'aria-label': '화면 밝기' }, themeBtns),
    h('div', { class: 'dg-board-row' }, boardBtn));
  addBlock(panel, block);
  return { block, setBoard };
}
