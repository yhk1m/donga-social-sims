// © 2026 김용현
// src/atlas/fitProject.js — 교과서 지도의 투영식(fit: 도법·매개변수·닮음 변환 + TPS 보정)으로 경위도 → 지면 pt 를 앱에서 계산한다(순수 함수).
// 도법·닮음 변환·TPS 계산은 추출 파이프라인 scripts/atlas/georef.mjs 와 같은 공통 모듈(fitCore.js)을 쓴다 → makeConverter(fit).apply 와 구성상 같은 값
// (tests/atlas/fitProject.test.mjs 가 저장소 안 TPS 고정 자료로 8개 도법을 견줌).
// 이미지 레이어(교과서 투영으로 그려진 밀도 음영)를 화면 투영으로 다시 그릴 때 쓴다: 화면 화소 → (화면 투영 invert) 경위도 → 이 함수 → 지면 pt → 이미지 화소.
// fit 은 scripts/atlas/pt2lonlat.mjs browserFit 이 만드는 {family, params, sim, tps?} — 생성물(overlay-*.json)의 fit 칸.
// georef.mjs 를 그대로 끌어오지 않는 까닭: 맞추기(최소제곱·LU) 코드가 조각에 딸려 오지 않게.
import { FAMILIES, applySim, tpsDelta } from './fitCore.js';

const finite2 = (p) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** fit → (lonlat → [x, y] 지면 pt | null). 투영할 수 없으면 null. 모르는 도법 이름은 오류. */
export function makeFitForward(fit) {
  const mk = FAMILIES[fit?.family];
  if (!mk) throw new Error(`모르는 교과서 도법: ${fit?.family}`);
  const proj = mk(fit.params).scale(1).translate([0, 0]);
  const sim = fit.sim, tps = fit.tps || null;
  return (ll) => {
    if (!finite2(ll)) return null;
    const q = proj(ll);
    if (!finite2(q)) return null;
    const p = applySim(sim, q);
    if (!tps) return p;
    const d = tpsDelta(tps, p), r = [p[0] + d[0], p[1] + d[1]];
    return finite2(r) ? r : null;
  };
}
