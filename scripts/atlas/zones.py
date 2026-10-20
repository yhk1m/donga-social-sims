# © 2026 김용현
# scripts/atlas/zones.py — 분류 면(지면 pt): 벡터 채움(화가 알고리즘), 래스터 화소 분류, 빗금 윤곽, 틀 자르기·빈 곳 넓히기
import os
import numpy as np
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
import pdfkit
from atlas_common import (WORK, drawings, hexc, lab, lab_hex, match_color, rings, polygonal, drawing_geom, drop_small,
                          inside, overlaps, excluded_boxes, frame)

UNMATCHED_REPORT_N = 12      # 보고서에 남길 범례에 없는 채움색 수
UNCLASSIFIED_FILL_PT = 4.0   # 래스터: 분류 안 된 육지 화소는 이 거리 안의 분류로 채움(핀 그림자 등)
TILE_SEAM_KERNEL = 3         # 래스터: 1화소 타일 이음매·얼룩을 지우는 중앙값 필터·열림 연산 크기
MIN_VALID_LAND_PCT = 80.0    # 래스터: 분류된 육지 화소 비율이 이보다 낮으면 경고


def vector_items(m, fills, cfg):
    """지도 안(덮개 상자 밖) 범례색 채움 도형 → ([(cls, 면)] 그린 차례, 보고서 조각 {unmatched, alias_used}).
    vector_zones 와 country_class(작은 나라가 교과서에서 따로 칠해졌는지)가 같은 규칙으로 쓴다."""
    aliases = cfg.get('aliases') or {}
    ex = excluded_boxes(m)
    items, unmatched, alias_used = [], {}, {}
    for d in drawings(m['page']):
        if d.get('fill') is None: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        h = hexc(d['fill'])
        if h in aliases:
            alias_used[h] = alias_used.get(h, 0) + 1; h = aliases[h]
        e = match_color(h, fills, cfg['matchDE'])
        if e is None:
            unmatched[h] = unmatched.get(h, 0) + 1; continue
        g = drawing_geom(d)
        if g is not None: items.append((e['cls'], g))
    return items, unmatched, alias_used


def vector_zones(m, fills, cfg, warnings):
    """범례색 채움 도형 → {cls: 면}. 뒤에 그린 다른 분류 도형에 가린 부분은 뺀다(화가 알고리즘)."""
    aliases = cfg.get('aliases') or {}
    items, unmatched, alias_used = vector_items(m, fills, cfg)
    if not items: raise ValueError(f"{m['id']}: 범례색 채움 도형이 하나도 없음")
    tree = STRtree([g for _, g in items])
    by_cls = {}
    for i, (c, g) in enumerate(items):
        later = [j for j in tree.query(g) if j > i and items[j][0] != c]
        if later: g = g.difference(unary_union([items[j][1] for j in later]))
        g = polygonal(g)
        if g is not None: by_cls.setdefault(c, []).append(g)
    for h in set(aliases) - set(alias_used): warnings.append(f'색 대응 {h} 가 쓰이지 않음')
    return ({c: polygonal(unary_union(gs)) for c, gs in by_cls.items()},
            {'fills': len(items), 'aliases': alias_used,
             'unmatchedColors': dict(sorted(unmatched.items(), key=lambda kv: -kv[1])[:UNMATCHED_REPORT_N])})


