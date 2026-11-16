// © 2026 김용현
// 인구 피라미드 자료 굽기 → sims/s1-u2-pyramid/data/pyramid-data.js
//   1) UN WPP 2024 (중위 추계) 5세 연령별 성별 인구, 1950~2100
//      원본: https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_PopulationByAge5GroupSex_Medium.csv.gz
//      → C:\Users\Public\sims-work\s1-u2-pyramid\raw\wpp_age5.csv.gz
//   2) KOSIS 「시군구/성/연령(5세)별 주민등록연앙인구」(DT_1B040M5, 1993~2023) 대용량 내려받기 CSV(cp949, 열 = 연도)
//      → C:\Users\Public\sims-work\s1-u2-pyramid\kosis\*.csv (여러 개면 모두 합침)
//      받는 법(사람이 브라우저에서, 인증키 필요 없음): kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040M5 →
//      다운로드 → 「대용량 다운로드」(CSV) — 행정구역은 시도와 시군구 모두, 성별 남자와 여자, 연령 전부, 기간 전부.
//      (2026-11-16 자동 수집은 KOSIS 가 「비정상적인 서비스 이용」으로 막아 하지 않는다. 지금 들어 있는 것은 전국과 경기도 1996, 2022 표본뿐)
// 사용: node scripts/s1-u2-pyramid/bake.mjs
import { createReadStream, readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { encodeInts, NA, PER_YEAR } from '../../sims/s1-u2-pyramid/core.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const WORK = 'C:/Users/Public/sims-work/s1-u2-pyramid';
const OUT_DIR = join(ROOT, 'sims', 's1-u2-pyramid', 'data');

// ---------- UN ----------
const UN_LOCS = [
  // [LocID, 화면 이름, 묶음]
  [900, '세계', 'world'],
  [935, '아시아', 'continent'], [903, '아프리카', 'continent'], [908, '유럽', 'continent'],
  [905, '북아메리카', 'continent'], [904, '라틴 아메리카', 'continent'], [909, '오세아니아', 'continent'],
  [410, '대한민국', 'asia'], [392, '일본', 'asia'], [156, '중국', 'asia'], [356, '인도', 'asia'], [634, '카타르', 'asia'],
  [408, '북한', 'asia'], [496, '몽골', 'asia'], [704, '베트남', 'asia'], [764, '타이', 'asia'], [608, '필리핀', 'asia'],
  [360, '인도네시아', 'asia'], [458, '말레이시아', 'asia'], [702, '싱가포르', 'asia'], [50, '방글라데시', 'asia'],
  [586, '파키스탄', 'asia'], [682, '사우디아라비아', 'asia'], [784, '아랍에미리트', 'asia'], [4, '아프가니스탄', 'asia'],
  [840, '미국', 'other'], [276, '독일', 'other'], [562, '니제르', 'other'],
];
const UN_Y0 = 1950, UN_Y1 = 2100, UN_UNIT = 100; // 100명 단위로 저장

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function bakeUN() {
  const file = join(WORK, 'raw', 'wpp_age5.csv.gz');
  const want = new Map(UN_LOCS.map(([id]) => [String(id), new Int32Array((UN_Y1 - UN_Y0 + 1) * PER_YEAR).fill(-1)]));
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!head) { head = Object.fromEntries(splitCsv(line).map((k, i) => [k, i])); continue; }
    const id = line.slice(line.indexOf(',') + 1, line.indexOf(',', line.indexOf(',') + 1));
    const arr = want.get(id);
    if (!arr) continue;
    const f = splitCsv(line);
    if (f[head.Variant] !== 'Medium') continue;
    const y = +f[head.Time], a = +f[head.AgeGrpStart];
    const ai = Math.min(a / 5, NA - 1);
    const o = (y - UN_Y0) * PER_YEAR;
    arr[o + ai] = Math.round(+f[head.PopMale] * 1000 / UN_UNIT);
    arr[o + NA + ai] = Math.round(+f[head.PopFemale] * 1000 / UN_UNIT);
  }
  const regions = UN_LOCS.map(([id, name, group]) => {
    const arr = want.get(String(id));
    const missing = arr.indexOf(-1);
    if (missing >= 0) throw new Error(`UN ${name}: 빈 칸 있음 (위치 ${missing})`);
    return { id: `un${id}`, name, group, d: encodeInts(arr) };
  });
  const years = []; for (let y = UN_Y0; y <= UN_Y1; y++) years.push(y);
  return { years, unit: UN_UNIT, projFrom: 2024, regions };
}

// ---------- KOSIS 주민등록 ----------
const SIDO = { '전국': '00', '서울특별시': '11', '부산광역시': '21', '대구광역시': '22', '인천광역시': '23', '광주광역시': '24', '대전광역시': '25',
  '울산광역시': '26', '세종특별자치시': '29', '경기도': '31', '강원도': '32', '강원특별자치도': '32', '충청북도': '33', '충청남도': '34',
  '전라북도': '35', '전북특별자치도': '35', '전라남도': '36', '경상북도': '37', '경상남도': '38', '제주특별자치도': '39', '제주도': '39' };
