// © 2026 김용현
// scripts/atlas/unit.mjs — 단원 고르기 한 곳(Node). 2단계 설계 §4.2, Python 은 atlas_common.unit() 이 같은 규칙.
//   우선순위: 명령줄 --unit uN → env ATLAS_UNIT → env ATLAS_UNIT_CONFIG(옛 방식, 설정 파일 경로) → 기본 u2.
//   기본이 u2 라 --unit 없이 돌리는 지금 명령은 하나도 바뀌지 않는다.
//   resolveUnit(argv, env) → { id, sim, title, pages, configPath, config(늦게 읽음), mapsPath, dataDir, contentDir, assetDir, work, workDir, workFile(rel) }
//   - 설정 파일은 config 를 처음 볼 때 읽는다(아직 설정이 없는 단원도 고를 수 있게 — 단원 표·경로만 필요한 경우).
//   - 단원 작업 폴더 workDir: 설정 unitWork(작업 폴더 기준)가 있으면 그것, u2 는 작업 폴더 그대로(1단계 경로), 그 밖은 units/<id>.
//   stripUnitArgs(argv) → { unit, rest }: 각 스크립트의 기존 옵션 해석과 부딪치지 않게 --unit <id> 두 칸만 먼저 빼낸다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));      // scripts/atlas
const REPO = path.resolve(HERE, '..', '..');
export const UNITS_FILE = path.join(HERE, 'units.json');
export const DEFAULT_UNIT = 'u2';

/** 단원 표(units.json, _ 로 시작하는 설명 키 뺌). */
export function loadUnits(file = UNITS_FILE) {
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('_')));
}

/** --unit <id> 두 칸을 빼낸 나머지 명령줄과 고른 단원 id(없으면 null). --unit=<id> 꼴도 받는다. */
export function stripUnitArgs(argv = process.argv.slice(2)) {
  const rest = [];
  let unit = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--unit') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error('--unit 뒤에 단원 id(u2·u3 …)가 없음');
      unit = argv[++i];
    } else if (a.startsWith('--unit=')) unit = a.slice(7);
    else rest.push(a);
  }
  return { unit, rest };
}

const slash = (p) => p.replace(/\\/g, '/');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** 단원 하나를 고른다. 모르는 단원 id 면 오류. */
export function resolveUnit(argv = process.argv.slice(2), env = process.env) {
  const units = loadUnits();
  const work = slash(env.ATLAS_WORK || 'C:/Users/Public/atlas-work');
  const fromArg = stripUnitArgs(argv).unit;
  let id = fromArg || env.ATLAS_UNIT || null;
  let configPath = null;
  if (!id && env.ATLAS_UNIT_CONFIG) {
    // 옛 방식: 설정 파일 경로 → 단원 표에서 같은 설정을 쓰는 단원(없으면 파일 이름을 id 로 한 단원 — 표 밖 설정)
    configPath = env.ATLAS_UNIT_CONFIG;
    id = Object.keys(units).find((k) => same(path.join(HERE, units[k].config), configPath)) || path.basename(configPath, '.json');
  }
  id = id || DEFAULT_UNIT;
  const entry = units[id] || (configPath ? { sim: null, title: id, pages: null, config: path.relative(HERE, configPath) } : null);
  if (!entry) throw new Error(`모르는 단원: ${id} (scripts/atlas/units.json 에 있는 것: ${Object.keys(units).join(', ')})`);
  configPath = configPath || path.join(HERE, entry.config);

  let cached;
  const readConfig = () => {
    if (cached === undefined) cached = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
    return cached;
  };
  const u = {
    id, sim: entry.sim, title: entry.title, pages: entry.pages, configPath, work,
    /** 단원 설정(JSON). 파일이 없으면 오류. */
    get config() {
      const c = readConfig();
      if (!c) throw new Error(`${id}: 단원 설정 없음 ${configPath}`);
      return c;
    },
    get hasConfig() { return readConfig() != null; },
    /** 지도 목록: 설정 maps(설정 파일 기준) — 설정이 없거나 maps 가 없으면 scripts/atlas/maps_<id>.json. */
    get mapsPath() {
      const m = readConfig()?.maps;
      return m ? path.join(path.dirname(configPath), m) : path.join(HERE, `maps_${id}.json`);
    },
    /** 생성물 폴더: 설정 out(저장소 기준) — 없으면 sims/<sim>/data. */
    get dataDir() {
      const o = readConfig()?.out;
      return path.join(REPO, o || `sims/${entry.sim}/data`);
    },
    contentDir: path.join(REPO, 'content', 'atlas', id),
    assetDir: path.join(REPO, 'docs', 'assets', 'atlas', id),
    /** 단원 작업 폴더(슬래시 경로): 설정 unitWork → u2 는 작업 폴더 그대로 → 그 밖은 units/<id>. */
    get workDir() {
      const w = readConfig()?.unitWork;
      if (w) return `${work}/${slash(w).replace(/^\/+|\/+$/g, '')}`;
      return id === DEFAULT_UNIT ? work : `${work}/units/${id}`;
    },
    /** 단원 작업 파일 경로(rel = 'text/topics-check.json' 같은 작업 폴더 상대 경로). */
    workFile(rel) { return `${this.workDir}/${slash(rel)}`; },
  };
  return u;
}
