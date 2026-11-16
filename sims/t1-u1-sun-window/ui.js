// © 2026 김용현
// 우리 집 창은 어느 쪽? 화면 부품(무대 위 덧그림 + 사이드바)을 h() 로 만든다. 값 바꾸기와 이벤트는 main.js 가 맡는다.
import { addBlock } from '../../src/shared/shell.js';
import { h, icon } from '../../src/shared/dom.js';

function seg(key, items) {
  return h('div', { class: 'ds-seg' },
    items.map(([value, label]) => h('button', {
      class: 'ds-seg-btn', type: 'button', dataset: { [key]: String(value) }, 'aria-pressed': 'false',
    }, label)));
}

export function buildUI(stage, panel) {
  stage.classList.add('sw-stage');

  // ---- 무대 위 ----
  const status = h('div', { class: 'sw-status', role: 'status' });
  const loading = h('div', { class: 'sw-loading' }, '지형 자료를 불러오는 중입니다');
  const attrib = h('div', { class: 'sw-attrib' },
    '지도 자료 © OpenStreetMap contributors (ODbL)',
    h('br', {}),
    '고도 LINZ 8m DEM (CC BY 4.0), AWS Terrain Tiles');
  const legend = h('div', { class: 'sw-legend3d' },
    h('span', { class: 'sw-lg' }, h('i', { class: 'sw-lg-line sw-lg-path' }), '오늘 해가 지나는 길'),
    h('span', { class: 'sw-lg' }, h('i', { class: 'sw-lg-line sw-lg-hidden' }), '산에 가려 안 보이는 부분'),
    h('span', { class: 'sw-lg' }, h('i', { class: 'sw-lg-line sw-lg-ridge' }), '산이 하늘을 가리는 높이'),
    h('span', { class: 'sw-lg' }, h('i', { class: 'sw-lg-box' }), '창으로 든 햇빛'));
  stage.append(
    h('div', { class: 'sw-hint' }, '드래그: 돌려 보기, 휠: 확대, 오른쪽 드래그: 옮기기'),
    status, loading, legend, attrib,
  );

  // ---- 사이드바 ----
  const dateOut = h('output', { class: 'ds-out' }, '');
  const dateInput = h('input', { class: 'ds-range', type: 'range', min: 1, max: 365, step: 1, value: 172, 'aria-label': '날짜' });
  const monthTicks = h('div', { class: 'sw-ticks', 'aria-hidden': 'true' },
    [1, 3, 5, 7, 9, 11].map((m) => h('span', { class: 'sw-tick' }, `${m}월`)));
  const dateSeg = seg('preset', [['jun', '하지 (6월)'], ['dec', '동지 (12월)'], ['equinox', '춘분 추분']]);
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, '날짜', dateOut), dateInput, monthTicks, dateSeg));

  const timeOut = h('output', { class: 'ds-out' }, '');
  const timeInput = h('input', { class: 'ds-range', type: 'range', min: 0, max: 1435, step: 5, value: 720, 'aria-label': '시각' });
  const playBtn = h('button', { class: 'ds-btn sw-play', type: 'button', 'aria-label': '하루 흐름 재생' }, icon('play'), '재생');
  const timeLabel = h('span', {}, '시각');
  const dayBar = h('svg', { class: 'sw-daybar', viewBox: '0 0 240 26', preserveAspectRatio: 'none', role: 'img', 'aria-label': '하루 중 해가 드는 때' });
  addBlock(panel, h('div', { class: 'ds-ctl' },
    h('label', { class: 'ds-label' }, timeLabel, timeOut),
    h('div', { class: 'sw-time-row' }, timeInput, playBtn),
    dayBar,
    h('div', { class: 'sw-legend' },
      h('span', { class: 'sw-key sw-key-day' }), '해가 뜬 때',
      h('span', { class: 'sw-key sw-key-lit' }), '창으로 해가 드는 때')));

  const faceSeg = seg('face', [['north', '북향 창'], ['south', '남향 창']]);
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '창 방향 (오두막을 돌림)'), faceSeg));

  const homeBtn = h('button', { class: 'ds-btn sw-home', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'sw-switch', 'aria-hidden': 'true' }), '이주민 고향 광둥(북위 23°)의 해였다면');
  addBlock(panel, homeBtn);

  // 결과
  const hoursBig = h('b', { class: 'sw-hours-v' }, '');
  const hoursSpan = h('span', { class: 'sw-hours-span' }, '');
  const nowText = h('p', { class: 'sw-now' }, '');
  const sunAlt = h('dd', { class: 'ds-stat-v' }, '');
  const sunDir = h('dd', { class: 'ds-stat-v' }, '');
  addBlock(panel, h('section', { class: 'sw-result' },
    h('p', { class: 'sw-hours' }, h('span', { class: 'sw-hours-k' }, '오늘 이 창으로 해가 드는 시간'), hoursBig, hoursSpan),
    nowText,
    h('dl', { class: 'ds-stat' },
      h('dt', { class: 'ds-stat-k' }, '해의 높이'), sunAlt,
      h('dt', { class: 'ds-stat-k' }, '해가 있는 쪽'), sunDir)));

  const viewSeg = seg('view', [['village', '마을 전체'], ['hut', '오두막'], ['room', '방 안']]);
  const roofBtn = h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', class: 'sw-roof', checked: true }), '지붕 걷어 방 안 보기');
  addBlock(panel, h('div', { class: 'ds-ctl' }, h('span', { class: 'ds-label' }, '시점'), viewSeg, roofBtn));

  const explain = addBlock(panel, h('p', { class: 'ds-note sw-note' }));
  addBlock(panel, h('p', { class: 'ds-note sw-note' },
    '사금을 캐러 애로타운에 온 중국인 이주민들은 고향(북반구)에서처럼 햇볕이 오래 들도록 창을 남쪽으로 냈습니다. 그런데 남반구에서는 해가 북쪽 하늘로 지나가서 남향 창으로는 햇볕이 들지 않았고, 찬 바람까지 들어오자 나무로 덧대어 창을 막아 버렸습니다.'));

  addBlock(panel, h('section', { class: 'sw-src' },
    h('h2', { class: 'ds-h2' }, '자료 출처'),
    h('ul', { class: 'sw-src-list' },
      h('li', {}, '건물, 길, 하천, 숲: © OpenStreetMap contributors (ODbL 1.0), 2026년 11월 받음'),
      h('li', {}, '고도: LINZ(뉴질랜드 토지정보청) 8m DEM (CC BY 4.0), AWS Terrain Tiles(terrarium)로 받음'),
      h('li', {}, '해의 위치: NOAA 태양 계산식(적위, 균시차)'),
      h('li', {}, '오두막: 교과서 사진을 참고한 모형(크기는 모형 수치), 장소는 애로타운 중국인 거주지(남위 44.94°, 동경 168.83°). 모형이 잘 보이도록 둘레 30m 안의 실제 건물과 나무는 빼고 그렸습니다.'),
      h('li', {}, '시각: 뉴질랜드 표준시(UTC+12), 광둥은 중국 표준시(UTC+8), 일광 절약 시간은 넣지 않음'))));

  return {
    status, loading, dateOut, dateInput, dateSeg, timeOut, timeInput, timeLabel, playBtn, dayBar, faceSeg, homeBtn,
    hoursBig, hoursSpan, nowText, sunAlt, sunDir, viewSeg, roofInput: roofBtn.querySelector('.sw-roof'), explain,
  };
}
