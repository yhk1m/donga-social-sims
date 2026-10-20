# © 2026 김용현
# scripts/atlas/zones.py — 분류 면(지면 pt): 벡터 채움(화가 알고리즘), 래스터 화소 분류, 빗금 윤곽, 점무늬 면, 틀 자르기·빈 곳 넓히기
import os
import numpy as np
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
import pdfkit
from atlas_common import (WORK, drawings, hexc, hex_rgb, lab, lab_hex, match_color, rings, polygonal, drawing_geom, drop_small,
                          inside, overlaps, excluded_boxes, frame, rect)

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


def mask_fill_geom(m, mcfg):
    """래스터 위에 덮은 벡터 덮개(설정 rasterMask {fill: 색, minAreaPt2} — 29쪽: 래스터는 북아프리카·서아시아까지 그려져 있고
    유럽 밖 육지와 바다를 흰 채움 도형 하나(유럽 모양 구멍)로 가림) → 지면 면(지도 틀 안) 또는 None.
    이미지만 렌더(images_only)는 벡터를 지우므로 덮개를 다시 씌워야 유럽 밖 래스터가 분류되지 않는다."""
    gs = []
    for d in drawings(m['page']):
        if hexc(d.get('fill')) != mcfg['fill'] or not overlaps(d['rect'], m['bbox']): continue
        g = drawing_geom(d)
        if g is not None and g.area >= mcfg.get('minAreaPt2', 1000): gs.append(g)
    return polygonal(unary_union(gs).intersection(box(*m['bbox']))) if gs else None


FOREIGN_IMAGE_FRAC = 0.5   # 그림 넓이 중 지도 틀 안이 이 비율 미만이면 이웃 지도 그림


def map_images(m):
    """지도 틀과 겹치는 그림 → [(지면 상자, 이 지도 그림인가)] — 넓이의 반 이상이 틀 안이거나 틀의 반 이상을 덮으면 이 지도 것."""
    from shapely.geometry import box as _b
    fr = _b(*m['bbox']); out = []
    for i in pdfkit.doc()[m['page'] - 1].get_image_info():
        g = _b(*i['bbox'])
        if g.area <= 0 or not g.intersects(fr): continue
        inter = g.intersection(fr).area   # 그림 넓이의 반 이상이 틀 안이거나, 틀의 반 이상을 덮으면(29쪽 아이슬란드 삽입 = 본 지도 래스터 위) 이 지도 것
        out.append((list(i['bbox']), inter >= FOREIGN_IMAGE_FRAC * g.area or inter >= FOREIGN_IMAGE_FRAC * fr.area))
    return out


def small_images(m):
    """지도 틀과 겹치는 그림 중 가장 큰 것(지도 래스터)을 뺀 작은 그림의 지면 상자 목록(사진 핀·그림자·로고)."""
    info = [i for i in pdfkit.doc()[m['page'] - 1].get_image_info() if overlaps(rect(i['bbox']), m['bbox'])]
    if not info: return []
    big = max(info, key=lambda i: (i['bbox'][2] - i['bbox'][0]) * (i['bbox'][3] - i['bbox'][1]))
    return [list(i['bbox']) for i in info if i is not big]


def raster_protos(fills, aliases):
    """화소 분류 견본색: 범례색 + 설정 rasterAliases {지도 화소색 hex: 범례 이름}(지도 그림이 범례 견본과 다른 색으로 인쇄된 분류 —
    29쪽 사막 기후는 견본 #fff56d, 지도 #fed08f) → (색 목록, 색마다 fills 번호). '_' 로 시작하는 열쇠는 설명."""
    colors, owner = [e['color'] for e in fills], list(range(len(fills)))
    idx = {e['label']: i for i, e in enumerate(fills)}
    for h, label in (aliases or {}).items():
        if h.startswith('_'): continue
        if label not in idx: raise ValueError(f'rasterAliases {h}: 범례(화소 분류 후보)에 없는 이름 {label}')
        colors.append(h); owner.append(idx[label])
    return colors, owner


