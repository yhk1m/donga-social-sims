# © 2026 김용현
# scripts/atlas/line_chains.py — 조각으로 그린 선(지면 pt) → 이은 선(U6-4, 설정 lineChains 가 있을 때만 features.py 가 부름 — u2~u5 설정에 그 키 없음)
#   교과서 극 지도(50·51쪽)·영유권 지도(55쪽)의 선은 획(stroke)이 아니라 작은 채움 조각으로 그린 것이 많다:
#   파선 = 짧은 채움 토막, 물결 선(유빙 한계) = 물결 한 마디씩 채운 조각, 점선(배타적 경제 수역) = 점 고리 수백 개를 든 채움 하나,
#   해양 경계 = 그림자를 깐 짧은 막대. 같은 글자·선을 4~11번 겹쳐 그리고 겹친 판마다 색이 조금씩 다르다(50쪽).
#   → 설정 항목 하나 = 선 종류 하나: 색(fills·strokes)·조각 크기·항목 수·극 둘레 띠·상자로 조각을 고르고, 조각마다 끝 두 점
#   (긴 조각은 주축 양 끝, 짧은 조각은 가운데 한 점)을 구해 가까운 끝끼리(gapPt 안) 차례로 잇는다. 겹쳐 그린 판은 가운데 dedupPt 안이면 하나로.
#   항목: {label, color(화면 색), fills?:[색], strokes?:[색], strokeWidth?:[lo, hi], pieceMaxPt?(조각 상자 긴 변 상한, 채움 기본 12 — 획은 줄 때만), pieceMinPt?, pieceLenPt?:[lo, hi]·pieceMaxWidthPt?(채움 조각 주축 길이·폭 — 파선 토막),
#          minItems?, maxItems?(그리기 항목 수 — 물결 조각 ≥ 15 · 토막 ≤ 10 처럼 가름), ring?:{center:[x, y], r:[lo, hi], exclude?:[[lo, hi]]}(극 거리 띠 — exclude 는 그 안에서 뺄 거리), tangentialDeg?(ring 이 있을 때 — 긴 조각의 주축과 반지름 방향 사이 각이 이보다 작으면 뺌),
#          boxes?:[[x0, y0, x1, y1]](이 안의 조각만), excludeBoxes?, gapPt?(기본 6), minPts?(이은 선의 최소 점 수, 기본 2),
#          minLenPt?(이은 선 최소 길이, 기본 0), dedupPt?(기본 0.4), dashed?, rings?(참이면 채움 하나를 고리마다 조각으로 — 점선 하나가 채움 하나), fillDE?(fills 첫 색과 ΔE 안이면 같은 색),
#          strokeDashes?:['[ 5 1.5 ] 0', …](획 파선 무늬), legend?(false 면 범례 항목 없음 — 지시선·날짜 변경선)}
#   결과 lines [{points, cls, kind:'line', color, dashed?, label}], legend [{cls, color, kind:'line', label, dashed?}]
import math
import numpy as np
from atlas_common import drawings, hexc, rings, stroke_paths, overlaps, inside, excluded_boxes, delta_e


