// tests/atlas/hub.test.mjs — 사회과부도 모음(src/atlas/hubData.js · sims/atlas-hub · scripts/atlas/hub_page.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { SIMS } from '../../src/registry.js';
import { hubUnits, parseUnit, pageRange, pagesText, cardTree, resolveHubHash, ATLAS_PLAN, PAGES_BASE } from '../../src/atlas/hubData.js';
import { renderHubPage, readTopics, HUB_PAGE } from '../../scripts/atlas/hub_page.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const versions = JSON.parse(readFileSync(join(ROOT, 'docs', 'versions.json'), 'utf8'));
const atlasUnits = SIMS.filter((s) => s.book === 'atlas' && parseUnit(s.unit));

test('parseUnit·pageRange·pagesText', () => {
  assert.deepEqual(parseUnit('Ⅱ. 아시아'), { order: 2, numeral: 'Ⅱ', name: '아시아' });
  assert.deepEqual(parseUnit('Ⅵ. 오세아니아와 극지방'), { order: 6, numeral: 'Ⅵ', name: '오세아니아와 극지방' });
  assert.equal(parseUnit('모음'), null);
  assert.deepEqual(pageRange([{ pages: [16, 18, 19] }, { pages: [25] }, { pages: [17] }]), [16, 25]);
  assert.equal(pageRange([]), null);
  assert.equal(pagesText([16, 25]), '16~25쪽');
  assert.equal(pagesText([9, 9]), '9쪽');
});

test('hubUnits: 공개 카드 = registry 의 사회과부도 단원 중 공개한 것 전부, 교과서 단원 순서(Ⅰ, Ⅱ, …)', () => {
  const units = hubUnits({ sims: SIMS, versions, topicsOf: readTopics, plan: [] });
  const want = atlasUnits.filter((s) => versions[s.id]?.length)
    .sort((a, b) => parseUnit(a.unit).order - parseUnit(b.unit).order).map((s) => s.id);
  assert.ok(want.length >= 2);
  assert.deepEqual(units.map((u) => u.id), want);
  assert.ok(!units.some((u) => u.id === 'atlas-hub'), '모음 자신은 카드가 아님');
  for (const u of units) {
    assert.equal(u.status, 'published');
    assert.equal(u.url, `${PAGES_BASE}${u.id}/`);
    assert.equal(u.latest.v, versions[u.id].at(-1).v);
    assert.ok(u.topics.length > 0, `${u.id} 주제 제목`);
  }
});

test('hubUnits: 아시아 카드 — 16~25쪽, 주제 8개 제목, 최신 버전', () => {
  const asia = hubUnits({ sims: SIMS, versions, topicsOf: readTopics }).find((u) => u.id === 'atlas-u2-asia');
  assert.equal(asia.label, 'Ⅱ. 아시아');
  assert.deepEqual(asia.pages, [16, 25]);
  assert.equal(asia.topics[0], '일반도');
  assert.equal(asia.topics.length, 8);
});

test('hubUnits: 준비 중 카드로 Ⅰ~Ⅵ 빈자리를 채우고 겹치지 않음, 공개 전 registry 단원도 준비 중', () => {
  const units = hubUnits({ sims: SIMS, versions, topicsOf: readTopics });
  assert.deepEqual(units.map((u) => u.order), [1, 2, 3, 4, 5, 6]);
  for (const u of units.filter((x) => x.status === 'planned')) assert.equal(u.url, null);
  const sims = [...SIMS, { id: 'atlas-u5-americas', book: 'atlas', unit: 'Ⅴ. 아메리카', page: 40, title: '사회과부도 아메리카' }];
  assert.equal(hubUnits({ sims, versions }).find((u) => u.order === 5).status, 'planned');
  const v2 = { ...versions, 'atlas-u5-americas': [{ v: 1, date: '2026-11-01' }] };
  const am = hubUnits({ sims, versions: v2 }).find((u) => u.order === 5);
  assert.equal(am.status, 'published');
  assert.deepEqual(am.pages, ATLAS_PLAN.find((p) => p.id === 'atlas-u5-americas').pages, 'topics 없으면 계획 쪽수');
});

