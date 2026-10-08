# © 2026 김용현
# scripts/atlas/atlas_common.py — 아틀라스 Python 단계가 함께 쓰는 것: 작업 폴더, 지도 목록·단원 설정, 쪽 그리기 캐시,
# 색(Lab·ΔE), PDF 경로 → 점 배열·면, 면 정리(polygonal), 글자 조각.
import functools, json, os, re, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, box

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdfkit

WORK = os.environ.get('ATLAS_WORK', 'C:/Users/Public/atlas-work')
UNIT_CONFIG = os.environ.get('ATLAS_UNIT_CONFIG', os.path.join(HERE, 'config', 'u2.json'))
FONT_PATH = 'C:/Windows/Fonts/malgun.ttf'   # 검증 그림 한글 글꼴(없으면 PIL 기본 글꼴)
BEZIER_STEPS = 16                            # 곡선 하나를 16 등분(곡률이 작아 오차 0.01pt 미만)


# ── 지도 목록·단원 설정 ──────────────────────────────────────────────────
@functools.lru_cache(maxsize=None)
def unit_config():
    with open(UNIT_CONFIG, encoding='utf-8') as f:
        return json.load(f)


@functools.lru_cache(maxsize=None)
def _maps():
    path = os.path.normpath(os.path.join(os.path.dirname(UNIT_CONFIG), unit_config().get('maps', '../maps_u2.json')))
    with open(path, encoding='utf-8') as f:
        return {m['id']: m for m in json.load(f)}


def maps():
    """지도 id → maps_u2.json 항목."""
    return _maps()


def layer_config(layer_id):
    """레이어 설정 = defaults + layers[id] (+ map 항목은 maps()[cfg['map']])."""
    c = unit_config()
    if layer_id not in c['layers']: raise KeyError(f'단원 설정에 레이어 없음: {layer_id}')
    return {**c['defaults'], **c['layers'][layer_id], 'id': layer_id}


def layer_ids():
    return list(unit_config()['layers'])


# ── 쪽 그리기(캐시) ───────────────────────────────────────────────────────
_drawings = {}
def drawings(pno):
    """인쇄 쪽 번호 → page.get_drawings() (한 번만 읽는다)."""
    if pno not in _drawings: _drawings[pno] = pdfkit.doc()[pno - 1].get_drawings()
    return _drawings[pno]


_spans = {}
def spans(pno):
    """인쇄 쪽 번호 → 병합된 글자 조각(pdfkit.merge_spans(page_spans))."""
    if pno not in _spans: _spans[pno] = pdfkit.merge_spans(pdfkit.page_spans(pno))
    return _spans[pno]


def yc(b): return (b[1] + b[3]) / 2


# ── 색 ──────────────────────────────────────────────────────────────────
def hexc(c):
    return None if c is None else '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in c[:3])


