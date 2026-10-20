// © 2026 김용현
// scripts/atlas/fit_helper.mjs — Python 단계(shape_controls.py)가 맞추기·투영을 앱과 같은 코드(georef.mjs)로 하게 하는 도우미
//   node scripts/atlas/fit_helper.mjs < in.json > out.json
//   in  = {"ops": [op, …]}  out = {"results": [결과, …]} (차례 그대로)
//   op:
//     {"op": "fit", "cps": [{xy, lon, lat, src?}], "families": [...], "cli": false}
//        → fitControls 결과 {family, params, sim, rmsPt, meanPt, resid}. cli: true 면 georef-cli --all 과 같은 맞추기
//          (robustFit 뒤 fitWithTps) — {…, tps?, dropped: [이름], keep: [남은 기준점 번호]}.
//     {"op": "apply", "fit": {family, params, sim, tps?}, "rings": [[[lon, lat], …], …]} → 고리마다 [[x, y] | null, …]
//     {"op": "invert", "fit": {…}, "pts": [[x, y], …]} → [[lon, lat] | null, …]
//   함수는 시험용으로 내보낸다(runOps).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitControls, robustFit, fitWithTps, makeConverter } from './georef.mjs';

const fin = (p) => (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null);
const slim = (f) => ({ family: f.family, params: f.params, sim: f.sim, rmsPt: f.rmsPt, meanPt: f.meanPt, resid: f.resid,
  ...(f.tps ? { tps: f.tps } : {}), ...(f.smallArea ? { smallArea: true } : {}), ...(f.fixed ? { fixed: true } : {}) });

/** ops → 결과 목록. */
export function runOps(ops) {
  return ops.map((o) => {
    if (o.op === 'fit') {
      if (!o.cli) return slim(fitControls(o.cps, o.families));
      const tagged = o.cps.map((c, i) => ({ ...c, _i: i }));
      const r = robustFit(tagged, { families: o.families });
      const fit = fitWithTps(r.cps, { families: o.families });
      return { ...slim(fit), dropped: r.dropped.map((d) => d.name), keep: r.cps.map((c) => c._i) };
    }
    if (o.op === 'apply') {
      const cv = makeConverter(o.fit);
      return o.rings.map((ring) => ring.map((ll) => (cv ? fin(cv.apply(ll)) : null)));
    }
    if (o.op === 'invert') {
      const cv = makeConverter(o.fit);
      return o.pts.map((xy) => (cv ? fin(cv.invert(xy)) : null));
    }
    throw new Error(`모르는 op: ${o.op}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify({ results: runOps(input.ops) }));
}
