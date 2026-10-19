// © 2026 김용현
// 초국적 기업의 발달 과정 — 시설·흐름·단계 자료.
// 교과서: 동아출판 중등 사회1(22개정) 94~96쪽. 기업은 가상의 'Z 기업'(스마트 기기 회사)이며,
// 시설 위치는 교과서 설명(공간적 분업)에 맞춰 고른 예시일 뿐 실제 기업의 시설이 아니다.

// 시설 종류: 이름, 테두리 색, 선 아이콘(24x24)
export const TYPES = {
  hq: { name: '본사', color: '#c92a2a', icon: [['path', { d: 'M4 21V10h16v11' }], ['path', { d: 'M2.5 21h19' }], ['path', { d: 'M12 10V3l5 2-5 2' }], ['path', { d: 'M8 14h2M14 14h2M8 17.5h2M14 17.5h2' }]] },
  sub: { name: '해외 자회사', color: '#1971c2', icon: [['rect', { x: 6, y: 3, width: 12, height: 18, rx: 1 }], ['path', { d: 'M3 21h18' }], ['path', { d: 'M10 7h4M10 11h4M10 15h4' }]] },
  lab: { name: '연구소', color: '#7048e8', icon: [['path', { d: 'M9 3h6' }], ['path', { d: 'M10 3v6l-5.4 9.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9V3' }], ['path', { d: 'M7.2 15h9.6' }]] },
  factory: { name: '생산 공장', color: '#b35c00', icon: [['path', { d: 'M3 21V11l6 3.5V11l6 3.5V4h5v17z' }], ['path', { d: 'M7 18h2M12 18h2' }]] },
  raw: { name: '원료 산지', color: '#5c940d', icon: [['path', { d: 'M2 20l7-12 4 6 2.5-3.5L22 20z' }], ['path', { d: 'M6.6 12.2 9 14l2-2' }]] },
  warehouse: { name: '물류 창고', color: '#0c8599', icon: [['path', { d: 'M3 21V9l9-5 9 5v12' }], ['path', { d: 'M7 21v-8h10v8' }], ['path', { d: 'M7 17h10' }]] },
  sales: { name: '판매 지사(영업 지점)', short: '판매 지사', color: '#2b8a3e', icon: [['path', { d: 'M5 8h14l-1 13H6z' }], ['path', { d: 'M9 8V6.5a3 3 0 0 1 6 0V8' }]] },
  call: { name: '고객 센터', color: '#c2255c', icon: [['path', { d: 'M4 15v-3a8 8 0 0 1 16 0v3' }], ['rect', { x: 3, y: 14, width: 4, height: 6, rx: 1.5 }], ['rect', { x: 17, y: 14, width: 4, height: 6, rx: 1.5 }], ['path', { d: 'M19 20c0 1.2-1.3 2-3 2h-3' }]] },
};

// 흐름 종류
export const KINDS = {
  part: { name: '원료·부품', color: '#e67700', dash: '' },
  product: { name: '제품', color: '#2f9e44', dash: '' },
  info: { name: '정보·자본', color: '#364fc7', dash: '5 4' },
};