test('사회과부도 단원은 조각이 주울 수 있는 자리(sims/atlas-u*/data/topics.json)에 있고 썸네일이 있음', () => {
  for (const s of atlasUnits) {
    assert.match(s.id, /^atlas-u/, `${s.id}: sims/atlas-hub/main.js 의 glob 은 atlas-u* 만 줍는다`);
    assert.ok(existsSync(join(ROOT, 'sims', s.id, 'data', 'topics.json')), `${s.id} topics.json`);
    if (versions[s.id]?.length) {
      assert.ok(existsSync(join(ROOT, 'docs', 'assets', 'atlas', 'hub', `${s.id}.webp`)), `${s.id} 썸네일 — node scripts/atlas/hub_thumbs.mjs ${s.id}`);
    }
  }
});

test('cardTree: 공개 카드는 새 창 링크, 준비 중은 링크 없음', () => {
  const units = hubUnits({ sims: SIMS, versions, topicsOf: readTopics });
  const pub = cardTree(units.find((u) => u.status === 'published'), { newTab: true });
  assert.equal(pub[0], 'a');
  assert.equal(pub[1].target, '_blank');
  assert.equal(pub[1].rel, 'noopener');
  const plan = cardTree(units.find((u) => u.status === 'planned'));
  assert.equal(plan[0], 'div');
  assert.equal(plan[1].href, undefined);
});

test('docs/atlas/index.html 이 최신(아니면 node scripts/atlas/hub_page.mjs)', () => {
  const page = renderHubPage({ versions });
  assert.equal(readFileSync(HUB_PAGE, 'utf8'), page);
  for (const id of hubUnits({ sims: SIMS, versions, plan: [] }).map((u) => u.id)) assert.ok(page.includes(`href="#${id}"`));
  assert.ok(readFileSync(join(ROOT, 'docs', 'index.html'), 'utf8').includes('href="./atlas/"'), '목록 페이지에 모음 링크');
});

test('resolveHubHash: 공개 단원만, 객체 키·깨진 %-부호·빈 주소는 모음(null)', () => {
  const ids = ['atlas-u2-asia', 'atlas-u3-europe'];
  assert.equal(resolveHubHash('#atlas-u3-europe', ids), 'atlas-u3-europe');
  assert.equal(resolveHubHash('atlas-u2-asia', ids), 'atlas-u2-asia');
  assert.equal(resolveHubHash('#atlas-u4-africa', ids), null);
  for (const h of ['#constructor', '#__proto__', '#toString', '#hasOwnProperty']) assert.equal(resolveHubHash(h, ids), null, h);
  assert.equal(resolveHubHash('#%E0%A4%A', ids), null);
  assert.equal(resolveHubHash('#%', ids), null);
  assert.equal(resolveHubHash('', ids), null);
  assert.equal(resolveHubHash(undefined, ids), null);
});

test('보기 페이지 스크립트가 resolveHubHash 원문을 쓰고 단원 표를 직접 열지 않음', () => {
  const page = readFileSync(HUB_PAGE, 'utf8');
  assert.ok(page.includes(resolveHubHash.toString()));
  assert.ok(!page.includes('decodeURIComponent(location.hash'));
});

test('조각 atlas-hub 가 빌드되고 규칙 검사를 통과함', { timeout: 120000 }, () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-embed.mjs'), 'atlas-hub'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(out.includes('[atlas-hub] 통과'), out);
  const html = readFileSync(join(ROOT, 'embed', 'atlas-hub.html'), 'utf8');
  assert.ok(html.startsWith('<div class="ds-atlas-hub">'));
  assert.ok(html.includes('사회과부도 모음'));
});