def coast_band(sea, n):
    """바다(bool)에 닿은 육지 n 화소 띠(bool) — 바다 흰색과 섞인 색이라 분류하지 않고 안쪽 분류로 채울 자리(rasterCoastPx)."""
    import cv2
    if n <= 0: return np.zeros(sea.shape, bool)
    band = (cv2.dilate(sea.astype(np.uint8), np.ones((2 * n + 1,) * 2, np.uint8)) > 0) & ~sea
    # 띠가 섬 전체를 덮는 작은 섬(페로 제도·셰틀랜드 조각 — 안쪽 화소가 없어 채울 분류가 없음)은 띠에서 뺀다: 지우면 섬이 통째로 사라짐
    k, comp = cv2.connectedComponents((~sea).astype(np.uint8), connectivity=8)
    inner = np.bincount(comp[~sea & ~band].ravel(), minlength=k)
    return band & (inner[comp] > 0)


def deblend_class(rgb, protos, white=(255, 255, 255)):
    """화소색 rgb 를 「견본색 c 와 흰색을 α 로 섞은 색」으로 볼 때 잔차가 가장 작은 견본 번호(작은 섬은 흰 바다와 섞여 옅어진 색이라
    그냥 Lab 거리로는 옅은 견본(지중해성 연두)에 끌림 — 29쪽 페로 제도 화소 (156,165,136) → 서안 해양성)."""
    p = np.asarray(rgb, float); w = np.asarray(white, float); best, bi = None, None
    for i, c in enumerate(protos):
        d = np.asarray(c, float) - w; dd = float(np.dot(d, d))
        a = 0.0 if dd == 0 else float(np.clip(np.dot(p - w, d) / dd, 0, 1))
        r = float(np.linalg.norm(w + a * d - p))
        if best is None or r < best: best, bi = r, i
    return bi


def rescue_islands(lbl, sea, rgb, protos, owner, min_px=4, max_px=2000):
    """분류된 화소가 하나도 없는 작은 육지 덩어리(29쪽 페로 제도 — 섬이 작아 화소가 모두 흰 바다와 섞인 옅은 색이라 rasterDE 를 못 넘음)를
    덩어리에서 가장 진한(흰색에서 먼) 화소를 deblend_class 로 견본에 맞춰 그 범례 분류(owner — 견본 → fills 번호)로 통째로 칠한다(제자리).
    min_px 보다 작은 점·max_px 보다 큰 덩어리·틀 가장자리에 닿은 덩어리(이웃 지도 그림이 걸친 띠 — 섬이 아님)는 둠. → 살린 덩어리 수"""
    import cv2
    k, comp = cv2.connectedComponents((~sea).astype(np.uint8), connectivity=8)
    has = np.bincount(comp[lbl > 0].ravel(), minlength=k) > 0
    size = np.bincount(comp.ravel(), minlength=k)
    far = np.linalg.norm(rgb.astype(float) - 255.0, axis=-1)
    edge = np.zeros(k, bool); edge[np.unique(np.concatenate([comp[0], comp[-1], comp[:, 0], comp[:, -1]]))] = True
    n = 0
    for c in range(1, k):
        if has[c] or edge[c] or not min_px <= size[c] <= max_px: continue
        m = comp == c
        i = int(np.argmax(np.where(m, far, -1)))
        lbl[m] = owner[deblend_class(rgb.reshape(-1, 3)[i], protos)] + 1; n += 1
    return n


def force_boxes(lbl, sea, force, boxes, masked):
    """작은 그림 상자(화소 (c0, r0, c1, r1)) 자리: 분류를 지우고 거리 제한 없이 채울 곳(force)으로 표시(제자리). 단 rasterMask 덮개 자리(masked)는
    바다로 남긴다 — 핀 상자가 덮개(유럽 밖·바다)에 걸쳐도 가려진 땅을 되살리지 않게."""
    for c0, r0, c1, r1 in boxes:
        b = np.zeros(lbl.shape, bool); b[r0:r1, c0:c1] = True
        op = b & ~masked
        lbl[b] = 0; sea[op] = False; force[op] = True


def edge_band(lbl, sea, e):
    """틀 가장자리 e 화소 띠를 바다로(lbl 0, sea True) — 제자리. e ≤ 0 이면 그대로(arr[-0:] 은 배열 전체라 다 덮는다)."""
    if e <= 0: return
    for arr, v in ((lbl, 0), (sea, True)):
        arr[:e, :] = v; arr[-e:, :] = v; arr[:, :e] = v; arr[:, -e:] = v


