// © 2026 김용현
// 자료 공통 셸. 규칙(EMBED_RULES.md)에 맞게 래퍼 div 안에서만 DOM 을 만든다.
//
// 각 자료(sims/<id>/main.js)는 이렇게 생긴 함수 하나를 default export 한다:
//   import { createShell } from '../../src/shared/shell.js';
//   export default function mount(root) {
//     const { stage, panel } = createShell(root, '<id>');
//     ... stage 에 캔버스/SVG, panel 에 조작 부품(h() 로 생성)
//   }
// root 는 래퍼 div(개발 미리보기에선 .ds-sim, 배포 조각에선 .ds-<id>). querySelector 는 root/stage/panel 에서만 쓴다(document.querySelector 금지).
import './theme.css';
import { SIMS, BOOKS } from '../registry.js';
import { h } from './dom.js';

export function createShell(root, id) {
  const meta = SIMS.find((x) => x.id === id);
  const book = BOOKS.find((b) => b.id === meta?.book);
  const stage = h('div', { class: 'ds-stage' });
  const panel = h('aside', { class: 'ds-panel' },
    h('div', { class: 'ds-head ds-block' },
      h('h1', { class: 'ds-title' }, meta?.title ?? id),
      h('span', { class: 'ds-src' }, `${book?.title ?? ''} ${meta?.unit ?? ''}${meta?.page ? ` · ${meta.page}쪽` : ''}`),
    ),
  );
  // replaceChildren 금지: 래퍼 안의 <style>·<script> 가 지워진다
  root.append(stage, panel);
  return { stage, panel, meta };
}

/** 사이드바에 블록 추가 (납작해지지 않도록 ds-block 클래스를 붙인다) */
export function addBlock(panel, el) {
  el.classList.add('ds-block');
  panel.append(el);
  return el;
}