def _near(h, cols, tol=2):
    """색 hex 가 목록의 어느 색과 채널마다 tol 안인가(조사 도구와 atlas_common.hexc 의 반올림 차 1 을 받음)"""
    if h is None: return False
    a = [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    return any(all(abs(x - int(c[i:i + 2], 16)) <= tol for x, i in zip(a, (1, 3, 5))) for c in cols)


def piece_ends(P):
    """점 배열(고리·꺾은선) → (끝 a, 끝 b, 길이, 폭). 주축(SVD) 방향으로 긴 조각은 주축 위 양 끝, 짧은(길이 ≤ 2 × 폭) 조각은 가운데 한 점."""
    P = np.asarray(P, float)
    if len(P) > 2 and np.allclose(P[0], P[-1]): P = P[:-1]
    c = P.mean(0)
    if len(P) < 2: return c, c, 0.0, 0.0
    _, _, vt = np.linalg.svd(P - c, full_matrices=False)
    u = vt[0]
    a = (P - c) @ u
    w = (P - c) @ vt[1] if vt.shape[0] > 1 else np.zeros(len(P))
    L, W = a.max() - a.min(), w.max() - w.min()
    if L <= max(2 * W, 0.5): return c, c, float(L), float(W)
    return c + u * a.min(), c + u * a.max(), float(L), float(W)


def chain(pieces, gap):
    """조각 [(a, b)] → 이은 점 목록들. 끝이 가장 외로운 조각(이웃 끝이 gap 안에 가장 적은)부터, 가까운 끝(gap 안)의 조각을 차례로 붙임."""
    n = len(pieces)
    if not n: return []
    E = np.array([p for a, b in pieces for p in (a, b)])        # 끝 2n 개 (2i = a, 2i+1 = b)
    used = np.zeros(n, bool)

    def nearest(pt, own):
        d = np.hypot(*(E - pt).T)
        d[np.repeat(used, 2)] = np.inf
        d[2 * own:2 * own + 2] = np.inf
        j = int(np.argmin(d))
        return (j, d[j]) if d[j] <= gap else (None, None)

    near = lambda q: int((np.hypot(*(E - q).T) <= gap).sum())   # 한 줄씩(2n × 2n 표를 만들지 않음 — 메모리)
    deg = np.array([near(E[2 * i]) + near(E[2 * i + 1]) - 2 for i in range(n)])
    out = []
    for i in np.argsort(deg, kind='stable'):
        if used[i]: continue
        used[i] = True
        a, b = pieces[i]
        line = [a] if np.allclose(a, b) else [a, b]
        for end in ('tail', 'head'):
            cur = i
            while True:
                pt = line[-1] if end == 'tail' else line[0]
                j, _ = nearest(pt, cur)
                if j is None: break
                k = j // 2; used[k] = True; cur = k
                pa, pb = pieces[k]
                seq = [pa] if np.allclose(pa, pb) else ([pa, pb] if j % 2 == 0 else [pb, pa])
                if end == 'tail': line.extend(seq)
                else: line[:0] = seq[::-1]
        out.append(line)
    return out


def _pieces(m, spec):
    fills = set(spec.get('fills') or []); strokes = set(spec.get('strokes') or [])
    fde, ref = spec.get('fillDE'), (spec.get('fills') or [None])[0]   # 겹쳐 그린 판마다 색이 조금씩 다른 선(50·51쪽 날짜 변경선 검은 토막): 첫 색과 ΔE 안이면 같은 선
    dashes = set(spec.get('strokeDashes') or [])                       # 획 파선 무늬로 가름(같은 색 국경선 · 지시선 · 날짜 변경선)
    wlo, whi = spec.get('strokeWidth') or (0, 99)
    mx, mn = spec.get('pieceMaxPt', 12), spec.get('pieceMinPt', 0)
    lo_it, hi_it = spec.get('minItems', 0), spec.get('maxItems', 10 ** 9)
    ring = spec.get('ring'); boxes = spec.get('boxes'); ex = excluded_boxes(m) + (spec.get('excludeBoxes') or [])
    out = []
    for d in drawings(m['page']):
        r = d['rect']
        if not overlaps(r, m['bbox']) or any(inside(r, b, 0) for b in ex): continue
        if boxes and not any(inside(r, b, 0) for b in boxes): continue
        if d.get('fill') is not None and (_near(hexc(d['fill']), fills) or (fde and delta_e(hexc(d['fill']), ref) <= fde)):
            parts = rings(d) if spec.get('rings') else [np.vstack(rings(d))] if rings(d) else []
            if not (lo_it <= len(d['items']) <= hi_it) and not spec.get('rings'): continue
        elif d.get('color') is not None and d['type'] in ('s', 'fs') and _near(hexc(d['color']), strokes) and wlo <= (d.get('width') or 0) <= whi \
                and (not dashes or d.get('dashes') in dashes):
            parts = stroke_paths(d)
        else:
            continue
        for P in parts:
            P = np.asarray(P, float)
            ext = (P.max(0) - P.min(0)).max()
            if (ext > mx and (d.get('fill') is not None or 'pieceMaxPt' in spec)) or ext < mn: continue   # 획(긴 선)은 pieceMaxPt 를 줄 때만 자름
            c = P.mean(0)
            if ring:
                rc = math.hypot(c[0] - ring['center'][0], c[1] - ring['center'][1])
                if not ring['r'][0] <= rc <= ring['r'][1]: continue
                if any(lo <= rc <= hi for lo, hi in ring.get('exclude') or []): continue   # 띠 안에서 뺄 거리(다른 선 — 북극권 파선 등)
            if not (m['bbox'][0] <= c[0] <= m['bbox'][2] and m['bbox'][1] <= c[1] <= m['bbox'][3]): continue
            if any(b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3] for b in ex): continue
            if d.get('fill') is not None:
                a, b, L, W = piece_ends(P)
                if spec.get('pieceLenPt') and not spec['pieceLenPt'][0] <= L <= spec['pieceLenPt'][1]: continue   # 파선 토막 길이
                if spec.get('pieceMaxWidthPt') is not None and W > spec['pieceMaxWidthPt']: continue            # 가는 토막만
            else: a, b = P[0], P[-1]
            if ring and spec.get('tangentialDeg') and not np.allclose(a, b):   # 극 둘레 선: 반지름 방향 조각(경선 토막)은 뺌
                v, rr = b - a, c - np.asarray(ring['center'], float)
                cosang = abs(float(v @ rr)) / (float(np.hypot(*v)) * float(np.hypot(*rr)) + 1e-12)
                if math.degrees(math.acos(min(1.0, cosang))) < spec['tangentialDeg']: continue
            out.append((a, b, c, P if d.get('fill') is None else None))
    return out


