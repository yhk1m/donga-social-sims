// © 2026 김용현
// scripts/atlas/projection_from.mjs — 지도 목록 projectionFrom(29쪽 아이슬란드 삽입 = 본 지도 도법 고정)의 낡음 검사.
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
