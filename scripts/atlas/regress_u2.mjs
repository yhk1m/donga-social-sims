// © 2026 김용현
// scripts/atlas/regress_u2.mjs — 아시아(u2) 회귀 도구의 옛 명령을 그대로 살리는 껍데기(U4-G0).
//   node scripts/atlas/regress_u2.mjs --baseline | --check   =   node scripts/atlas/regress_unit.mjs --unit u2 --baseline | --check
//   본문은 regress_unit.mjs 로 옮겼다 — u3(유럽)이 공개되어 단원마다 같은 회귀 관문이 필요해졌기 때문(아프리카 계획 U4-G0).
//   u2 명세(해시 목록·기준선 $ATLAS_WORK/units/u2/baseline/·캡처 shots/e2·대조표 compare-u2.html)는 옮기기 전과 같아 기준선을 다시 찍지 않는다.
import { main } from './regress_unit.mjs';

const argv = process.argv.slice(2).filter((a, i, all) => a !== '--unit' && all[i - 1] !== '--unit' && !a.startsWith('--unit='));
if (!argv.includes('--baseline') && !argv.includes('--check')) {
  console.error('사용: node scripts/atlas/regress_u2.mjs --baseline | --check');
  process.exitCode = 2;
} else main(['--unit', 'u2', ...argv]);