def dedup(pieces, tol):
    """겹쳐 그린 판(가운데가 tol 안)을 하나로 — 처음 것을 남김."""
    keep, cs = [], []
    for p in pieces:
        c = p[2]
        if cs and np.min(np.hypot(*(np.array(cs) - c).T)) <= tol: continue
        keep.append(p); cs.append(c)
    return keep


def line_chains(m, specs, warnings):
    """설정 lineChains → (legend, lines, report). 범례 차례 = 설정 차례(cls l1, l2 …)."""
    legend, lines, rep = [], [], {}
    for i, sp in enumerate(specs):
        if not sp.get('label') or not sp.get('color'): raise ValueError(f"{m['id']}: lineChains {i} 에 label·color 가 있어야 함")
        cls = f'l{i + 1}'
        e = {'cls': cls, 'color': sp['color'], 'kind': 'line', 'label': sp['label']}
        if sp.get('dashed'): e['dashed'] = True
        if sp.get('legend', True): legend.append(e)   # legend false: 범례 밖 선(지시선·날짜 변경선 — 교과서는 글자로만 이름)
        ps = dedup(_pieces(m, sp), sp.get('dedupPt', 0.4))
        strokes = [p for p in ps if p[3] is not None]
        # 획 조각은 점 배열 그대로 이어 붙이고(끝점끼리), 채움 조각은 끝 두 점으로
        chains = chain([(a, b) for a, b, _, P in ps if P is None], sp.get('gapPt', 6)) + _join_strokes([p[3] for p in strokes], sp.get('gapPt', 6))
        n0 = len(chains)
        keep = []
        for L in chains:
            L = np.asarray(L, float)
            ln = float(np.hypot(*np.diff(L, axis=0).T).sum()) if len(L) > 1 else 0.0
            if len(L) < sp.get('minPts', 2) or ln < sp.get('minLenPt', 0): continue
            keep.append(L)
        if not keep: warnings.append(f"선 {sp['label']}: 이은 선이 없음(조각 {len(ps)})")
        for L in keep:
            o = {'points': np.round(L, 3).tolist(), 'cls': cls, 'kind': 'line', 'color': sp['color'], 'label': sp['label']}
            if sp.get('dashed'): o['dashed'] = True
            lines.append(o)
        rep[sp['label']] = {'pieces': len(ps), 'chains': n0, 'kept': len(keep), 'points': int(sum(len(L) for L in keep))}
    return legend, lines, rep