// 시설: step = 처음 나타나는 단계, closed = 문을 닫는 단계, lp = 이름표 방향(r·l·t·b), why = 그곳에 둔 까닭(새로 생길 때 표시)
export const FACILITIES = [
  { id: 'hq', type: 'hq', place: '미국 서부', lon: -122, lat: 37.4, step: 1, lp: 'l', why: '의사 결정' },
  { id: 'usf', type: 'factory', place: '미국 오대호 연안', lon: -85.5, lat: 42.5, step: 1, closed: 8, lp: 't' },
  { id: 'ny', type: 'sales', name: '영업 지점', place: '미국 뉴욕', lon: -74, lat: 40.7, step: 1, lp: 'r' },

  { id: 'lon', type: 'sub', place: '영국 런던', lon: -0.1, lat: 51.5, step: 2, lp: 'r' },
  { id: 'seo', type: 'sub', place: '한국 서울', lon: 127, lat: 37.5, step: 2, lp: 't' },
  { id: 'sin', type: 'sub', place: '싱가포르', lon: 103.8, lat: 1.35, step: 2, lp: 'b' },
  { id: 'sao', type: 'sub', place: '브라질 상파울루', lon: -46.6, lat: -23.5, step: 2, lp: 'l' },
  { id: 'tyo', type: 'sales', name: '영업 지점', place: '일본 도쿄', lon: 139.7, lat: 35.7, step: 2, lp: 'r' },
  { id: 'del', type: 'sales', name: '영업 지점', place: '인도 델리', lon: 77.2, lat: 28.6, step: 2, lp: 't' },
  { id: 'syd', type: 'sales', name: '영업 지점', place: '오스트레일리아 시드니', lon: 151.2, lat: -33.9, step: 2, lp: 'r' },
  { id: 'jnb', type: 'sales', name: '영업 지점', place: '남아프리카 공화국', lon: 28, lat: -26.2, step: 2, lp: 'r' },

  { id: 'sea', type: 'lab', place: '미국 시애틀', lon: -122.3, lat: 47.6, step: 5, lp: 'l', why: '고급 인력이 풍부' },
  { id: 'blr', type: 'lab', place: '인도 벵갈루루', lon: 77.6, lat: 13, step: 5, lp: 'b', why: '고급 인력이 풍부' },

  { id: 'aus', type: 'raw', place: '오스트레일리아 서부', lon: 118, lat: -23, step: 6, lp: 'b', why: '광물 원료' },
  { id: 'chl', type: 'raw', place: '칠레', lon: -70.4, lat: -23.6, step: 6, lp: 'l', why: '광물 원료' },
  { id: 'cod', type: 'raw', place: '콩고 민주 공화국', lon: 25, lat: -5, step: 6, lp: 'r', why: '광물 원료' },
  { id: 'vnm', type: 'factory', place: '베트남', lon: 105.8, lat: 21, step: 6, lp: 't', why: '지가와 임금이 저렴' },
  { id: 'hun', type: 'factory', place: '헝가리', lon: 19, lat: 47.5, step: 6, lp: 'b', why: '유럽 시장 안(관세 피함)' },

  { id: 'mem', type: 'warehouse', place: '미국 멤피스', lon: -90, lat: 35.1, step: 7, lp: 't', why: '교통이 편리한 거점' },
  { id: 'pan', type: 'warehouse', place: '파나마', lon: -79.5, lat: 9, step: 7, lp: 'b', why: '교통이 편리한 거점' },
  { id: 'dxb', type: 'warehouse', place: '아랍 에미리트', lon: 55.3, lat: 25.2, step: 7, lp: 'b', why: '교통이 편리한 거점' },
  { id: 'mnl', type: 'call', place: '필리핀 마닐라', lon: 121, lat: 14.6, step: 7, lp: 'r', why: '시차·영어·낮은 임금' },
  { id: 'los', type: 'sales', place: '나이지리아', lon: 3.4, lat: 6.5, step: 7, lp: 'b', why: '새 판매 시장' },
  { id: 'bue', type: 'sales', place: '아르헨티나', lon: -58.4, lat: -34.6, step: 7, lp: 'b', why: '새 판매 시장' },

  { id: 'mex', type: 'factory', place: '멕시코 북부', lon: -100.3, lat: 25.7, step: 8, lp: 'l', why: '생산비 절감' },
];

