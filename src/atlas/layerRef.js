// © 2026 김용현
// src/atlas/layerRef.js — topics.json 레이어 항목 → 레이어(layerFromRef), 여러 레이어를 한 id 로 묶기(combineLayers).
//   E1 은 여기서 layerFromRef 를 가져다 쓴다(레이어 종류 자체는 layers.js·imageLayer.js).
import { s } from '../shared/dom.js';
import { createLegendState } from './legendState.js';
import { legendItems } from './layerStyle.js';
import { metaOf } from './layerCommon.js';
import { areaLayer, symbolLayer, flowLayer } from './layers.js';
import { imageLayer } from './imageLayer.js';

/**
 * 여러 레이어를 한 id 로 묶는다(렌더러에는 하나): draw 는 부분마다 save/restore, drawSvg 는 부분마다 자기 <g class="at-part">,
 * hit 은 뒤(위) 부분부터, destroy 는 모두(+ 묶음의 범례 구독).
 * 범례: legend·map 을 주면 묶음이 legend.onChange 를 한 번만 구독해 map.refreshLayer(id) 한다 — 부분 레이어는 legendRefresh:false 로 만든다.
 * z = 가장 작은 부분 z(캔버스 부분이 면이면 z < 50 규칙을 따름). SVG 부분도 이 z 의 자리에 놓이므로 교역 흐름선(SVG)은 기호(60)·핀(80) 아래에
 * 깔린다 — 의도한 것이다(같은 지도에 핀·기호가 함께 뜨면 누르기 쉬운 쪽이 위). 흐름선을 위로 올려야 하면 SVG 부분만 따로 addLayer 한다.
 */
export function combineLayers(id, parts, { z = Math.min(...parts.map((p) => p.z ?? 0)), legend = null, map = null } = {}) {
  const drawParts = parts.filter((p) => typeof p.draw === 'function');
  const svgParts = parts.filter((p) => typeof p.drawSvg === 'function');
  const subs = new Map();
  const offs = legend && map ? [legend.onChange(() => { if (!map.destroyed) map.refreshLayer(id); })] : [];
  const layer = {
    id, z, parts,
    hit(xy, lonlat) { for (let i = parts.length - 1; i >= 0; i--) { const f = parts[i].hit?.(xy, lonlat); if (f) return f; } return null; },
    labelObstacles: () => parts.flatMap((p) => p.labelObstacles?.() || []),
    destroy() { offs.forEach((off) => off()); offs.length = 0; parts.forEach((p) => p.destroy?.()); },
  };
  if (drawParts.length) layer.draw = (ctx, path, view) => { for (const p of drawParts) { ctx.save(); try { p.draw(ctx, path, view); } finally { ctx.restore(); } } };
  if (svgParts.length) {
    layer.drawSvg = (g, project, view) => {
      for (const p of svgParts) {
        let sg = subs.get(p);
        if (!sg || sg.parentNode !== g) { sg = s('g', { class: 'at-part' }); g.append(sg); subs.set(p, sg); }
        p.drawSvg(sg, project, view);
      }
    };
  }
  return layer;
}

/**
 * topics.json 레이어 항목 {ref, type, legend?, label, legendTitle?, lineLegendTitle?, credit?, note?, approx?, approxNote?, group?} → 레이어 하나(id = ref).
 *   data = 그 레이어 자료(JSON) 또는 layers.js 묶음({ref: 자료}).
 *   type: 'area' → areaLayer, 'symbol' → symbolLayer, 'flow' → combineLayers(면 areaLayer + 흐름선 flowLayer), 'image' → imageLayer.
 *   legend 를 안 주면 범례 항목이 있을 때 새 legendState 를 만든다(layer.legend). layer.legendItems = 화면 범례 항목,
 *   layer.meta = 레이어 자체 meta 에 {ref, type, title, legendTitle, lineLegendTitle, credit, note, group, page, approx, approxNote, approxReason} 을 덧씌움.
 *   그 밖의 옵션(extra)은 이미지 레이어 옵션으로 넘긴다(dimAlpha·onLoad·load).
 */
export function layerFromRef(ref, data, { legend = undefined, map = null, onPick = null, ...extra } = {}) {
  const d = data && data[ref.ref] ? data[ref.ref] : data;
  if (!d) throw new Error(`layerFromRef: 자료 없음 ${ref.ref}`);
  const items = legendItems(d);
  const lg = legend !== undefined ? legend : (ref.legend !== false && items.length ? createLegendState(items.map((e) => e.cls)) : null);
  const common = { legend: lg, map, layerId: ref.ref };
  let layer;
  switch (ref.type) {
    case 'area': layer = areaLayer(ref.ref, d, common); break;
    case 'symbol': layer = symbolLayer(ref.ref, d, { ...common, onPick }); break;
    case 'flow': {
      const area = { ...d, features: d.features.filter((f) => f.properties.type !== 'flow') };
      const flow = { ...d, features: d.features.filter((f) => f.properties.type === 'flow') };
      const part = { ...common, legendRefresh: false }; // 범례 구독은 묶음이 한 번
      layer = combineLayers(ref.ref, [areaLayer(`${ref.ref}:area`, area, part), flowLayer(`${ref.ref}:flow`, flow, { ...part, onPick })], { legend: lg, map });
      layer.meta = metaOf(d);
      break;
    }
    case 'image': layer = imageLayer(ref.ref, d, { ...extra, ...common }); break;
    default: throw new Error(`layerFromRef: 모르는 레이어 종류 ${ref.type} (${ref.ref})`);
  }
  const props = d.properties || {};
  const approx = !!(ref.approx ?? props.approx);
  layer.legend = lg;
  layer.legendItems = items;
  layer.meta = {
    ...layer.meta,
    ref: ref.ref, type: ref.type, title: ref.label ?? props.title, legendTitle: ref.legendTitle, lineLegendTitle: ref.lineLegendTitle,
    credit: ref.credit, note: ref.note ?? props.note, group: ref.group, page: props.page ?? d.page,
    approx, approxNote: approx ? (ref.approxNote ?? '위치 근사') : undefined, approxReason: approx ? (ref.approxReason ?? props.approxReason) : undefined,
  };
  return layer;
}
