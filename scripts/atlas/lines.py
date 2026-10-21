# © 2026 김용현
# scripts/atlas/lines.py — 선 레이어(지면 pt): 등온선(값 붙은 선), 교역 흐름선(상대국 끝점 → 우리나라), 경로 화살표(채운 화살대 + 화살촉 → 가운데 선, U5-4)
import heapq, re
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from atlas_common import drawings, spans, yc, hexc, stroke_paths, drawing_geom, inside, overlaps, excluded_boxes, in_map, rect, rings

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


PATH_FLOW_SHAFT_W = (0.3, 1.2)   # 화살대(채운 가는 띠)의 평균 너비(2 × 넓이 / 둘레) 범위 pt — 같은 색 식민지 면 조각과 가름(설정 shaftWidthPt 로 좁힘)
PATH_FLOW_SHAFT_MIN_L = 6.0   # 화살대 길이(둘레 / 2) 하한 pt — 화살촉(약 5pt)보다 길게
PATH_FLOW_HEAD_AREA = (1.0, 15.0)   # 화살촉 넓이 범위 pt²(설정 headAreaPt2 로 좁힘)
PATH_FLOW_HEAD_NEAR = 3.5     # 화살대 끝 ↔ 화살촉 넓이 중심 거리 상한 pt(설정 headNearPt)
PATH_FLOW_DASH_MAX = 3.5      # 점선 화살대 한 토막의 긴 변 상한 pt(토막 4개 이상인 그리기 하나 = 점선 화살대)


def _resample(P, n):
    P = np.asarray(P, float)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    t = np.linspace(0, d[-1], n)
    return np.c_[np.interp(t, d, P[:, 0]), np.interp(t, d, P[:, 1])]


def band_centerline(R, step=0.5):
    """채운 가는 띠(화살대 — 한 고리) → (가운데 선 점 배열(한 끝 → 다른 끝), 평균 너비 pt — 2 × 넓이 / 둘레, 긴 띠에서 정확).
    두 끝 = 고리에서 서로 가장 먼 두 점(첫 점에서 가장 먼 점 → 그 점에서 가장 먼 점), 고리를 두 끝에서 두 변으로 나눠 길이 비로 짝지어 평균."""
    P = np.asarray(R, float)
    if len(P) > 1 and np.allclose(P[0], P[-1]): P = P[:-1]
    i = int(np.argmax(np.hypot(*(P - P[0]).T))); j = int(np.argmax(np.hypot(*(P - P[i]).T)))
    i, j = min(i, j), max(i, j)
    a = P[i:j + 1]; b = np.r_[P[j:], P[:i + 1]][::-1]
    L = max(np.hypot(*np.diff(a, axis=0).T).sum(), np.hypot(*np.diff(b, axis=0).T).sum())
    n = max(3, int(np.ceil(L / step)) + 1)
    A, B = _resample(a, n), _resample(b, n)
    area = abs(np.dot(P[:, 0], np.roll(P[:, 1], -1)) - np.dot(P[:, 1], np.roll(P[:, 0], -1))) / 2
    per = float(np.hypot(*(np.roll(P, -1, axis=0) - P).T).sum())
    return (A + B) / 2, float(2 * area / per)   # 너비 = 2 × 넓이 / 둘레(끝이 뾰족해도 치우치지 않음)


def dash_centerline(pieces, tip_hint):
    """점선 화살대 토막(고리들) → 토막 넓이 중심을 이웃 차례로 이은 선. 시작 = tip_hint(화살촉 쪽 끝)에서 가장 먼 토막."""
    C = np.array([np.asarray(R, float).mean(axis=0) for R in pieces])
    k = int(np.argmax(np.hypot(*(C - np.asarray(tip_hint, float)).T)))
    order, left = [k], set(range(len(C))) - {k}
    while left:
        q = min(left, key=lambda t: float(np.hypot(*(C[t] - C[order[-1]]))))
        order.append(q); left.discard(q)
    return C[order]