// 흐름: from→to, kind, step = 처음 나타나는 단계, both = 양방향이 되는 단계, bend = 휘는 정도(+는 위쪽)
export const FLOWS = [
  { id: 'f1', from: 'hq', to: 'usf', kind: 'info', step: 1, bend: 0.25 },
  { id: 'f2', from: 'usf', to: 'ny', kind: 'product', step: 1, bend: 0.3 },

  { id: 'f3', from: 'hq', to: 'lon', kind: 'info', step: 2, both: 4, bend: 0.22 },
  { id: 'f4', from: 'hq', to: 'seo', kind: 'info', step: 2, both: 4, bend: 0.2 },
  { id: 'f5', from: 'hq', to: 'sin', kind: 'info', step: 2, both: 4, bend: 0.2 },
  { id: 'f6', from: 'hq', to: 'sao', kind: 'info', step: 2, both: 4, bend: 0.25 },
  { id: 'f7', from: 'usf', to: 'lon', kind: 'product', step: 2, bend: 0.14 },
  { id: 'f8', from: 'usf', to: 'seo', kind: 'product', step: 2, bend: 0.12 },
  { id: 'f9', from: 'usf', to: 'sin', kind: 'product', step: 2, bend: 0.1 },
  { id: 'f10', from: 'usf', to: 'sao', kind: 'product', step: 2, bend: -0.2 },
  { id: 'f11', from: 'seo', to: 'tyo', kind: 'product', step: 2, bend: 0.5 },
  { id: 'f12', from: 'sin', to: 'del', kind: 'product', step: 2, bend: 0.3 },
  { id: 'f13', from: 'sin', to: 'syd', kind: 'product', step: 2, bend: 0.25 },
  { id: 'f14', from: 'lon', to: 'jnb', kind: 'product', step: 2, bend: 0.2 },

  { id: 'f15', from: 'seo', to: 'sin', kind: 'info', step: 4, both: 4, bend: -0.25 },
  { id: 'f16', from: 'sin', to: 'lon', kind: 'info', step: 4, both: 4, bend: 0.2 },
  { id: 'f17', from: 'lon', to: 'seo', kind: 'info', step: 4, both: 4, bend: 0.15 },

  { id: 'f19', from: 'hq', to: 'sea', kind: 'info', step: 5, both: 5, bend: 0.5 },
  { id: 'f20', from: 'hq', to: 'blr', kind: 'info', step: 5, both: 5, bend: 0.18 },
  { id: 'f21', from: 'sea', to: 'seo', kind: 'info', step: 5, both: 5, bend: 0.15 },

  { id: 'f22', from: 'aus', to: 'vnm', kind: 'part', step: 6, bend: 0.2 },
  { id: 'f23', from: 'cod', to: 'hun', kind: 'part', step: 6, bend: 0.25 },
  { id: 'f24', from: 'chl', to: 'usf', kind: 'part', step: 6, bend: -0.2 },
  { id: 'f25', from: 'blr', to: 'vnm', kind: 'info', step: 6, bend: 0.3 },
  { id: 'f26', from: 'vnm', to: 'sin', kind: 'product', step: 6, bend: 0.3 },
  { id: 'f27', from: 'vnm', to: 'seo', kind: 'product', step: 6, bend: -0.3 },
  { id: 'f28', from: 'hun', to: 'lon', kind: 'product', step: 6, bend: 0.4 },

  { id: 'f29', from: 'vnm', to: 'mem', kind: 'product', step: 7, bend: 0.12 },
  { id: 'f30', from: 'vnm', to: 'pan', kind: 'product', step: 7, bend: -0.1 },
  { id: 'f31', from: 'vnm', to: 'dxb', kind: 'product', step: 7, bend: 0.25 },
  { id: 'f32', from: 'mem', to: 'ny', kind: 'product', step: 7, bend: -0.3 },
  { id: 'f33', from: 'pan', to: 'bue', kind: 'product', step: 7, bend: 0.25 },
  { id: 'f34', from: 'dxb', to: 'los', kind: 'product', step: 7, bend: 0.25 },
  { id: 'f35', from: 'dxb', to: 'del', kind: 'product', step: 7, bend: 0.4 },
  { id: 'f36', from: 'mnl', to: 'hq', kind: 'info', step: 7, both: 7, bend: 0.2 },

  { id: 'f37', from: 'chl', to: 'mex', kind: 'part', step: 8, bend: -0.25 },
  { id: 'f38', from: 'mex', to: 'mem', kind: 'product', step: 8, bend: 0.3 },
  { id: 'f39', from: 'mex', to: 'hq', kind: 'info', step: 8, bend: -0.3, note: '이윤' },
];

