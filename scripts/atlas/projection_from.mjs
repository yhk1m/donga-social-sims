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

// ── spreadOf(U1-3a — 두 쪽에 걸친 한 지도, 8~9·10~11쪽): 지도 항목 spreadOf: <왼쪽 지도 id> + offsetPt: [dx, dy] ──────────────────
//   offsetPt = 오른쪽 쪽 점 (x, y) 가 왼쪽 쪽 좌표계에서 (x + dx, y + dy) 에 있음(쪽 너비 − 가름선 겹침 — 같은 도형을 두 쪽에 찍은 자리로 잼).
//   왼쪽 지도가 스스로 맞추는 지도면 두 쪽 기준점을 왼쪽 좌표계로 모아 한 번 맞추고(spreadControls), 오른쪽 지도 fit = 왼쪽의 풀린 fit 을
//   (−dx, −dy) 만큼 옮긴 것(spreadFit — shiftFit 과 같은 식, 표시만 spreadOf). 왼쪽 지도가 fitFrom 이면(10쪽 ← 8쪽) 오른쪽은 그 풀린
//   fit + 쪽 이동(빌림의 빌림은 spreadOf 만 허용 — 한 쪽 지도를 둘로 나눈 것일 뿐 다른 바탕 지도를 빌리는 것이 아님), 오른쪽 지도에
//   기준점이 있으면 맞춤에 쓸 수 없어 멈춘다(assertNoSpreadControlsOnFitFrom). 키가 없으면 옛 길 그대로(u2~u6 지도 목록에는 없음).

const finiteOffset = (o) => Array.isArray(o) && o.length === 2 && o.every(Number.isFinite);

/** 지도 목록 → { left: Map(왼쪽 id → [{id, dx, dy}]), right: Map(오른쪽 id → {map, dx, dy}) }. 틀린 꼴이면 멈춘다:
 *  offsetPt 없음·꼴 틀림, 대상이 목록에 없음·자기 자신, 대상이 또 spreadOf(사슬), spreadOf 와 fitFrom·projectionFrom 을 함께, 대상이 목록에서 뒤,
 *  georef:false 지도가 끼임. */
export function planSpread(maps) {
  const left = new Map(), right = new Map();
  const pos = new Map(maps.map((m, i) => [m.id, i]));
  for (const [i, m] of maps.entries()) {
    if (m.spreadOf == null && m.offsetPt == null) continue;
    const who = `${m.id}: spreadOf`;
    if (typeof m.spreadOf !== 'string' || !m.spreadOf) throw new Error(`${who} 가 지도 id 글자가 아님(offsetPt 만 있으면 spreadOf 도 적음): ${JSON.stringify(m.spreadOf)}`);
    if (!finiteOffset(m.offsetPt)) throw new Error(`${who} ${m.spreadOf} 의 offsetPt 가 유한한 수 둘 [dx, dy] 이 아님: ${JSON.stringify(m.offsetPt)}`);
    if (m.spreadOf === m.id) throw new Error(`${who} 가 자기 자신`);
    if (!pos.has(m.spreadOf)) throw new Error(`${who} ${m.spreadOf} 가 지도 목록에 없음`);
    if (pos.get(m.spreadOf) > i) throw new Error(`${who} ${m.spreadOf} 가 목록에서 뒤 — 왼쪽 지도를 앞에 둠`);
    if (m.fitFrom || m.projectionFrom) throw new Error(`${who} 와 ${m.fitFrom ? 'fitFrom' : 'projectionFrom'} 를 함께 적음 — 오른쪽 지도 식은 왼쪽 지도에서만 옴`);
    const L = maps[pos.get(m.spreadOf)];
    if (L.spreadOf != null) throw new Error(`${who} ${L.id} 도 spreadOf 지도 — 두 쪽 지도는 왼쪽 하나 + 오른쪽 하나(사슬 없음)`);
    if (m.georef === false || L.georef === false) throw new Error(`${who} ${L.id}: georef:false 지도는 두 쪽 지도가 될 수 없음`);
    const [dx, dy] = m.offsetPt;
    right.set(m.id, { map: L.id, dx, dy });
    if (!left.has(L.id)) left.set(L.id, []);
    left.get(L.id).push({ id: m.id, dx, dy });
  }
  return { left, right };
}