def fill_labels(lbl, sea, force, fill_px, grow_px):
    """화소 분류 lbl(0 = 미분류) → 채운 분류: 미분류 육지는 fill_px 안, 바다 쪽은 grow_px 띠까지, force 자리는 거리 제한 없이 가장 가까운 분류."""
    import cv2
    src = (lbl == 0).astype(np.uint8)
    if src.all(): return np.zeros(lbl.shape, np.int32)
    dd, idx = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    lut = np.zeros(idx.max() + 1, np.int32); lut[idx[src == 0]] = lbl[src == 0]
    near = lut[idx]
    full = np.where((~sea & (dd < fill_px)) | (sea & (dd <= grow_px)) | force, near, 0)
    return np.where(lbl > 0, lbl, full).astype(np.int32)


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
    colors, owner = raster_protos(fills, cfg.get('rasterAliases'))
    dist = np.stack([np.linalg.norm(L - np.array(lab_hex(c)), axis=-1) for c in colors], -1)
    k = np.asarray(owner)[dist.argmin(-1)]; dmin = dist.min(-1)
    white = np.linalg.norm(L - lab([255, 255, 255]), axis=-1) < cfg['whiteDE']
    sea = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((TILE_SEAM_KERNEL,) * 2, np.uint8)) > 0
    masked = np.zeros(sea.shape, bool)   # rasterMask 덮개 자리(유럽 밖) — 뒤의 작은 그림 채움이 되살리지 않게 기억
    if cfg.get('rasterMask'):
        mk = mask_fill_geom(m, cfg['rasterMask'])
        if mk is None: warnings.append('rasterMask: 덮개 채움 도형이 없음')
        else:
            masked = rf.rasterize([mk], out_shape=sea.shape, transform=Affine(1 / s, 0, x0, 0, 1 / s, y0), fill=0, default_value=1, dtype=np.uint8) > 0
            sea |= masked
    lbl = np.where((dmin < cfg['rasterDE']) & ~sea, k + 1, 0).astype(np.int32)
    px = lambda b: (max(int((b[0] - x0) * s), 0), max(int((b[1] - y0) * s), 0), max(int((b[2] - x0) * s) + 1, 0), max(int((b[3] - y0) * s) + 1, 0))
    force = np.zeros(lbl.shape, bool); coast = np.zeros(lbl.shape, bool)
    rescued = 0
    if cfg.get('rasterIslands'):   # 분류 화소가 없는 작은 섬(페로 제도)도 가장 진한 화소의 분류로 — 해안 띠 지우기 전에
        rescued = rescue_islands(lbl, sea, im, [hex_rgb(c) for c in colors], owner)
    if cfg.get('rasterCoastPx'):
        # 해안 띠(바다에 닿은 n 화소)는 바다 흰색과 섞인 색이라(초록 + 흰 = 지중해성 연두) 분류하지 않고 안쪽 분류로 채운다(29쪽 아이슬란드 해안)
        coast = coast_band(sea, int(cfg['rasterCoastPx']))
        lbl[coast] = 0
    if cfg.get('rasterForeignImages'):
        # 이웃 지도의 래스터가 틀 가장자리에 걸친 경우(29쪽 1월·7월 지도 왼쪽 0.6pt 에 기후 구분 래스터) — 대부분 틀 밖인 그림이 덮은 자리는
        # 바다로(이 지도의 래스터는 조각 그림 여러 장이라 「가장 큰 그림」으로 고를 수 없음). 그 자리에 이 지도 조각 그림이 겹치면 살림
        own = np.zeros(lbl.shape, bool); foreign = np.zeros(lbl.shape, bool)
        for b, mine in map_images(m):
            c0, r0, c1, r1 = px([max(b[0], x0), max(b[1], y0), min(b[2], m['bbox'][2]), min(b[3], m['bbox'][3])])
            (own if mine else foreign)[r0:r1, c0:c1] = True
        drop = foreign & ~own
        lbl[drop] = 0; sea[drop] = True
    if cfg.get('rasterIgnoreImages'):
        # 지도 위 작은 그림(사진 핀·그림자 — 29쪽 핀 4 + 아이슬란드 핀)은 이미지만 렌더에 남아 회색 그림자가 빙설 등으로 잡힌다 →
        # 그 상자는 분류하지 않고 거리 제한 없이 가장 가까운 분류로 채움(바다로 넘친 곳은 뒤에 육지 자르기가 뺌)
        force_boxes(lbl, sea, force, [px(b) for b in small_images(m)], masked)
    if cfg.get('rasterEdgePt'):
        # 틀 가장자리 띠(29쪽: 흰 덮개가 틀 끝까지 오지 않아 남는 1~2pt 래스터 띠 — 북아프리카·튀르키예·우랄 너머가 가는 띠로 새어 나옴)는 바다로
        edge_band(lbl, sea, int(round(cfg['rasterEdgePt'] * s)))
    for b in excluded_boxes(m):
        c0, r0 = max(int((b[0] - x0) * s), 0), max(int((b[1] - y0) * s), 0)
        c1, r1 = max(int((b[2] - x0) * s) + 1, 0), max(int((b[3] - y0) * s) + 1, 0)
        lbl[r0:r1, c0:c1] = 0; sea[r0:r1, c0:c1] = True
    classified = int((lbl > 0).sum()); land = int((~sea & ~force & ~coast).sum())
    pct = round(100 * classified / max(land, 1), 1)
    if pct < MIN_VALID_LAND_PCT: warnings.append(f'래스터 분류율 {pct}% < {MIN_VALID_LAND_PCT}%')
    full = fill_labels(lbl, sea, force, UNCLASSIFIED_FILL_PT * s, cfg['growPt'] * s)
    full = rf.sieve(full, size=cfg['sievePx'], connectivity=8, mask=full > 0)
    tf = Affine(1 / s, 0, x0, 0, 1 / s, y0)
    parts = {}
    for geom, v in rf.shapes(full.astype(np.int32), mask=full > 0, transform=tf, connectivity=8):
        parts.setdefault(int(v), []).append(shapely.geometry.shape(geom))
    zones = {fills[v - 1]['cls']: polygonal(unary_union(gs)) for v, gs in parts.items()}
    return {c: g for c, g in zones.items() if g is not None}, {'dpi': dpi, 'landPx': land, 'classifiedPx': classified, 'classifiedPct': pct, **({'rescuedIslands': rescued} if rescued else {})}


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


