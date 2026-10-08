// 자료 하나 = mount(root) 하나. 규칙은 EMBED_RULES.md (innerHTML 금지, root 밖 DOM 접근 금지, fetch 금지 …)
import { createShell, addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';
import './style.css'; // 선택자는 모두 .ds-sim 으로 시작

export default function mount(root) {
  const { stage, panel } = createShell(root, '_template');
  stage.append(h('canvas', { class: 'ds-canvas' }));
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '값', h('output', { class: 'ds-out' }, '0')),
    h('input', { class: 'ds-range', type: 'range', min: 0, max: 100, value: 0 }),
  ));
  addBlock(panel, h('button', { class: 'ds-btn ds-primary', type: 'button', on: { click: () => {} } }, icon('play'), '재생'));
}
