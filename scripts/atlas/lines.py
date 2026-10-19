# © 2026 김용현
# scripts/atlas/lines.py — 선 레이어(지면 pt): 등온선(값 붙은 선), 교역 흐름선(상대국 끝점 → 우리나라)
import heapq, re
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from atlas_common import drawings, spans, yc, hexc, stroke_paths, drawing_geom, inside, overlaps, excluded_boxes, in_map, rect

ISOTHERM_PASSES = 5   # 글자 없는 등온선 조각이 이웃 조각 값을 물려받는 되풀이 수
FLOW_CENTER_COST = 6.0   # 자기 방향 띠 안 화소 비용 = 1 + 이 값/(1 + 가장자리까지 거리) → 띠 가운데가 가장 싸다
FLOW_OTHER_COST = 8.0    # 다른 방향 띠 화소 비용(겹친 곳을 지나갈 때)
FLOW_GAP_COST = 12.0     # 조각 사이 틈·허브 둘레 화소 비용
FLOW_GAP_DILATE_PX = 5   # 조각 사이 틈을 잇는 팽창 크기(화소, 6px/pt 에서 약 0.4pt)
FLOW_FALLBACK_FRAC = 0.6 # 굵기 잴 구간이 너무 짧으면 상대국 쪽 이 비율만큼을 쓴다


def isotherms(m, ic, warnings):
    """ic.color 획 → 선 조각, ic.labelRe 숫자 글자가 labelDistPt 안에 있는 조각에 값. 글자 없는 조각은 끝점이 joinPt 안에 닿는 조각 값을 물려받는다."""
    ex = excluded_boxes(m)
    lines = []
    for d in drawings(m['page']):
        if d['type'] != 's' or hexc(d.get('color')) != ic['color']: continue
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b) for b in ex): continue
        lines += [{'P': P, 'votes': {}} for P in stroke_paths(d)]
    if not lines: raise ValueError(f"{m['id']}: 등온선(색 {ic['color']})이 없음")
    rx = re.compile(ic['labelRe'])
    labels = [t for t in spans(m['page']) if inside(rect(t['bbox']), m['bbox'], 0) and rx.fullmatch(t['text'])
              and not any(overlaps(rect(t['bbox']), b) for b in ex)]
    for t in labels:
        c = Point((t['bbox'][0] + t['bbox'][2]) / 2, yc(t['bbox']))
        v = int(t['text'].replace('−', '-'))
        for L in lines:
            if LineString(L['P']).distance(c) < ic['labelDistPt']: L['votes'][v] = L['votes'].get(v, 0) + 1
    for L in lines:
        L['value'] = max(L['votes'], key=L['votes'].get) if L['votes'] else None
    for _ in range(ISOTHERM_PASSES):
        for L in lines:
            if L['value'] is not None: continue
            for o in lines:
                if o['value'] is not None and min(np.hypot(*(a - b)) for a in (L['P'][0], L['P'][-1]) for b in (o['P'][0], o['P'][-1])) < ic['joinPt']:
                    L['value'] = o['value']; break
    unl = sum(L['value'] is None for L in lines)
    if unl: warnings.append(f'값 없는 등온선 조각 {unl}개')
    out = [{'points': np.round(L['P'], 3).tolist(), 'cls': 'isotherm', 'kind': 'isotherm', 'color': ic['color'], 'value': L['value'],
            'label': None if L['value'] is None else f"{L['value']}{ic['unit']}"} for L in lines]
    return out, {'isothermPieces': len(lines), 'isothermLabels': len(labels), 'unlabelled': unl}


def _dijkstra(passable, cost, src):
    """가면 화소 위 8방향 다익스트라(src 하나에서 전부) → prev 사전."""
    H, W = passable.shape
    dist = {src: 0.0}; prev = {src: None}; pq = [(0.0, src)]
    steps = [(dr, dc, 1.4142 if dr and dc else 1.0) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if dr or dc]
    while pq:
        d, p = heapq.heappop(pq)
        if d > dist[p]: continue
        r, c = p
        for dr, dc, w in steps:
            q = (r + dr, c + dc)
            if not (0 <= q[0] < H and 0 <= q[1] < W) or not passable[q]: continue
            nd = d + w * cost[q]
            if nd < dist.get(q, 1e18):
                dist[q] = nd; prev[q] = p; heapq.heappush(pq, (nd, q))
    return prev