/** 두 쪽 지도의 왼쪽이 fitFrom 지도면 맞춤 없이 빌리므로 오른쪽 지도 기준점을 쓸 곳이 없다 — 오른쪽에 기준점이 하나라도 있으면 멈춘다
 *  (예전에는 알림 한 줄만 찍고 버림). rights = planSpread().left.get(왼쪽 id), cpsOf(id) → 그 지도 기준점 배열. */
export function assertNoSpreadControlsOnFitFrom(leftId, rights, cpsOf) {
  for (const r of rights || []) {
    const n = cpsOf(r.id).length;
    if (n) throw new Error(`${r.id}: 두 쪽 왼쪽 ${leftId} 가 fitFrom 지도라 오른쪽 기준점 ${n}개를 맞춤에 쓸 수 없음 — 기준점을 지우거나(controls·경위선 눈금) 왼쪽 지도를 스스로 맞춤`);
  }
}

/** 왼쪽 지도 기준점 + 오른쪽 지도들 기준점(쪽 좌표 + offsetPt — 이름 앞에 「<오른쪽 id>:」) → 한 좌표계의 기준점 목록(새 객체). */
export function spreadControls(own, rights) {
  const out = own.map((c) => ({ ...c }));
  for (const { id, dx, dy, cps } of rights) {
    for (const c of cps) out.push({ ...c, xy: [c.xy[0] + dx, c.xy[1] + dy], name: `${id}:${c.name || `${c.lon},${c.lat}`}` });
  }
  return out;
}

/** 왼쪽 지도의 풀린 fit · {map, dx, dy}(오른쪽 지도 offsetPt) → 오른쪽 지도 fit(shiftFit(−dx, −dy), 표시 spreadOf {map, offsetPt}). */
export function spreadFit(src, { map, dx, dy }, id) {
  const out = shiftFit(src, { map, dx: -dx, dy: -dy }, id);
  delete out.fitFrom; delete out.spread;
  out.spreadOf = { map, offsetPt: [dx, dy] };
  if (src.fitFrom) out.via = { fitFrom: src.fitFrom };   // 왼쪽이 fitFrom 지도(10쪽 ← 8쪽) — 풀린 fit 이 어디서 왔는지 남김
  return out;
}

/** spreadOf fit · 왼쪽 지도 fit · {map, dx, dy} → 낡았으면 까닭 글, 아니면 null(build_layers 가 쓰기 전에 — fitFromStale 과 같은 뜻). */
export function spreadFitStale(fit, parent, spec) {
  if (!fit?.spreadOf) return `${fit?.id}: spreadOf fit 이 아님(지도 항목은 spreadOf 인데 fit 에 spreadOf 없음)`;
  const so = fit.spreadOf;
  if (so.map !== spec.map || so.offsetPt?.[0] !== spec.dx || so.offsetPt?.[1] !== spec.dy)
    return `${fit.id}: 두 쪽 이동량 ${so.map} [${so.offsetPt}] ≠ 지도 목록 ${spec.map} [${spec.dx}, ${spec.dy}]`;
  const want = spreadFit(parent, spec, fit.id);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (fit.family !== want.family || !eq(fit.params, want.params)) return `${fit.id}: 도법·매개변수가 왼쪽 지도 ${parent.id} 와 다름`;
  if (!eq(fit.sim, want.sim)) return `${fit.id}: 닮음 변환이 왼쪽 지도 ${parent.id} − 두 쪽 이동량과 다름`;
  if (!eq(fit.tps ?? null, want.tps ?? null)) return `${fit.id}: TPS 가 왼쪽 지도 ${parent.id} − 두 쪽 이동량과 다름`;
  return null;
}