def dots_area(centers, spacing, fr=None, min_area=None):
    """점무늬 면(U4-3b, 39쪽 사하라 사막 — 교과서에 경계선이 없어 점 무리의 겉모양이 경계): 점 중심 [(x, y)] → 면.
    중심마다 spacing × 0.75 로 넓혀 합치고(이웃 점끼리 이어짐) spacing × 0.25 만큼 되줄여(닫기 — 바깥 점 중심에서 반 칸 밖이 경계),
    구멍은 메우고, min_area(기본 (3·spacing)²) 보다 작은 조각(동떨어진 점 몇 개)은 버린다. fr 이 있으면 그 틀로 자른다."""
    from shapely.geometry import Point
    if not centers: return None
    g = unary_union([Point(c).buffer(spacing * 0.75, 8) for c in centers]).buffer(-spacing * 0.25, 8)
    g = polygonal(g)
    if g is None: return None
    from atlas_common import flat_polygons
    g = polygonal(unary_union([Polygon(p.exterior) for p in flat_polygons(g)]))
    if g is not None and fr is not None: g = polygonal(g.intersection(fr))
    return drop_small(g, (3 * spacing) ** 2 if min_area is None else min_area) if g is not None else None


def dots_zone(m, dcfg):
    """점무늬 분류: 작은 원 채움(색 dcfg.color, 넓이 ≤ dcfg.maxPt2 기본 4pt²) 중심들 → dots_area(spacingPt). 견본 상자·덮개 상자 안 점은 뺀다."""
    ex = excluded_boxes(m) + [dcfg['swatch']]
    cs, mx = [], dcfg.get('maxPt2', 4.0)
    for d in drawings(m['page']):
        if hexc(d.get('fill')) != dcfg['color']: continue
        r = d['rect']
        if (r[2] - r[0]) * (r[3] - r[1]) > mx or not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        cs.append(((r[0] + r[2]) / 2, (r[1] + r[3]) / 2))
    return dots_area(cs, dcfg['spacingPt'], frame(m), dcfg.get('minPt2'))


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
