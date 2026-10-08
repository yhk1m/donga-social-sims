// scripts/run-tests.mjs — npm test: Python(PDF 추출) 테스트 + tests/ 가 있으면 Node 테스트
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false });
  if (r.error) { console.error(r.error.message); return 1; }
  return r.status ?? 1;
};

let fail = 0;
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
fail |= run(python, ['-I', '-m', 'unittest', 'discover', '-s', 'scripts/atlas/tests', '-v']);
if (existsSync(join(root, 'tests'))) fail |= run(process.execPath, ['--test', 'tests/']);
else console.log('\n(tests/ 폴더가 없어 Node 테스트는 건너뜀)');
process.exit(fail ? 1 : 0);