const KR_WANT = [1995, 1996, 2000, 2005, 2010, 2015, 2020, 2022]; // + 파일에 있는 가장 최근 해
const AGE_LABEL = (s) => {
  const t = s.replace(/\s/g, '');
  if (t === '100세이상') return NA - 1;
  if (t === '85세이상') return 'o85';
  if (t === '80세이상') return 'o80';
  const m = /^(\d+)-(\d+)세$/.exec(t);
  return m ? +m[1] / 5 : -1; // 계 는 버림
};
// 옛 해는 85세 이상(또는 80세 이상)이 한 칸뿐이다. 그 해는 맨 위 칸을 'top 세 이상' 한 칸으로 쓰고 그 위 칸은 0.
const TOP_BANDS = { o85: 17, o80: 16 };

function bakeKR() {
  const dir = join(WORK, 'kosis');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (!files.length) return null;
  const regs = new Map(); // id → { id, name, sido, byYear: Map(year → Int32Array(42)) }
  const order = [];
  const dec = new TextDecoder('euc-kr');
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const text = buf[0] === 0xef && buf[1] === 0xbb ? buf.toString('utf8').slice(1) : dec.decode(buf);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const head = splitCsv(lines[0]);
    const yearCols = head.map((k, i) => [i, parseInt(k, 10)]).filter(([, y]) => y > 1900);
    let sido = '00';
    for (const line of lines.slice(1)) {
      const c = splitCsv(line);
      const name = c[0].trim(), sex = c[1].trim(), ai = AGE_LABEL(c[2]);
      let id;
      if (name in SIDO) { sido = SIDO[name]; id = sido; } else id = `${sido}-${name}`;
      if (!regs.has(id)) {
        regs.set(id, { id, name, sido: id === sido ? null : sido, byYear: new Map() });
        order.push(id);
      }
      if (ai === -1 || (sex !== '남자' && sex !== '여자')) continue;
      const r = regs.get(id);
      for (const [col, y] of yearCols) {
        const v = c[col]?.trim();
        if (!r.byYear.has(y)) r.byYear.set(y, { a: new Int32Array(PER_YEAR).fill(-1), o85: [-1, -1], o80: [-1, -1] });
        const num = v === '' || v === '-' || v == null ? -1 : Math.round(parseFloat(v.replace(/,/g, '')));
        const val = Number.isFinite(num) ? num : -1;
        const rec = r.byYear.get(y);
        if (typeof ai === 'string') rec[ai][sex === '남자' ? 0 : 1] = val;
        else rec.a[(sex === '남자' ? 0 : NA) + ai] = val;
      }
    }
  }
  // 해마다 맨 위 칸 정하기: 100세 이상까지 있으면 100, 85세 이상만 있으면 85, 80세 이상만 있으면 80
  const topOf = new Map();
  for (const r of regs.values()) for (const [y, rec] of r.byYear) {
    if (topOf.has(y) && topOf.get(y) === 100) continue;
    const fine = rec.a[NA - 1] >= 0 && rec.a[19] >= 0;
    topOf.set(y, fine ? 100 : rec.o85[0] >= 0 ? 85 : rec.o80[0] >= 0 ? 80 : (topOf.get(y) ?? 0));
  }
  for (const r of regs.values()) for (const [y, rec] of r.byYear) {
    const top = topOf.get(y);
    if (top === 100) continue;
    const key = top === 85 ? 'o85' : 'o80', band = TOP_BANDS[key];
    for (let s = 0; s < 2; s++) {
      for (let i = band; i < NA; i++) rec.a[s * NA + i] = 0;
      rec.a[s * NA + band] = rec[key][s];
    }
  }
  for (const r of regs.values()) for (const [y, rec] of r.byYear) r.byYear.set(y, rec.a);
  const allYears = new Set();
  for (const r of regs.values()) for (const [y, a] of r.byYear) if (a.some((v) => v > 0)) allYears.add(y);
  const latest = Math.max(...allYears);
  const years = [...new Set([...KR_WANT, latest])].filter((y) => allYears.has(y)).sort((a, b) => a - b);
  const regions = [];
  for (const id of order) {
    const r = regs.get(id);
    const arr = new Int32Array(years.length * PER_YEAR).fill(-1);
    let any = false;
    years.forEach((y, k) => {
      const a = r.byYear.get(y);
      // 그 해 칸이 하나라도 비었거나 모두 0 이면 그 해는 '없음'(구역이 없던 해)
      if (!a || a.some((v) => v < 0) || !a.some((v) => v > 0)) return;
      arr.set(a, k * PER_YEAR); any = true;
    });
    if (!any) continue;
    regions.push({ id: `kr${r.id}`, name: r.name, sido: r.sido ? `kr${r.sido}` : null, d: encodeInts(arr) });
  }
  const top = years.map((y) => topOf.get(y));
  return { years, unit: 1, top, regions };
}

const un = await bakeUN();
const kr = bakeKR();
const data = { un, kr };
mkdirSync(OUT_DIR, { recursive: true });
const js = `// © 2026 김용현\n// 자동 생성: scripts/s1-u2-pyramid/bake.mjs (손으로 고치지 않기)\n// UN WPP 2024 중위 추계, KOSIS 주민등록연앙인구(DT_1B040M5)\nexport default ${JSON.stringify(data)};\n`;
writeFileSync(join(OUT_DIR, 'pyramid-data.js'), js);
console.log(`UN ${un.regions.length}곳 ${un.years[0]}~${un.years.at(-1)}`);
console.log(kr ? `주민등록 ${kr.regions.length}곳, 해 ${kr.years.join(', ')}` : '주민등록 자료 없음');
console.log(`pyramid-data.js ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB`);
