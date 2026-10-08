# © 2026 김용현
# scripts/atlas/charts_geom.py — 그래프 도형 읽기: 영역 안 채움·선 도형, 띠 칸 경계, 세로선 위 보이는 색(칠한 순서), 선 위 y,
# 원호(중심·반지름·쓸어 간 각).
#   fills(pno, bbox, color)       영역 안 채움 도형 [{i(칠한 순서), color, rect, d, geom?}]
#   strokes(pno, bbox, color)     영역 안 선 도형 [{i, color, width, n(마디 수), paths[점 배열]}]
#   hlines / vlines               가로·세로 곧은 선의 위치(눈금선·축선)
#   bar_segments(items, lo, hi)   한 줄로 이어 쌓은 칸 → 경계(겹침 가운데), 나중 칸에 덮인 칸은 뺀다
#   visible_runs(fills, x)        세로선 x 위에서 칠한 순서대로 덮어 보이는 색 구간 [{i,color,y0,y1}]
#   polyline_at(pts, x)           꺾은선 위 x 에서의 y (범위 밖이면 None)
#   arcs(d) / fit_circle / sweep_deg   채움 도형의 원호(이어진 곡선 마디) → 중심·반지름·각
import math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from atlas_common import drawings, drawing_geom, stroke_paths, bez, hexc


def _inside(r, b, tol):
    return r.x0 >= b[0] - tol and r.y0 >= b[1] - tol and r.x1 <= b[2] + tol and r.y1 <= b[3] + tol


def fills(pno, bbox, color=None, tol=1.0, geom=False):
    """영역(bbox) 안에 다 드는 채움 도형. color: '#rrggbb' 하나 또는 목록(없으면 모두). geom=True 면 shapely 면도."""
    cs = None if color is None else ({color} if isinstance(color, str) else set(color))
    out = []
    for i, d in enumerate(drawings(pno)):
        if d['type'] not in ('f', 'fs') or not _inside(d['rect'], bbox, tol): continue
        c = hexc(d.get('fill'))
        if cs is not None and c not in cs: continue
        r = d['rect']
        it = {'i': i, 'color': c, 'rect': [r.x0, r.y0, r.x1, r.y1], 'd': d}
        if geom: it['geom'] = drawing_geom(d)
        out.append(it)
    return out


def strokes(pno, bbox, color=None, tol=1.0):
    """영역 안 선 도형. n = 선 마디(l·c) 수 — 범례 견본 선(마디 1개)과 자료 선을 가르는 데 쓴다."""
    cs = None if color is None else ({color} if isinstance(color, str) else set(color))
    out = []
    for i, d in enumerate(drawings(pno)):
        if d['type'] not in ('s', 'fs') or not _inside(d['rect'], bbox, tol): continue
        c = hexc(d.get('color'))
        if cs is not None and c not in cs: continue
        r = d['rect']
        out.append({'i': i, 'color': c, 'width': d.get('width') or 0, 'rect': [r.x0, r.y0, r.x1, r.y1], 'd': d,
                    'n': sum(1 for it in d['items'] if it[0] in ('l', 'c')), 'paths': stroke_paths(d, steps=16)})
    return out


def _straight(pno, bbox, color, horizontal, min_len):
    """선 도형의 곧은 마디(l)와 사각형(re) 변 중 가로(또는 세로)인 것의 위치. 격자는 마디 여러 개를 한 경로로 그리기도 한다."""
    out = []
    for s in strokes(pno, bbox, color):
        for it in s['d']['items']:
            if it[0] == 'l': segs = [(it[1], it[2])]
            elif it[0] == 're':
                r = it[1]; segs = [((r.x0, r.y0), (r.x1, r.y0)), ((r.x0, r.y1), (r.x1, r.y1)), ((r.x0, r.y0), (r.x0, r.y1)), ((r.x1, r.y0), (r.x1, r.y1))]
            else: continue
            for a, b in segs:
                ax, ay = (a.x, a.y) if hasattr(a, 'x') else a
                bx, by = (b.x, b.y) if hasattr(b, 'x') else b
                if horizontal and abs(ay - by) < 0.05 and abs(ax - bx) >= min_len: out.append((ay + by) / 2)
                if not horizontal and abs(ax - bx) < 0.05 and abs(ay - by) >= min_len: out.append((ax + bx) / 2)
    return _dedup(sorted(out))


def hlines(pno, bbox, color=None, min_len=2.0):
    """영역 안 가로 곧은 선(마디·사각형 변)의 y 목록(정렬, 0.05pt 안 중복 제거)."""
    return _straight(pno, bbox, color, True, min_len)


def vlines(pno, bbox, color=None, min_len=1.5):
    """영역 안 세로 곧은 선의 x 목록."""
    return _straight(pno, bbox, color, False, min_len)


def _dedup(v, eps=0.05):
    out = []
    for x in v:
        if not out or x - out[-1] > eps: out.append(x)
    return out