export const GROUPS = [
  { name: '초국적 기업의 성장 과정', page: 94, steps: [1, 2, 3, 4] },
  { name: '초국적 기업의 공간적 분업', page: 95, steps: [5, 6, 7] },
  { name: '초국적 기업이 가져온 지역 변화', page: 96, steps: [8] },
];

// 단계: quote = 교과서 문장 그대로, points = 지도 위 시설을 설명하는 짧은 글,
// active = 이 단계에서 다시 강조할 예전 흐름, callouts = 지도 위 말풍선, view = 'na'(북아메리카 확대) | 'world'
export const STEPS = [
  {
    n: 1, short: '국내에서 출발', title: '한 나라 안에서 출발해요', view: 'na', page: 94,
    quote: '미국에 본사를 세우고, 생산 시설과 영업 지점을 열었어요.',
    points: [
      ['hq', '본사', '회사의 중요한 일을 결정하는 곳이에요.'],
      ['factory', '생산 공장', '미국 안에서 제품을 만들어요.'],
      ['sales', '영업 지점', '만든 제품을 미국 안에서 팔아요. 아직은 모든 시설이 한 나라 안에 있어요.'],
    ],
  },
  {
    n: 2, short: '해외 판매 시장 확대', title: '세계 각지로 판매 시장을 넓혀요', view: 'world', page: 94,
    quote: '판매 시장을 넓히기 위해 세계 각지에 자회사와 영업 지점을 만들었어요.',
    points: [
      [null, '왜 가능해졌을까?', '교통·통신이 발달하고 세계 무역 기구(WTO)가 출범하면서 무역 장벽이 낮아졌어요.'],
      ['sub', '해외 자회사', '영국, 한국, 싱가포르, 브라질에 자회사를 세워요.'],
      ['sales', '영업 지점', '미국 공장에서 만든 제품을 세계 곳곳에서 팔아요.'],
    ],
  },
  {
    n: 3, short: '현지화', title: '현지에 맞춘 상품과 서비스를 내놓아요', view: 'world', page: 94,
    active: ['f11', 'f12', 'f13', 'f14'],
    callouts: [
      { at: 'seo', head: '현지화', text: '한국 전용 기능을 넣은 모델', dir: 't' },
      { at: 'sin', head: '현지화', text: '덥고 습한 기후에 맞춘 제품', dir: 'b' },
      { at: 'lon', head: '현지화', text: '유럽 여러 언어로 서비스', dir: 't' },
      { at: 'sao', head: '현지화', text: '포르투갈어 고객 서비스', dir: 'b' },
    ],
    quote: '의사 결정 권한을 갖게 된 해외 자회사는 현지화한 상품과 서비스를 제공해요.',
    points: [
      ['sub', '자회사가 직접 결정', '그 나라 사람들의 언어, 기후, 생활 방식에 맞추어 상품과 서비스를 바꿔요.'],
      [null, '교과서 95쪽 사례', 'B 커피 전문점은 제주 말차로 제주도 특화 메뉴를 만들었어요.'],
    ],
  },
  {
    n: 4, short: '수평적 연결', title: '본사와 자회사가 수평적으로 연결돼요', view: 'world', page: 94,
    callouts: [
      { at: 'seo', head: '전문 기능', text: '디스플레이 기술 개발', dir: 't' },
      { at: 'sin', head: '전문 기능', text: '아시아 지역 운영', dir: 'b' },
      { at: 'lon', head: '전문 기능', text: '유럽 마케팅', dir: 't' },
      { at: 'sao', head: '전문 기능', text: '남아메리카 시장 운영', dir: 'b' },
    ],
    quote: '전문화된 핵심 자산과 기능을 보유하게 된 해외 자회사는 본사와 동등한 지위를 갖게 되었어요.',
    points: [
      [null, '상호의존적', '본사와 해외 자회사가 전문화된 핵심 자산과 기능을 각자 가지고 서로 기대어 일해요.'],
      [null, '수평적 연결', '지시가 본사에서 자회사로만 가지 않아요. 자회사끼리도 정보와 자본을 주고받아요.'],
    ],
  },
  {
    n: 5, short: '본사와 연구소', title: '공간적 분업 ① 본사와 연구소', view: 'world', page: 95,
    callouts: [{ at: 'hq', head: '본사', text: '정보와 자본 확보에 유리', dir: 'b' }],
    quote: '주로 의사 결정을 내리는 본사는 정보와 자본 확보에 유리한 지역에 두며, 연구소는 지식과 기술을 갖춘 고급 인력이 풍부한 지역에 세운다.',
    points: [
      [null, '공간적 분업', '연구·개발·생산·판매 기능을 나누어, 각 기능을 잘 해낼 수 있는 서로 다른 지역에 두어요.'],
      ['lab', '연구소', '지식과 기술을 갖춘 고급 인력이 많은 도시에 세워요.'],
    ],
  },
  {
    n: 6, short: '원료 산지와 생산 공장', title: '공간적 분업 ② 원료 산지와 생산 공장', view: 'world', page: 95,
    quote: '생산 공장은 원료 산지 근처 또는 지가와 임금이 저렴해 생산 비용이 적게 드는 곳에 두는데, 관세와 같은 무역 장벽을 피하거나 판매 시장을 확보하기 위해 무역 장벽 내에 입지하기도 한다.',
    points: [
      ['factory', '베트남 공장', '땅값(지가)과 임금이 저렴해 생산 비용이 적게 들어요.'],
      ['factory', '헝가리 공장', '유럽 판매 시장 안에 있어 관세를 피하고 시장을 확보해요.'],
      ['raw', '원료 산지', '제품에 들어갈 광물 원료를 얻어 공장으로 보내요.'],
    ],
  },
  {
    n: 7, short: '물류·판매·고객 센터', title: '공간적 분업 ③ 물류 창고·판매 지사·고객 센터', view: 'world', page: 94,
    quote: '초국적 기업은 본사, 연구소와 같은 핵심 사업뿐만 아니라 원료 산지, 생산 공장, 물류 창고, 판매 지사, 고객 센터 등을 해외 여러 국가에서 운영하면서 전 세계를 대상으로 생산과 판매 활동을 하는 기업을 말한다.',
    points: [
      ['warehouse', '물류 창고', '교통이 편리한 곳에서 제품을 모았다가 각 시장으로 보내요.'],
      ['call', '고객 센터', '필리핀은 미국과 시차가 크고, 영어를 쓰며, 임금이 낮고 안정적이에요(교과서 96쪽).'],
      ['sales', '판매 지사', '전 세계를 대상으로 제품을 팔아요.'],
    ],
  },
  {
    n: 8, short: '재배치와 지역 변화', title: '공장이 옮겨 가면 지역이 달라져요', view: 'na', page: 96,
    callouts: [
      { at: 'usf', head: '공장이 빠져나간 지역', text: '산업 공동화 · 일자리 감소 · 지역 경제 침체', dir: 't', tone: 'bad' },
      { at: 'mex', head: '공장이 들어선 지역', text: '새 산업 단지 · 일자리 증가 · 관련 산업 발달', dir: 'b', tone: 'good' },
    ],
    quote: '초국적 기업이 기존의 생산 공장을 폐쇄하고 다른 지역에 새로운 생산 공장을 설립하면 생산 공장이 다른 지역으로 빠져나간 지역에서는 산업 공동화 현상이 나타난다.',
    points: [
      [null, '재배치', '생산비를 줄여 이윤을 높이려고 미국 공장을 닫고 멕시코에 새 공장을 세워요.'],
      ['factory', '들어선 지역의 그늘', '비슷한 제품을 만드는 국내 기업이 어려워지고, 이윤이 본사로 빠져나갈 수 있어요.'],
      [null, '교과서 96쪽 사례', 'C 자동차는 디트로이트의 생산 공장을 멕시코로 옮겼어요.'],
    ],
  },
];

export const DEFINITION = '본사, 연구소와 같은 핵심 사업뿐만 아니라 원료 산지, 생산 공장, 물류 창고, 판매 지사, 고객 센터 등을 해외 여러 국가에서 운영하면서 전 세계를 대상으로 생산과 판매 활동을 하는 기업';
