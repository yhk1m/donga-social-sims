// © 2026 김용현
// src/atlas/hubData.js — 「사회과부도 모음」 카드 자료(순수 함수, DOM 없음). 조각(sims/atlas-hub)·Pages 보기 페이지(scripts/atlas/hub_page.mjs)·테스트가 같이 쓴다.
//   hubUnits({ sims, versions, topicsOf })  registry SIMS + docs/versions.json + 단원별 topics 제목 → 교과서 단원 순서 카드 목록
//   단원 = registry 에서 book 'atlas' 이고 unit 이 「Ⅱ. 아시아」처럼 로마 숫자로 시작하는 자료. 공개(versions.json 에 버전 있음)면 카드,
//   아직이면 ATLAS_PLAN(설계 문서 notes/specs/2026-10-20-atlas-phase2-design.md 의 단원 표)에서 「준비 중」 카드.
//   새 단원은 registry 한 줄 + 공개(release)만으로 나타난다 — 이 파일을 고칠 필요 없음.

/** 공개 Pages 주소(끝 / 포함) */
export const PAGES_BASE = 'https://yhk1m.github.io/donga-social-sims/';
/** 썸네일 자리(docs/assets/atlas/hub/<id>.webp, scripts/atlas/hub_thumbs.mjs 가 만든다) */
export const HUB_THUMB_DIR = 'assets/atlas/hub/';

/** 앞으로 만들 단원(설계 문서 §5) — 공개 전 「준비 중」 카드용. 공개되면 registry 값이 이긴다. */
export const ATLAS_PLAN = [
  { id: 'atlas-u1-world', unit: 'Ⅰ. 세계화 시대, 지리의 힘', pages: [8, 15] },
  { id: 'atlas-u2-asia', unit: 'Ⅱ. 아시아', pages: [16, 25] },
  { id: 'atlas-u3-europe', unit: 'Ⅲ. 유럽', pages: [26, 33] },
  { id: 'atlas-u4-africa', unit: 'Ⅳ. 아프리카', pages: [34, 39] },
  { id: 'atlas-u5-americas', unit: 'Ⅴ. 아메리카', pages: [40, 47] },
  { id: 'atlas-u6-oceania-polar', unit: 'Ⅵ. 오세아니아와 극지방', pages: [48, 55] },
];

const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';

/** 「Ⅱ. 아시아」 → { order: 2, numeral: 'Ⅱ', name: '아시아' } | null(로마 숫자 단원이 아님) */
export function parseUnit(unit) {
  const m = /^\s*([Ⅰ-Ⅻ])\s*\.?\s*(.*)$/.exec(unit || '');
  if (!m) return null;
  return { order: ROMAN.indexOf(m[1]) + 1, numeral: m[1], name: m[2].trim() };
}

/** topics [{title, pages}] → [첫 쪽, 끝 쪽] | null */
export function pageRange(topics) {
  const ps = (topics || []).flatMap((t) => t.pages || []).filter(Number.isFinite);
  return ps.length ? [Math.min(...ps), Math.max(...ps)] : null;
}

/** [16, 25] → '16~25쪽' */
export const pagesText = (r) => (r ? (r[0] === r[1] ? `${r[0]}쪽` : `${r[0]}~${r[1]}쪽`) : '');

/**
 * 카드 목록(교과서 단원 순서 Ⅰ, Ⅱ, …).
 * @param {object} o
 * @param {Array} o.sims       registry SIMS
 * @param {object} o.versions  docs/versions.json ({id: [{v, date, note}]})
 * @param {(id:string)=>Array|null} o.topicsOf  단원 topics [{title, pages}] (없으면 null)
 * @param {Array} [o.plan]     준비 중 단원 표(기본 ATLAS_PLAN, 빈 배열이면 준비 중 카드 없음)
 * @returns {Array<{id, order, numeral, name, label, pages, topics, latest, status, url, thumb}>}
 *   status 'published' = 공개(url·thumb·latest 있음), 'planned' = 준비 중(url·thumb·latest 는 null)
 */
