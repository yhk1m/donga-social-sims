// tests/atlas/unitContract.test.mjs — 단원 공통 계약(2단계 G5): scripts/atlas/units.json 의 단원 중 생성물(sims/<sim>/data/topics.json)이
// 있는 것마다 같은 검사. 단원 고유 기대값은 단원 설정(content.expect·schema·pages)에서만 읽는다. 지금 u2 테스트(content·places·layers …)는
// 그대로 둔다(회귀 보호) — 겹치는 검사가 있어도 이것은 새 단원이 처음부터 같은 틀을 지키게 하는 몫.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadUnits, resolveUnit } from '../../scripts/atlas/unit.mjs';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const MAX_EMBED = 3 * 1024 * 1024;              // 조각 상한 3MB(사진은 공개 Pages 주소라 빼고) — 2단계 설계 §2
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const blank = (v) => v == null || (typeof v === 'string' && !v.trim());

const units = Object.keys(loadUnits())
  .map((id) => resolveUnit(['--unit', id], process.env))
  .filter((u) => u.hasConfig && fs.existsSync(path.join(u.dataDir, 'topics.json')));

test('생성물이 있는 단원이 하나 이상(u2)', () => assert.ok(units.some((u) => u.id === 'u2'), units.map((u) => u.id).join(',')));

for (const u of units) {
  const cfg = u.config.content;
  const topics = readJson(path.join(u.dataDir, 'topics.json'));
  const charts = readJson(path.join(u.dataDir, 'charts.json'));
  const photos = (t) => [...(t.markers || []).map((m) => m.photo), ...(t.blocks || []).map((b) => b.photo)].filter(Boolean);
  const chartRefs = (t) => [
    ...(t.blocks || []).flatMap((b) => [b.type === 'chart' ? b.ref : null, b.chart, ...(b.charts || [])]),
    ...(t.markers || []).map((m) => m.chart),
  ].filter(Boolean);

  test(`${u.id}: 주제 쪽이 단원 쪽 범위(${u.pages.join('~')})를 모두 덮고 범위 밖 쪽이 없다`, () => {
    const pages = new Set(topics.flatMap((t) => t.pages || []));
    for (let p = u.pages[0]; p <= u.pages[1]; p++) assert.ok(pages.has(p), `${p}쪽을 다루는 주제 없음`);
    for (const p of pages) assert.ok(p >= u.pages[0] && p <= u.pages[1], `범위 밖 쪽 ${p}`);
  });

  test(`${u.id}: 주제 목록·핀·그래프 수 = 설정 content.expect`, () => {
    const e = cfg.expect || {};
    if (e.topics) assert.deepEqual(topics.map((t) => t.id), e.topics);
    for (const [id, n] of Object.entries(e.markers || {})) assert.equal((topics.find((t) => t.id === id)?.markers || []).length, n, `${id} 핀`);
    for (const [id, n] of Object.entries(e.chartMarkers || {})) assert.equal((topics.find((t) => t.id === id)?.markers || []).filter((m) => m.chart).length, n, `${id} 그래프 핀`);
    if (e.charts != null) assert.equal(Object.keys(charts).length, e.charts, '그래프 수');
    if (e.coloringCountries != null) {
      const q = topics.find((t) => t.quiz?.type === 'coloring')?.quiz;
      assert.equal(q?.countries?.length, e.coloringCountries, '색칠하기 나라 수');
    }
  });

  test(`${u.id}: 레이어 ref → 생성물 파일이 있다`, () => {
    for (const t of topics) for (const l of t.layers || []) assert.ok(fs.existsSync(path.join(u.dataDir, `${l.ref}.json`)), `${t.id}: ${l.ref}.json 없음`);
  });

  test(`${u.id}: 그래프 ref → charts.json 에 있고, charts.json 의 그래프는 모두 쓰인다`, () => {
    const used = new Set();
    for (const t of topics) for (const r of chartRefs(t)) { assert.ok(charts[r], `${t.id}: 그래프 ${r} 없음`); used.add(r); }
    for (const id of Object.keys(charts)) assert.ok(used.has(id), `쓰지 않는 그래프 ${id}`);
  });

  test(`${u.id}: 사진 → docs/assets/atlas/${u.id}/photo/<id>.jpg(·webp) 가 있다, 원본 쪽 → page 그림이 있다`, () => {
    for (const t of topics) {
      for (const ph of photos(t)) {
        assert.ok(fs.existsSync(path.join(u.assetDir, 'photo', `${ph.id}.jpg`)), `${t.id}: 사진 ${ph.id}.jpg 없음`);
        if (ph.webp) assert.ok(fs.existsSync(path.join(u.assetDir, 'photo', `${ph.id}.webp`)), `${t.id}: 사진 ${ph.id}.webp 없음`);
      }
      for (const b of (t.blocks || []).filter((x) => x.type === 'page')) {
        const pf = cfg.pageFile;
        const f = path.join(REPO, cfg.pageDir, `${pf.prefix}${String(b.page).padStart(pf.pad, '0')}${pf.ext}`);
        assert.ok(fs.existsSync(f), `${t.id}: 원본 쪽 ${b.page} 없음`);
      }
    }
  });

  test(`${u.id}: 빈 글이 없다(핀 제목·글, 블록 필수 칸 — 설정 schema 예외만)`, () => {
    const opt = cfg.schema?.markerTextOptionalWith;
    for (const t of topics) {
      assert.ok(!blank(t.title), `${t.id}: 주제 제목`);
      for (const m of t.markers || []) {
        assert.ok(!blank(m.title), `${t.id}.${m.id}: 핀 제목`);
        if (!(opt && m[opt])) assert.ok(!blank(m.text), `${t.id}.${m.id}: 핀 글`);
      }
      for (const b of t.blocks || []) {
        for (const k of cfg.schema?.blockTypes?.[b.type]?.required || []) {
          if (k === 'ref') continue;                     // ref 는 생성물에서 photo·차트로 풀림(위 검사)
          assert.ok(!blank(b[k]), `${t.id}.${b.id}(${b.type}): ${k} 비었음`);
        }
      }
    }
  });

  const embed = path.join(REPO, 'embed', `${u.sim}.html`);
  test(`${u.id}: 조각 크기 ≤ 3MB`, { skip: !fs.existsSync(embed) && `embed/${u.sim}.html 없음(npm run embed -- ${u.sim})` }, () => {
    const n = fs.statSync(embed).size;
    assert.ok(n <= MAX_EMBED, `${(n / 1024).toFixed(0)} KB > ${MAX_EMBED / 1024} KB`);
  });
}
