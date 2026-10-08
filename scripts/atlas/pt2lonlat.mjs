// © 2026 김용현
// scripts/atlas/pt2lonlat.mjs — 지면 pt → 경위도 (Python 단계가 경위도 맞추기 결과를 쓸 때)
//   node scripts/atlas/pt2lonlat.mjs < in.json > out.json
//   in  = {"<지도 id>": [[x, y], ...], ...}
//   out = {"<지도 id>": [[lon, lat] | null, ...], ...}   (null = 되돌리기 실패)
//   fit = $ATLAS_WORK/geo/<지도 id>.fit.json (없으면 오류로 멈춘다)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeConverter } from './georef.mjs';

const WORK = (process.env.ATLAS_WORK || 'C:/Users/Public/atlas-work').replace(/\\/g, '/');

/** fits: {id: fit}, pts: {id: [[x,y]...]} → {id: [[lon,lat]|null ...]} (소수 5자리) */
export function toLonLat(fits, pts) {
  const out = {};
  for (const [id, list] of Object.entries(pts)) {
    if (!fits[id]) throw new Error(`fit 없음: ${id}`);
    const conv = makeConverter(fits[id]);
    out[id] = list.map((xy) => {
      const ll = conv.invert(xy);
      return ll && ll.every(Number.isFinite) ? ll.map((v) => Math.round(v * 1e5) / 1e5) : null;
    });
  }
  return out;
}

export function loadFit(id) {
  const f = `${WORK}/geo/${id}.fit.json`;
  if (!fs.existsSync(f)) throw new Error(`fit 파일 없음: ${f} (georef-cli.mjs --all 먼저)`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pts = JSON.parse(fs.readFileSync(0, 'utf8'));
  const fits = Object.fromEntries(Object.keys(pts).map((id) => [id, loadFit(id)]));
  process.stdout.write(JSON.stringify(toLonLat(fits, pts)));
}