def path_flows(m, cfg, warnings):
    """46쪽 지구본 인구 이동 화살표(U5-4, mode 'path-flow'): 설정 flows [{cls, fill, label, dashed?}] — 계열마다 그 채움 색 도형 중
    가는 띠(화살대 — 너비 shaftWidthPt 범위, 길이 ≥ PATH_FLOW_SHAFT_MIN_L)·점선 토막 묶음(dashed — 작은 토막 4개 이상인 그리기 하나)·점선 획(dashed — 획 색 = fill, 화살촉을 나눠 써도 됨)을 화살대로, 화살대 끝 가까운 작은 도형을
    화살촉으로 짝지어 → [{cls, points(꼬리 → 화살 끝, stepPt 간격 지면 pt), dashed, widthPt, tip}]. 같은 색 식민지 면(굵은 면)은 너비로, 가는 면 조각은
    화살촉이 없어 걸러짐(경고). 설정 expectFlows {cls: 수} 와 다른 수는 멈춤."""
    from shapely.geometry import Polygon
    from atlas_common import polygonal
    step = cfg.get('stepPt', 0.5)
    sw, ha = cfg.get('shaftWidthPt') or PATH_FLOW_SHAFT_W, cfg.get('headAreaPt2') or PATH_FLOW_HEAD_AREA
    near = cfg.get('headNearPt') or PATH_FLOW_HEAD_NEAR
    ex = excluded_boxes(m)
    out, rep = [], {}
    for fc in cfg['flows']:
        shafts, small = [], []
        for d in drawings(m['page']):
            if fc['fill'] not in (hexc(d.get('fill')), hexc(d.get('color')) if fc.get('dashed') else None) or not in_map(d, m) or any(inside(d['rect'], b) for b in ex): continue
            rs = [np.asarray(R, float) for R in rings(d) if len(R) >= 3]
            if fc.get('dashed') and d['type'] == 's' and d.get('dashes') and d['dashes'] != '[] 0':   # 점선 획 화살대(노예 이동 넷 중 둘)
                shafts += [{'line': np.asarray(P, float)} for P in stroke_paths(d) if len(P) >= 2]; continue
            if fc.get('dashed') and len(rs) >= 4 and all(max(np.ptp(R[:, 0]), np.ptp(R[:, 1])) <= PATH_FLOW_DASH_MAX for R in rs):
                shafts.append({'dash': rs}); continue
            for R in rs:
                g = polygonal(Polygon(R).buffer(0))
                if g is None: continue
                w, L = 2 * g.area / g.length, g.length / 2
                if not fc.get('dashed') and sw[0] <= w <= sw[1] and L >= PATH_FLOW_SHAFT_MIN_L: shafts.append({'ring': R})   # 화살촉(길이 약 5pt)은 길이로 빠짐
                elif ha[0] <= g.area <= ha[1]: small.append(g)
        # 화살대마다 가운데 선·두 끝 → (끝 ↔ 화살촉 넓이 중심) 거리가 짧은 짝부터 차례로(화살대·화살촉 한 번씩) — 가까운 식민지 면 가는 조각이 남의 화살촉을 가져가지 않게
        for sh in shafts:
            if 'line' in sh:
                sh['P'], sh['w'] = sh['line'], None
                sh['ends'] = [sh['P'][0], sh['P'][-1]]
            elif 'ring' in sh:
                sh['P'], sh['w'] = band_centerline(sh['ring'], step)
                sh['ends'] = [sh['P'][0], sh['P'][-1]]
            else:
                C = np.array([R.mean(axis=0) for R in sh['dash']])
                D = np.hypot(C[:, None, 0] - C[None, :, 0], C[:, None, 1] - C[None, :, 1])
                i, j = np.unravel_index(int(np.argmax(D)), D.shape)
                sh['P'], sh['ends'] = None, [C[i], C[j]]
                sh['w'] = float(np.median([2 * g.area / g.length for g in (Polygon(R).buffer(0) for R in sh['dash'])]))
        cand = sorted((float(np.hypot(*(np.asarray(g.centroid.coords[0]) - e))), si, hi, ei)
                      for si, sh in enumerate(shafts) for hi, g in enumerate(small) for ei, e in enumerate(sh['ends']))
        pair, used = {}, set()
        for dd, si, hi, ei in cand:
            if dd > near: break
            if si in pair or hi in used or 'line' in shafts[si]: continue   # 점선 획은 아래에서(나눠 쓰기)
            pair[si] = (hi, ei); used.add(hi)
        for dd, si, hi, ei in cand:   # 점선 획 화살대는 화살촉을 다른 화살표와 나눠 써도 됨(46쪽 브라질 — 두 점선이 한 화살촉으로 모임)
            if dd <= near and si not in pair and 'line' in shafts[si]: pair[si] = (hi, ei)
        rows = []
        for si, sh in enumerate(shafts):
            if si not in pair:   # 화살촉이 없는 가는 띠 = 같은 색 식민지 면의 가는 조각(화살표 수는 expectFlows 로 확인)
                warnings.append(f"{fc['label']}: 화살촉 없는 가는 띠 {np.round(sh['ends'], 1).tolist()} — 화살표 아님(식민지 면 조각)"); continue
            hi, ei = pair[si]
            head, end, P, w = small[hi], sh['ends'][ei], sh['P'], sh['w']
            if w is None:   # 점선 획: 획 굵기
                w = float(cfg.get('strokeWidthPt', 0.6))
            if P is None: P = dash_centerline(sh['dash'], end)
            elif ei == 0: P = P[::-1]
            H = np.asarray(head.exterior.coords)
            tip = H[int(np.argmax(np.hypot(*(H - P[-1]).T)))]
            line = LineString(np.r_[P, [tip]])
            pts = np.round(np.asarray(shapely.segmentize(line, step).coords), 3).tolist()
            out.append({'points': pts, 'cls': fc['cls'], 'kind': fc['label'], 'color': fc['fill'], 'dashed': bool(fc.get('dashed')),
                        'widthPt': round(w, 2), 'tip': [round(float(tip[0]), 2), round(float(tip[1]), 2)]})
            rows.append({'from': [round(float(v), 1) for v in P[0]], 'tip': out[-1]['tip'], 'lengthPt': round(line.length, 1), 'widthPt': round(w, 2)})
        exp = (cfg.get('expectFlows') or {}).get(fc['cls'])
        if exp is not None and len(rows) != exp: raise ValueError(f"{m['id']}: {fc['label']} 화살표 {len(rows)}개 ≠ expectFlows {exp}")
        rep[fc['cls']] = rows
    return out, rep
