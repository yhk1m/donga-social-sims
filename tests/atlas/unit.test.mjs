// © 2026 김용현
// tests/atlas/unit.test.mjs — 단원 고르기 한 곳(scripts/atlas/unit.mjs) 검사(2단계 G1)
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUnit, stripUnitArgs } from '../../scripts/atlas/unit.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'atlas');

test('기본은 u2 — 지금 명령이 그대로', () => {
  const u = resolveUnit([], {});
  assert.equal(u.id, 'u2'); assert.equal(u.sim, 'atlas-u2-asia');
  assert.match(u.configPath.replace(/\\/g, '/'), /scripts\/atlas\/config\/u2\.json$/);
  assert.match(u.mapsPath.replace(/\\/g, '/'), /scripts\/atlas\/maps_u2\.json$/);
  assert.equal(u.dataDir.replace(/\\/g, '/').split('/').slice(-3).join('/'), 'sims/atlas-u2-asia/data');
});
test('u2 설정 경로 글자는 옛 스크립트의 path.join(HERE, "config", "u2.json") 와 같다', () => {
  assert.equal(resolveUnit([], {}).configPath, path.join(HERE, 'config', 'u2.json'));
});
test('--unit 이 env 보다 앞섬, ATLAS_UNIT_CONFIG(옛 방식)도 받음', () => {
  assert.equal(resolveUnit(['--unit', 'u3'], { ATLAS_UNIT: 'u2' }).id, 'u3');
  assert.equal(resolveUnit([], { ATLAS_UNIT: 'u3' }).id, 'u3');
  assert.equal(resolveUnit([], { ATLAS_UNIT_CONFIG: 'scripts/atlas/config/u2.json' }).id, 'u2');
  assert.equal(resolveUnit(['--unit=u3'], {}).id, 'u3');
});
test('ATLAS_UNIT_CONFIG 는 그 경로 글자 그대로 쓴다(옛 방식과 같음)', () => {
  const p = path.join(HERE, 'config', 'u2.json');
  assert.equal(resolveUnit([], { ATLAS_UNIT_CONFIG: p }).configPath, p);
});
test('모르는 단원은 오류', () => assert.throws(() => resolveUnit(['--unit', 'u9'], {}), /u9/));
test('단원 작업 폴더: u2 는 옛 경로 그대로(설정에 없으면), 새 단원은 units/uN', () => {
  const w = (id) => resolveUnit(['--unit', id], { ATLAS_WORK: 'C:/W' }).workFile('text/topics-check.json').replace(/\\/g, '/');
  assert.equal(w('u2'), 'C:/W/text/topics-check.json');
  assert.equal(w('u3'), 'C:/W/units/u3/text/topics-check.json');
});
test('설정이 아직 없는 단원도 고를 수 있고, config 를 볼 때만 오류', () => {
  const u = resolveUnit(['--unit', 'u3'], {});
  if (u.hasConfig) return; // U3-1 뒤에는 설정이 있다
  assert.equal(u.sim, 'atlas-u3-europe');
  assert.match(u.mapsPath.replace(/\\/g, '/'), /scripts\/atlas\/maps_u3\.json$/);
  assert.equal(u.dataDir.replace(/\\/g, '/').split('/').slice(-3).join('/'), 'sims/atlas-u3-europe/data');
  assert.throws(() => u.config, /u3/);
});
test('stripUnitArgs: --unit 두 칸만 빼고 나머지 옵션은 차례 그대로', () => {
  assert.deepEqual(stripUnitArgs(['--write', '--unit', 'u3', '--force']), { unit: 'u3', rest: ['--write', '--force'] });
  assert.deepEqual(stripUnitArgs(['--only', 'a,b']), { unit: null, rest: ['--only', 'a,b'] });
  assert.throws(() => stripUnitArgs(['--unit']), /단원/);
  assert.throws(() => stripUnitArgs(['--unit', '--write']), /단원/);
});
test('도장 경로 @unit/: u2 는 작업 폴더 그대로(= @work/)', async () => {
  const { stampPath, WORK } = await import('../../scripts/atlas/geo_util.mjs');
  assert.equal(stampPath('@unit/text/topics-check.json'), `${WORK}/text/topics-check.json`);
  assert.equal(stampPath('@unit/text/topics-check.json'), stampPath('@work/text/topics-check.json'));
});
test('layers.js 머리 주석 경로 = 생성물 폴더(u2 는 옛 글자 그대로)', async () => {
  const { layersModule } = await import('../../scripts/atlas/build_content.mjs');
  const root = path.resolve(HERE, '..', '..');
  assert.match(layersModule(['a']).split('\n')[1], /^\/\/ sims\/atlas-u2-asia\/data\/layers\.js — 생성물/);
  assert.match(layersModule(['a'], path.join(root, 'sims', 'atlas-u3-europe', 'data')).split('\n')[1], /^\/\/ sims\/atlas-u3-europe\/data\/layers\.js — 생성물/);
});
