// © 2026 김용현
// 사회과부도 모음 — 공개한 사회과부도 단원(registry 의 book 'atlas' 로마 숫자 단원)을 카드로 모아 각 단원 최신 Pages 페이지(/<id>/)로 연결.
// 자료는 모두 빌드 때 정적으로 들어간다(규칙: fetch·import() 없음): registry + docs/versions.json + 단원별 topics.json 제목(?titles 플러그인으로 제목·쪽만).
// 새 단원은 registry 한 줄 + 공개(release) 뒤 이 조각을 다시 빌드·공개하면 나타난다(이 파일은 고칠 필요 없음 — glob 이 sims/atlas-u*/ 를 모두 줍는다).
// 규칙(EMBED_RULES.md): DOM 은 h()/icon() 으로만, 래퍼 밖 접근 없음, 썸네일은 공개 Pages 절대 주소 <img>(아틀라스 사진과 같은 예외).
import { h, icon } from '../../src/shared/dom.js';
import { SIMS } from '../../src/registry.js';
import { hubUnits, cardTree, PAGES_BASE } from '../../src/atlas/hubData.js';
import versions from '../../docs/versions.json';
import './style.css';

// { '../atlas-u2-asia/data/topics.json': [{title, pages}], … }
const TOPICS = import.meta.glob('../atlas-u*/data/topics.json', { eager: true, query: '?titles', import: 'default' });
const topicsOf = (id) => TOPICS[`../${id}/data/topics.json`] || null;

/** 개발 서버에서는 아직 안 올린 썸네일을 저장소 docs/assets 에서(조각 빌드에서는 DEV 가 false 로 접혀 없어짐) */
const devAsset = (u) => (u && import.meta.env?.DEV && u.startsWith(`${PAGES_BASE}assets/`) ? `/docs/${u.slice(PAGES_BASE.length)}` : u);

/** cardTree 마디 → DOM */
function render(node) {
  if (node == null || node === false) return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const [tag, attrs, ...kids] = node;
  if (tag === '@icon') return icon(attrs);
  if (tag === '@img') {
    const img = h('img', { ...attrs, src: devAsset(attrs.src) });
    // 썸네일을 못 불러오면 자리 표시로(빈 상자 대신)
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'ah-ph' }, icon('globe'), '그림 없음')), { once: true });
    return img;
  }
  return h(tag, attrs, ...kids.map(render));
}

export default function mount(root) {
  root.classList.add('ah-root');
  const units = hubUnits({ sims: SIMS, versions, topicsOf });
  const published = units.filter((u) => u.status === 'published');
  const wrap = h('div', { class: 'ah-wrap' },
    h('header', { class: 'ah-top' },
      h('div', {},
        h('h1', { class: 'ah-h1' }, '사회과부도 모음'),
        h('p', { class: 'ah-lead' }, '중학 사회과 부도 단원별 인터랙티브 지도 · 카드를 누르면 그 단원의 최신 버전이 새 창에서 열립니다.'),
      ),
      h('span', { class: 'ah-count' }, `공개 ${published.length}개 단원 / ${units.length}개`),
    ),
    h('ul', { class: 'ah-grid' }, units.map((u) => h('li', { class: 'ah-cell' }, render(cardTree(u, { newTab: true, openText: '새 창에서 열기' }))))),
  );
  root.append(wrap);
  root.atlasHubUnits = units; // 확인용(헤드리스 캡처)
  return { units };
}