def hex_rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def lab(rgb):
    """sRGB(0–255, 마지막 축 3) → CIE Lab(D65)."""
    c = np.asarray(rgb, float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


@functools.lru_cache(maxsize=None)
def lab_hex(h):
    return tuple(lab(hex_rgb(h)).tolist())


def delta_e(h1, h2):
    """CIE76 ΔE (색 hex 두 개)."""
    return float(np.linalg.norm(np.subtract(lab_hex(h1), lab_hex(h2))))


def match_color(h, legend, max_de):
    """채움색 → 범례 항목(같은 색 우선, 아니면 가장 가까운 ΔE ≤ max_de) 또는 None."""
    best, bd = None, max_de
    for e in legend:
        if e['color'] == h: return e
        d = delta_e(h, e['color'])
        if d <= bd: best, bd = e, d
    return best


# ── PDF 경로 → 점 배열 ────────────────────────────────────────────────────
def bez(p0, p1, p2, p3, k=BEZIER_STEPS):
    """3차 베지어(fitz.Point 4개) → k 등분 점(시작점 제외)."""
    t = np.linspace(0, 1, k + 1)[1:, None]; mt = 1 - t
    P = np.array([[p.x, p.y] for p in (p0, p1, p2, p3)])
    return mt**3 * P[0] + 3 * mt * mt * t * P[1] + 3 * mt * t * t * P[2] + t**3 * P[3]


def rings(d, steps=8):
    """채움 그리기 → 닫힌 고리 점 배열 목록(곡선은 steps 등분, 're'·'qu' 포함)."""
    out, cur, last = [], [], None
    for it in d['items']:
        op = it[0]
        if op in ('re', 'qu'):
            if len(cur) >= 3: out.append(np.array(cur))
            cur, last = [], None
            if op == 're':
                r = it[1]; out.append(np.array([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]))
            else:
                q = it[1]; out.append(np.array([[p.x, p.y] for p in (q.ul, q.ur, q.lr, q.ll)]))
            continue
        if op == 'l': a, b = it[1], it[2]
        elif op == 'c': a, b = it[1], it[4]
        else: continue
        if last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
            if len(cur) >= 3: out.append(np.array(cur))
            cur = [[a.x, a.y]]
        if op == 'c': cur.extend(bez(*it[1:5], k=steps).tolist())
        else: cur.append([b.x, b.y])
        last = b
    if len(cur) >= 3: out.append(np.array(cur))
    return out


def stroke_paths(d, steps=8):
    """선(획) 그리기 → 점 배열 목록(이어지는 마디끼리)."""
    out, cur, last = [], [], None
    for it in d['items']:
        if it[0] == 'l': a, b = it[1], it[2]
        elif it[0] == 'c': a, b = it[1], it[4]
        else: continue
        if last is None or abs(a.x - last.x) > 1e-3 or abs(a.y - last.y) > 1e-3:
            if len(cur) >= 2: out.append(np.array(cur))
            cur = [[a.x, a.y]]
        if it[0] == 'c': cur.extend(bez(*it[1:5], k=steps).tolist())
        else: cur.append([b.x, b.y])
        last = b
    if len(cur) >= 2: out.append(np.array(cur))
    return out


# ── 면 ──────────────────────────────────────────────────────────────────
def flat_polygons(g):
    """도형 모음·다중 도형을 끝까지 풀어 비지 않은 Polygon 목록."""
    out = []
    if g is None: return out
    for p in shapely.get_parts(g):
        if p.geom_type == 'Polygon':
            if not p.is_empty: out.append(p)
        elif p.geom_type in ('MultiPolygon', 'GeometryCollection'):
            out.extend(flat_polygons(p))
    return out


def polygonal(g):
    """유효한 면(Polygon/MultiPolygon)만 남긴다. 없으면 None."""
    if g is None or g.is_empty: return None
    if not g.is_valid: g = shapely.make_valid(g)
    parts = [p for p in flat_polygons(g) if p.area > 0]
    if not parts: return None
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def drawing_geom(d):
    """채움 도형 하나 → 면. 짝홀 규칙이면 고리를 XOR, 아니면(0 아닌 감김) 큰 고리와 같은 방향은 합치고 반대 방향은 뺀다."""
    from shapely.ops import unary_union
    polys = []
    for R in rings(d):
        a = 0.5 * float(np.dot(R[:, 0], np.roll(R[:, 1], -1)) - np.dot(R[:, 1], np.roll(R[:, 0], -1)))
        p = polygonal(Polygon(R))
        if p is not None: polys.append((a, p))
    if not polys: return None
    if d.get('even_odd'):
        g = polys[0][1]
        for _, p in polys[1:]: g = g.symmetric_difference(p)
        return polygonal(g)
    sign = np.sign(max(polys, key=lambda t: abs(t[0]))[0])
    g = unary_union([p for a, p in polys if np.sign(a) == sign])
    neg = [p for a, p in polys if np.sign(a) != sign]
    if neg: g = g.difference(unary_union(neg))
    return polygonal(g)


def drop_small(g, min_area):
    """min_area 보다 작은 조각을 버린다."""
    parts = [p for p in flat_polygons(g) if p.area >= min_area]
    return polygonal(MultiPolygon(parts)) if parts else None


def poly_coords(g, nd=3):
    """면 → [[바깥 고리, 구멍...], ...] (좌표 소수 nd 자리)."""
    return [[[[round(x, nd), round(y, nd)] for x, y in r.coords] for r in [p.exterior, *p.interiors]] for p in flat_polygons(g)]


# ── 상자 ────────────────────────────────────────────────────────────────
def inside(r, b, tol=1.0):
    """fitz.Rect r 가 상자 b=[x0,y0,x1,y1] 안(tol 여유)인가."""
    return r.x0 >= b[0] - tol and r.x1 <= b[2] + tol and r.y0 >= b[1] - tol and r.y1 <= b[3] + tol


def overlaps(r, b):
    return not (r.x1 < b[0] or r.x0 > b[2] or r.y1 < b[1] or r.y0 > b[3])


def rect(b):
    import fitz
    return fitz.Rect(b)


def excluded_boxes(m):
    """지도 안에서 내용이 아닌 상자(범례·덧붙인 지도·위치도)."""
    return [m[k] for k in ('legendBbox', 'insetBbox', 'locatorBbox') if m.get(k)]


def frame(m):
    """지도 틀(bbox)에서 덮개 상자를 뺀 면."""
    f = box(*m['bbox'])
    for b in excluded_boxes(m): f = f.difference(box(*b))
    return f


def in_map(d, m, tol=0):
    """그리기 d 가 지도 안이고 덮개 상자와 겹치지 않는가."""
    r = d['rect']
    return inside(r, m['bbox'], tol) and not any(overlaps(r, b) for b in excluded_boxes(m))


def regex(s): return re.compile(s)