def _join_strokes(paths, gap):
    """획 꺾은선들 → 끝점이 gap 안에서 닿는 것끼리 이음(방향 맞춤)."""
    if not paths: return []
    ends = [(np.asarray(P)[0], np.asarray(P)[-1]) for P in paths]
    order = chain(ends, gap)   # 끝점 사슬 — 점 차례로 다시 조각을 찾아 꺾은선을 붙임
    out = []
    for L in order:
        pts = []
        for k in range(0, len(L), 2):
            a = L[k]; b = L[k + 1] if k + 1 < len(L) else L[k]
            P = next(np.asarray(Q) for Q in paths if (np.allclose(Q[0], a) and np.allclose(Q[-1], b)) or (np.allclose(Q[0], b) and np.allclose(Q[-1], a)))
            seg = P if np.allclose(P[0], a) else P[::-1]
            pts.extend(seg.tolist() if not pts else seg[1:].tolist() if np.allclose(pts[-1], seg[0]) else seg.tolist())
        out.append(pts)
    return out


def stroke_flows(m, fc, cfg, warnings):
    """경로 화살표 중 획(stroke)으로 그린 것(U6-4 — 55쪽 북극 항로·아라온호, 설정 flows 항목 stroke 참, 있을 때만): 그 색 획 꺾은선 하나 = 화살표 하나
    (minLenPt 보다 짧은 획 — 파선 끝 조각 — 은 뺌). 방향(꼬리 → 화살 끝): 화살촉(같은 색 작은 채움, headFill·headMaxPt)에 가까운 끝이 화살 끝,
    화살촉이 없으면 headPt 에 가까운 끝. dashed = 그 획의 파선 무늬. → lines [{points, cls, kind, color, dashed, widthPt, tip}]"""
    import shapely
    from shapely.geometry import LineString
    step = cfg.get('stepPt', 0.5)
    ex = excluded_boxes(m)
    heads = []
    for d in drawings(m['page']):
        if d.get('fill') is None or not _near(hexc(d['fill']), [fc.get('headFill', fc['fill'])]) or not overlaps(d['rect'], m['bbox']): continue
        r = d['rect']
        if max(r.width, r.height) <= fc.get('headMaxPt', 3.0) and len(d['items']) <= fc.get('headMaxItems', 8):
            heads.append(np.array([(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]))
    out = []
    for d in drawings(m['page']):
        if d.get('color') is None or d['type'] not in ('s', 'fs') or not _near(hexc(d['color']), [fc['fill']]): continue
        if not overlaps(d['rect'], m['bbox']) or any(inside(d['rect'], b) for b in ex): continue
        dashed = bool(d.get('dashes')) and d['dashes'] != '[] 0'
        for P in stroke_paths(d):
            P = np.asarray(P, float)
            if float(np.hypot(*np.diff(P, axis=0).T).sum()) < fc.get('minLenPt', 2.0): continue
            a, b = P[0], P[-1]
            if heads:
                da, db = min(float(np.hypot(*(h - a))) for h in heads), min(float(np.hypot(*(h - b))) for h in heads)
                if min(da, db) > fc.get('headNearPt', 3.0): warnings.append(f"{fc['label']}: 화살촉 없는 획 {np.round(a, 1).tolist()}→{np.round(b, 1).tolist()}")
                if da < db: P = P[::-1]
            elif fc.get('headPt'):
                hp = np.asarray(fc['headPt'], float)
                if np.hypot(*(a - hp)) < np.hypot(*(b - hp)): P = P[::-1]
            pts = np.round(np.asarray(shapely.segmentize(LineString(P), step).coords), 3).tolist()
            out.append({'points': pts, 'cls': fc['cls'], 'kind': fc['label'], 'color': fc['fill'], 'dashed': dashed if fc.get('dashed') is None else bool(fc['dashed']),
                        'widthPt': round(float(d.get('width') or 0.4), 2), 'tip': [round(float(pts[-1][0]), 2), round(float(pts[-1][1]), 2)]})
    return out   # 수 확인(expectFlows)은 features.py 가 획·채움을 합친 뒤
