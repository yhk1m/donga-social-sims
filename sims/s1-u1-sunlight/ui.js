// © 2026 김용현
// 위도별 태양 에너지 — 화면 부품(무대 위 덧그림 + 사이드바)을 h() 로 만든다.
// 돌려주는 객체의 각 요소는 main.js 가 값을 바꾸거나 이벤트를 단다(래퍼 밖 DOM 은 건드리지 않음).
import { addBlock } from '../../src/shared/shell.js';
import { h } from '../../src/shared/dom.js';

function seg(key, items) {
  return h('div', { class: 'ds-seg' },
    items.map(([value, label]) => h('button', {
      class: 'ds-seg-btn', type: 'button', dataset: { [key]: String(value) }, 'aria-pressed': 'false',
    }, label)));
}

export function buildUI(stage, panel) {
  stage.classList.add('sun-stage');

  // ---- 무대 위 덧그림 ----
  const insetSvg = h('svg', { class: 'sun-inset-svg', viewBox: '0 0 280 236', role: 'img', 'aria-label': '옆에서 본 단면 그림' });
  const inset = h('figure', { class: 'sun-inset' },
    h('figcaption', { class: 'sun-inset-cap' }, '옆에서 본 단면'),
    insetSvg);
  stage.append(
    h('div', { class: 'sun-hint' }, '드래그: 돌려 보기 · 휠/두 손가락: 확대'),
    inset,
  );

  // ---- 사이드바 ----
  const modeSeg = seg('mode', [['single', '레이저 한 줄기'], ['compare', '세 위도 비교']]);
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '보기'), modeSeg));

  const latOut = h('output', { class: 'ds-out' }, '0°');
  const latInput = h('input', {
    class: 'ds-range sun-range', type: 'range', min: 0, max: 90, step: 1, value: 0, 'aria-label': '레이저를 겨눌 위도',
  });
  const quickSeg = seg('lat', [[0, '저위도 0°'], [30, '중위도 30°'], [60, '고위도 60°']]);
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '레이저를 겨눌 위도', latOut),
    latInput, quickSeg));

  const viewSeg = seg('view', [['free', '자유 회전'], ['laser', '레이저 시점'], ['ground', '지표 위']]);
  const insetBtn = h('button', { class: 'ds-btn sun-inset-btn', type: 'button', 'aria-pressed': 'true' }, '옆에서 본 단면 그림 숨기기');
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '시점'), viewSeg, insetBtn));

  const stat = (k) => {
    const v = h('dd', { class: 'ds-stat-v' }, '');
    return [v, [h('dt', { class: 'ds-stat-k' }, k), v]];
  };
  const [sLat, rowLat] = stat('위도');
  const [sAlt, rowAlt] = stat('태양 고도(입사각)');
  const [sArea, rowArea] = stat('빛이 닿는 면적 (적도 대비)');
  const [sEnergy, rowEnergy] = stat('단위 면적당 에너지 (적도 = 100%)');
  const sBar = h('span', { class: 'sun-meter-bar' });
  const fpSvg = h('svg', { class: 'sun-fp-svg', viewBox: '0 0 120 120', role: 'img', 'aria-label': '지표 위에서 내려다본 빛 자국' });
  const singleStats = addBlock(panel, h('section', { class: 'sun-stats' },
    h('h2', { class: 'ds-h2' }, '빛 자국 재기'),
    h('dl', { class: 'ds-stat' }, rowLat, rowAlt, rowArea, rowEnergy),
    h('div', { class: 'sun-meter', 'aria-hidden': 'true' }, sBar),
    h('div', { class: 'sun-fp' },
      fpSvg,
      h('p', { class: 'sun-fp-text' }, '지표 위에서 내려다본 빛 자국',
        h('span', { class: 'sun-muted' }, '점선 원 = 적도(0°)의 빛 자국'))),
  ));

  const cmpBody = h('tbody', {});
  const th = (t) => h('th', { class: 'sun-cmp-th', scope: 'col' }, t);
  const compareStats = addBlock(panel, h('section', { class: 'sun-stats', hidden: true },
    h('h2', { class: 'ds-h2' }, '세 위도 비교'),
    h('table', { class: 'sun-cmp' },
      h('thead', {}, h('tr', {}, th(''), th('태양 고도'), th('면적'), th('에너지'))),
      cmpBody),
  ));

  const explain = addBlock(panel, h('p', { class: 'ds-note sun-note' }));
  addBlock(panel, h('p', { class: 'ds-note sun-note' },
    '춘분·추분처럼 태양이 적도 바로 위에 있다고 가정했습니다. 태양은 아주 멀리 있어 햇빛이 나란히 들어오므로, 굵기가 일정한 레이저 한 줄기로 나타냈습니다. 레이저 한 줄기가 지니는 에너지는 어느 위도에서나 같습니다.'));

  return {
    inset, insetSvg, insetBtn, modeSeg, quickSeg, viewSeg, latOut, latInput,
    singleStats, compareStats, sLat, sAlt, sArea, sEnergy, sBar, fpSvg, cmpBody, explain,
  };
}
