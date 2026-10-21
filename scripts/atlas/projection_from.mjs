// © 2026 김용현
// scripts/atlas/projection_from.mjs — 지도 목록 projectionFrom(29쪽 아이슬란드 삽입 = 본 지도 도법 고정)의 낡음 검사,
//   fitFrom(46쪽 미국 4장 — 같은 바탕 지도를 쪽 안 다른 자리에 되풀이)의 쪽 이동 fit(shiftFit, georef-cli 가 씀).
//   삽입 fit 은 맞출 때의 본 지도 도법·매개변수를 그대로 가진다(fixed: true). 본 지도를 다시 맞춰 매개변수가 바뀌었거나 본 지도 fit 이
//   더 새것이면 삽입 fit 은 낡은 것 → georef-cli --all 로 다시 맞춰야 한다(georef-cli 는 본 지도를 먼저 맞추고 바로 삽입을 다시 맞춤).

/**
 * 삽입 fit · 본 지도 fit → 내용이 낡았으면 까닭 글, 아니면 null.
 * 도법·매개변수가 다르면 낡음. 파일 시각은 보지 않는다(새로 clone 하면 시각이 뒤섞임 — projectionFromOlder 로 따로 경고).
 */
export function projectionFromStale(inset, parent) {
  if (!inset?.fixed) return `${inset?.id}: 고정 도법 fit 이 아님(projectionFrom 인데 fixed 없음)`;
  if (inset.family !== parent.family) return `${inset.id}: 도법 ${inset.family} ≠ 본 지도 ${parent.id} ${parent.family}`;
  const same = inset.params.length === parent.params.length && inset.params.every((v, i) => Math.abs(v - parent.params[i]) < 1e-9);
  if (!same) return `${inset.id}: 매개변수 [${inset.params}] ≠ 본 지도 ${parent.id} [${parent.params}]`;
  return null;
}

/** 본 지도 fit 파일이 삽입 fit 보다 새것이면 까닭 글(닮음 변환 기준점이 바뀌었을 수 있음 — 경고·다시 맞춤 근거일 뿐 멈추지 않음). */
export function projectionFromOlder(inset, parent, { insetMtime = null, parentMtime = null } = {}) {
  if (insetMtime != null && parentMtime != null && parentMtime > insetMtime) return `${inset.id}: 본 지도 ${parent.id} fit 이 더 새것`;
  return null;
}

/** fitFrom {map, dx, dy}: 같은 바탕 지도를 쪽 안 다른 자리에 되풀이한 지도(46쪽 미국 4장 × 본토·알래스카·하와이) — 그 지도 fit 을
 *  쪽 이동량만큼 옮긴 fit(닮음 변환 sim.tx·ty += dx·dy, TPS 는 기준점째 옮김: cx·cy·hull += dx·dy). 맞춤 품질 수치는 그 지도 것을
 *  그대로 두고(같은 식), 이 지도 자체 기준점이 있으면 옮긴 식과의 잔차만 own 에 적는다. 그 지도는 목록에서 먼저 맞춰져 있어야 한다. */
export function shiftFit(src, { map, dx, dy }, id) {
  const p12 = (v) => +v.toPrecision(12);
  const out = { ...src, id, sim: { ...src.sim, tx: p12(src.sim.tx + dx), ty: p12(src.sim.ty + dy) } };
  if (src.tps) out.tps = { ...src.tps, cx: src.tps.cx + dx, cy: src.tps.cy + dy, hull: src.tps.hull.map(([x, y]) => [x + dx, y + dy]) };
  out.fitFrom = { map, dx, dy };
  return out;
}

/** fitFrom fit · 빌린 지도 fit · 지도 항목 fitFrom {map, dx, dy} → 내용이 낡았으면 까닭 글, 아니면 null(U5-3d — build_layers 가 쓰기 전에).
 *  빌린 지도를 다시 맞췄는데 fitFrom 지도를 다시 만들지 않았거나(도법·매개변수·닮음 변환·TPS 기준점이 shiftFit 결과와 다름),
 *  지도 목록의 이동량이 바뀌었으면 낡음 → georef-cli --all. 파일 시각은 보지 않는다(projectionFromStale 과 같음). */
export function fitFromStale(fit, parent, spec) {
  if (!fit?.fitFrom) return `${fit?.id}: fitFrom fit 이 아님(지도 항목은 fitFrom 인데 fit 에 fitFrom 없음)`;
  const ff = fit.fitFrom;
  if (ff.map !== spec.map || ff.dx !== spec.dx || ff.dy !== spec.dy) return `${fit.id}: 이동량 ${ff.map} (${ff.dx}, ${ff.dy}) ≠ 지도 목록 ${spec.map} (${spec.dx}, ${spec.dy})`;
  const want = shiftFit(parent, spec, fit.id);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (fit.family !== want.family || !eq(fit.params, want.params)) return `${fit.id}: 도법·매개변수가 빌린 지도 ${parent.id} 와 다름`;
  if (!eq(fit.sim, want.sim)) return `${fit.id}: 닮음 변환이 빌린 지도 ${parent.id} + 이동량과 다름`;
  if (!eq(fit.tps ?? null, want.tps ?? null)) return `${fit.id}: TPS 가 빌린 지도 ${parent.id} + 이동량과 다름`;
  return null;
}