def bar_segments(items, lo=None, hi=None, covered_frac=0.9):
    """한 줄로 이어 쌓은 칸 [{i(칠한 순서), x0, x1, …}] → 보이는 칸 [{…, x0, x1}] (x 순).
    - 나중에 칠한 칸들에 길이의 covered_frac 이상 덮인 칸은 버린다(띠 끝 '기타' 밑에 깔린 칸).
    - 이웃 칸 경계 = 앞 칸 끝과 뒤 칸 시작의 가운데(회색 칸끼리 0.1~0.2pt 겹쳐 그려져 있다).
    - lo·hi 가 있으면 첫 칸 시작·끝 칸 끝을 그 값으로 자른다(축 0·100 선)."""
    keep = []
    for a in items:
        later = sorted((max(a['x0'], b['x0']), min(a['x1'], b['x1'])) for b in items if b['i'] > a['i'])
        cov, end = 0.0, a['x0']
        for s, e in later:
            if e <= end: continue
            cov += e - max(s, end); end = e
        if a['x1'] - a['x0'] > 0 and cov >= covered_frac * (a['x1'] - a['x0']) and later: continue
        keep.append(dict(a))
    keep.sort(key=lambda s: (s['x0'], s['i']))
    for j in range(len(keep) - 1):
        m = (keep[j]['x1'] + keep[j + 1]['x0']) / 2
        keep[j]['x1'] = m; keep[j + 1]['x0'] = m
    if keep and lo is not None and abs(keep[0]['x0'] - lo) < 0.5: keep[0]['x0'] = lo
    if keep and hi is not None and abs(keep[-1]['x1'] - hi) < 0.5: keep[-1]['x1'] = hi
    return keep


def visible_runs(fl, x, eps=1e-6):
    """세로선 x 위에서 채움 도형(geom 필요)을 칠한 순서대로 덮어 보이는 구간 [{i, color, y0, y1}] (y 순, 이웃 같은 도형은 합침)."""
    from shapely.geometry import LineString
    segs = []   # (y0, y1, i, color) — 나중 것이 앞 것을 덮는다
    for f in sorted(fl, key=lambda f: f['i']):
        g = f.get('geom')
        if g is None or g.bounds[0] > x or g.bounds[2] < x: continue
        inter = g.intersection(LineString([(x, g.bounds[1] - 1), (x, g.bounds[3] + 1)]))
        for part in getattr(inter, 'geoms', [inter]):
            if part.is_empty or part.geom_type != 'LineString': continue
            ys = [c[1] for c in part.coords]
            a, b = min(ys), max(ys)
            if b - a <= eps: continue
            nxt = []
            for s in segs:
                if s[1] <= a or s[0] >= b: nxt.append(s); continue
                if s[0] < a: nxt.append((s[0], a, s[2], s[3]))
                if s[1] > b: nxt.append((b, s[1], s[2], s[3]))
            nxt.append((a, b, f['i'], f['color']))
            segs = nxt
    segs.sort()
    out = []
    for y0, y1, i, c in segs:
        if out and out[-1]['i'] == i and abs(out[-1]['y1'] - y0) < 1e-6: out[-1]['y1'] = y1
        else: out.append({'i': i, 'color': c, 'y0': y0, 'y1': y1})
    return out


def run_lengths(runs, key='color'):
    """보이는 구간 → {색(또는 key): 길이 합}."""
    out = {}
    for r in runs: out[r[key]] = out.get(r[key], 0.0) + r['y1'] - r['y0']
    return out


def polyline_at(pts, x):
    """꺾은선(점 배열, x 가 대체로 늘어남) 위 x 에서의 y. 그 x 를 지나는 마디가 없으면 None."""
    P = np.asarray(pts, float)
    for (x0, y0), (x1, y1) in zip(P[:-1], P[1:]):
        lo, hi = min(x0, x1), max(x0, x1)
        if lo - 1e-9 <= x <= hi + 1e-9:
            if hi - lo < 1e-9: return float((y0 + y1) / 2)
            return float(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    return None


def fit_circle(pts):
    """점들 → (cx, cy, r) 최소제곱 원(Kasa)."""
    P = np.asarray(pts, float)
    A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
    rhs = (P ** 2).sum(1)
    (cx, cy, c), *_ = np.linalg.lstsq(A, rhs, rcond=None)
    return float(cx), float(cy), float(math.sqrt(c + cx * cx + cy * cy))


def sweep_deg(pts, center):
    """원호 위 점들(순서대로)이 중심 둘레로 쓸어 간 각(도, 절댓값)."""
    P = np.asarray(pts, float)
    a = np.unwrap(np.arctan2(P[:, 1] - center[1], P[:, 0] - center[0]))
    return float(abs(a[-1] - a[0]) * 180 / math.pi)


def arcs(d, k=16, min_pts=3):
    """채움 도형의 원호: 이어지는 곡선(c) 마디 묶음마다 {pts, cx, cy, r, sweep, start(시작점), end(끝점)}.
    부채꼴·고리 조각의 바깥·안쪽 호가 각각 하나씩 나온다."""
    out, cur = [], None
    def flush():
        if cur is not None and len(cur) >= min_pts:
            P = np.array(cur); cx, cy, r = fit_circle(P)
            out.append({'pts': P, 'cx': cx, 'cy': cy, 'r': r, 'sweep': sweep_deg(P, (cx, cy)),
                        'start': P[0].tolist(), 'end': P[-1].tolist()})
    last = None
    for it in d['items']:
        if it[0] == 'c':
            a = it[1]
            if cur is None or last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
                flush(); cur = [[a.x, a.y]]
            cur.extend(bez(*it[1:5], k=k).tolist())
            last = it[4]
        else:
            flush(); cur = None; last = None
    flush()
    return out


def clock_angle(pt, center):
    """중심에서 본 점의 각(도): 12시 = 0, 시계 방향으로 커짐(0~360)."""
    return (math.degrees(math.atan2(pt[0] - center[0], -(pt[1] - center[1]))) + 360) % 360