def raster_zones(m, fills, cfg, warnings):
    """이미지만 렌더 → 화소를 가장 가까운 범례색(Lab ΔE ≤ rasterDE)으로, 흰 바다 제외, 미분류 육지는 가까운 분류로,
    작은 얼룩(sievePx) 흡수, 바다 쪽 growPt 띠도 채운 뒤 다각형."""
    import cv2
    from PIL import Image
    from rasterio import features as rf
    from affine import Affine
    os.makedirs(f'{WORK}/c1', exist_ok=True)
    png = f"{WORK}/c1/{m['id']}-img.png"
    _, _, dpi = pdfkit.render_clip(m['page'], m['bbox'], cfg.get('dpi', 150), png, images_only=True)
    im = cv2.medianBlur(np.array(Image.open(png).convert('RGB')), TILE_SEAM_KERNEL)
    s = dpi / 72; x0, y0 = m['bbox'][0], m['bbox'][1]
    L = lab(im)
    dist = np.stack([np.linalg.norm(L - np.array(lab_hex(e['color'])), axis=-1) for e in fills], -1)
    k = dist.argmin(-1); dmin = dist.min(-1)
    white = np.linalg.norm(L - lab([255, 255, 255]), axis=-1) < cfg['whiteDE']
    sea = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((TILE_SEAM_KERNEL,) * 2, np.uint8)) > 0
    lbl = np.where((dmin < cfg['rasterDE']) & ~sea, k + 1, 0).astype(np.int32)
    for b in excluded_boxes(m):
        c0, r0 = max(int((b[0] - x0) * s), 0), max(int((b[1] - y0) * s), 0)
        c1, r1 = max(int((b[2] - x0) * s) + 1, 0), max(int((b[3] - y0) * s) + 1, 0)
        lbl[r0:r1, c0:c1] = 0; sea[r0:r1, c0:c1] = True
    classified = int((lbl > 0).sum()); land = int((~sea).sum())
    pct = round(100 * classified / max(land, 1), 1)
    if pct < MIN_VALID_LAND_PCT: warnings.append(f'래스터 분류율 {pct}% < {MIN_VALID_LAND_PCT}%')
    src = (lbl == 0).astype(np.uint8)
    dd, idx = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(idx.max() + 1, np.int32); lut[idx[src == 0]] = lbl[src == 0]
    near = lut[idx]
    full = np.where((~sea & (dd < UNCLASSIFIED_FILL_PT * s)) | (sea & (dd <= cfg['growPt'] * s)), near, 0)
    full = np.where(lbl > 0, lbl, full).astype(np.int32)
    full = rf.sieve(full, size=cfg['sievePx'], connectivity=8, mask=full > 0)
    tf = Affine(1 / s, 0, x0, 0, 1 / s, y0)
    parts = {}
    for geom, v in rf.shapes(full.astype(np.int32), mask=full > 0, transform=tf, connectivity=8):
        parts.setdefault(int(v), []).append(shapely.geometry.shape(geom))
    zones = {fills[v - 1]['cls']: polygonal(unary_union(gs)) for v, gs in parts.items()}
    return {c: g for c, g in zones.items() if g is not None}, {'dpi': dpi, 'landPx': land, 'classifiedPx': classified, 'classifiedPct': pct}


def hatch_zone(m, hcfg):
    """빗금 분류: 윤곽 선(hcfg.stroke 색 획) → 면."""
    ex = excluded_boxes(m) + [hcfg['swatch']]
    gs = []
    for d in drawings(m['page']):
        if hexc(d.get('color')) != hcfg['stroke'] or d.get('fill') is not None: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        gs += [g for g in (polygonal(Polygon(R)) for R in rings(d)) if g is not None]
    return polygonal(unary_union(gs).intersection(box(*m['bbox']))) if gs else None


def finish_zones(m, zones, order, cfg, domain=None):
    """틀(덮개 상자 제외, 경위도로 바꿀 수 있는 범위 domain)로 자르고, 빈 곳으로 growPt 넓히고(앞 분류 우선),
    작은 조각(sliverPt2) 버리고, 긴 변을 densifyPt 로 나눈다. 결과 분류들은 서로 겹치지 않는다."""
    fr = frame(m)
    if domain is not None: fr = fr.intersection(domain)
    zones = {c: polygonal(g.intersection(fr)) for c, g in zones.items() if g is not None}
    zones = {c: g for c, g in zones.items() if g is not None}
    taken = unary_union(list(zones.values())) if zones else None
    out = {}
    for c in order:
        g = zones.get(c)
        if g is None: continue
        ext = polygonal(g.buffer(cfg['growPt'], join_style='mitre').intersection(fr).difference(taken))
        if ext is not None:
            taken = taken.union(ext); g = polygonal(g.union(ext))
        g = drop_small(g, cfg['sliverPt2'])
        if g is not None: out[c] = shapely.segmentize(g, cfg['densifyPt'])
    return out