def flows(m, fc, legend_widths, densify_pt, warnings):
    """교과서 화살표는 겹치는 곳마다 색을 바꿔 칠한 조각 수백 개라 도형 하나 ≠ 흐름선 하나.
    상대국 끝점(fc.classes[*].partners, 수출 = 화살촉 끝, 수입 = 꼬리 끝)에서 같은 방향 조각을 합친 가면 위 최단 경로
    (띠 가운데 우선, 우리나라에서 한 번 다익스트라)로 선을 만들고, 굵기 = 상대국 쪽 구간 거리 변환 중앙값 × 2 →
    범례 견본 굵기(legend_widths: [(pt, 이름)]) 중 가장 가까운 단계."""
    import cv2
    from rasterio import features as rf
    from affine import Affine
    s = fc['maskPxPerPt']
    x0, y0, x1, y1 = m['bbox']
    W, H = int((x1 - x0) * s) + 1, int((y1 - y0) * s) + 1
    tf = Affine(1 / s, 0, x0, 0, 1 / s, y0)
    topx = lambda p: (int((p[1] - y0) * s), int((p[0] - x0) * s))
    toxy = lambda rc: [x0 + (rc[1] + 0.5) / s, y0 + (rc[0] + 0.5) / s]
    masks = {}
    for ckey, cc in fc['classes'].items():
        gs = [g for g in (drawing_geom(d) for d in drawings(m['page']) if hexc(d.get('fill')) in cc['fills'] and in_map(d, m)) if g is not None]
        if not gs: raise ValueError(f"{m['id']}: '{cc['label']}' 흐름선 조각이 없음")
        masks[ckey] = rf.rasterize([(unary_union(gs).buffer(0.05), 1)], out_shape=(H, W), transform=tf, fill=0, dtype='uint8')
    hubdisc = np.zeros((H, W), np.uint8)
    cv2.circle(hubdisc, (int((fc['hub'][0] - x0) * s), int((fc['hub'][1] - y0) * s)), int(fc['hubRadiusPt'] * s), 1, -1)
    allm = np.zeros((H, W), np.uint8)
    for v in masks.values(): allm |= v
    out, rep = [], {}
    w_lo, w_hi = fc['widthWindow']
    for ckey, cc in fc['classes'].items():
        own = masks[ckey]
        # 지나갈 수 있는 곳 = 모든 흐름선 + 허브 둘레, 조각 사이 틈은 2화소 팽창으로 잇는다. 자기 방향 띠 가운데가 가장 싸다.
        passable = cv2.dilate(allm | hubdisc, np.ones((FLOW_GAP_DILATE_PX,) * 2, np.uint8))
        dt = cv2.distanceTransform(own, cv2.DIST_L2, 5)
        cost = np.where(own > 0, 1.0 + FLOW_CENTER_COST / (1.0 + dt), np.where(allm > 0, FLOW_OTHER_COST, FLOW_GAP_COST))
        hub = topx(fc['hub'])
        prev = _dijkstra(passable, cost, hub)
        ys, xs = np.nonzero(own)
        rows = []
        for name, end in cc['partners']:
            r, c = topx(end); k = int(np.argmin((ys - r) ** 2 + (xs - c) ** 2))
            e = (int(ys[k]), int(xs[k])); gap = float(np.hypot(ys[k] - r, xs[k] - c) / s)
            if gap > fc['maxSnapPt']: raise ValueError(f"{m['id']}: {cc['label']} {name} 끝점이 흐름선에서 {gap:.2f}pt 떨어짐(> {fc['maxSnapPt']})")
            if e not in prev: raise ValueError(f"{m['id']}: {cc['label']} {name} 끝점에서 우리나라까지 길이 없음")
            path = [e]
            while prev[path[-1]] is not None: path.append(prev[path[-1]])   # 상대국 → 허브
            P = np.array([toxy(rc) for rc in path])
            seg = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
            L = seg[-1]
            sel = (seg >= min(fc['widthSkipEndPt'], w_lo * L)) & (seg <= w_hi * L)
            if sel.sum() < 3: sel = seg <= FLOW_FALLBACK_FRAC * L
            width = 2 * float(np.median([dt[rc] for rc, ok in zip(path, sel) if ok])) / s
            ki = int(np.argmin([abs(width - w) for w, _ in legend_widths]))
            pts = np.array(LineString([list(fc['hub'])] + P[::-1].tolist()).simplify(fc['simplifyPt']).coords)   # 허브 → 상대국
            if ckey == 'import': pts = pts[::-1]                                                                 # 상대국 → 우리나라
            out.append({'points': np.round(shapely.segmentize(LineString(pts), densify_pt).coords, 3).tolist(),
                        'cls': ckey, 'kind': cc['label'], 'dir': 'to-korea' if ckey == 'import' else 'from-korea',
                        'color': cc['legendColor'], 'label': name, 'widthPt': round(width, 2),
                        'value': legend_widths[ki][1], 'valueRank': ki + 1, 'width': legend_widths[ki][0], 'lengthPt': round(float(L), 1)})
            rows.append({'partner': name, 'widthPt': round(width, 2), 'value': legend_widths[ki][1], 'snapPt': round(gap, 2)})
        rep[ckey] = rows
    return out, rep