export function hubUnits({ sims, versions = {}, topicsOf = () => null, plan = ATLAS_PLAN }) {
  const byOrder = new Map();
  for (const s of sims) {
    if (s.book !== 'atlas') continue;
    const u = parseUnit(s.unit);
    if (!u) continue;
    const vers = versions[s.id] || [];
    if (!vers.length) continue; // 공개 전 → 아래 준비 중 단계에서
    const topics = topicsOf(s.id) || [];
    const latest = vers.at(-1);
    byOrder.set(u.order, {
      id: s.id, ...u, label: `${u.numeral}. ${u.name}`,
      pages: pageRange(topics) || plan.find((p) => p.id === s.id)?.pages || (s.page ? [s.page, s.page] : null),
      topics: topics.map((t) => t.title),
      latest: { v: latest.v, date: latest.date },
      status: 'published',
      url: `${PAGES_BASE}${s.id}/`,
      thumb: `${PAGES_BASE}${HUB_THUMB_DIR}${s.id}.webp`,
    });
  }
  for (const p of plan) {
    const u = parseUnit(p.unit);
    if (!u || byOrder.has(u.order)) continue;
    byOrder.set(u.order, {
      id: p.id, ...u, label: `${u.numeral}. ${u.name}`, pages: p.pages || null, topics: [],
      latest: null, status: 'planned', url: null, thumb: null,
    });
  }
  return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

/** topics.json 전체 → 카드에 쓰는 몫만 [{title, pages}] (Vite 플러그인 ?titles·Node 스크립트가 같이 씀) */
export const topicTitles = (topics) => topics.map((t) => ({ title: t.title, pages: t.pages || [] }));

/**
 * 카드 하나의 모양(태그 나무) — 조각은 h()·icon() 으로, Pages 보기 페이지는 HTML 글로 그린다(같은 모양 한 곳에서).
 * 마디 = [tag, attrs, ...children] | 글 | ['@icon', 이름] | ['@img', attrs](불러오기 실패 → 자리 표시로 바꿈은 그리는 쪽에서).
 * @param u        hubUnits() 카드
 * @param o.href   공개 단원 링크(기본 u.url)
 * @param o.thumb  썸네일 주소(기본 u.thumb)
 * @param o.newTab true 면 새 창(target=_blank rel=noopener)
 * @param o.openText  열기 글(기본 '열기')
 */
export function cardTree(u, { href = u.url, thumb = u.thumb, newTab = false, openText = '열기' } = {}) {
  const planned = u.status !== 'published';
  const meta = [pagesText(u.pages), u.topics.length ? `주제 ${u.topics.length}개` : null, planned ? null : `${u.latest.date} 갱신`].filter(Boolean).join(' · ');
  const thumbNode = ['div', { class: 'ah-thumb' },
    planned
      ? ['div', { class: 'ah-ph' }, ['@icon', 'globe'], '준비 중']
      : ['@img', { class: 'ah-img', src: thumb, alt: `${u.label} 기본 화면`, loading: 'lazy', width: 640, height: 400 }],
    planned ? null : ['span', { class: 'ah-ver', title: `최신 버전 (${u.latest.date})` }, `v${u.latest.v}`],
  ];
  const body = ['div', { class: 'ah-body' },
    ['h2', { class: 'ah-name' }, ['span', { class: 'ah-numeral' }, `${u.numeral}.`], u.name],
    ['div', { class: 'ah-meta' }, meta],
    u.topics.length ? ['ul', { class: 'ah-topics', 'aria-label': '주제' }, ...u.topics.map((t) => ['li', { class: 'ah-topic' }, t])] : null,
    planned ? null : ['span', { class: 'ah-open' }, openText, ['@icon', newTab ? 'external' : 'next']],
  ];
  if (planned) return ['div', { class: 'ah-card is-planned', 'aria-disabled': 'true', dataset: { unit: u.id } }, thumbNode, body];
  return ['a', { class: 'ah-card is-link', href, ...(newTab ? { target: '_blank', rel: 'noopener' } : {}), dataset: { unit: u.id } }, thumbNode, body];
}
