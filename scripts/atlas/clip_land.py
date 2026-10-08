# © 2026 김용현
# scripts/atlas/clip_land.py — 경위도 레이어 다듬기(build_layers.mjs 가 한 번에 여러 레이어로 부름)
#   python -I scripts/atlas/clip_land.py <레이어 id ...>
#   입력  $ATLAS_WORK/geo/<id>.raw.geojson  (경도는 고리·선 안에서 이어져 ±180 을 넘을 수 있다)
#   출력  $ATLAS_WORK/geo/<id>.clipped.geojson — 좌표는 0.001° 격자, 면은 유효·서로 겹치지 않음·바깥 고리 시계 방향
#   설정  config/u2.json layers[id]: tol(단순화 °, 면 덮개는 × coverageTolFactor), minArea(°²), source:'ne' 면 육지로 자르지 않음
#   육지  $ATLAS_WORK/raw/ne/ne_10m_land.geojson (github.com/nvkelso/natural-earth-vector geojson/)
# 면(분류들 = 하나의 덮개 coverage):
#   날짜변경선에서 나눠 [-180,180] 으로 접기 → 육지와 교차 → 범례 순서대로 앞 분류가 차지한 곳 빼기(겹침 0)
#   → 작은 조각 버림 → shapely.coverage_simplify(공유 경계를 함께 단순화해 틈·겹침이 생기지 않음)
#   → 0.001° 격자에 맞춤(set_precision, 유효 출력) → 다른 분류와 안 겹치는 작은 구멍만 메움 → 작은 조각 버림 → 시계 방향
#   덧씌움 분류(pattern, 예: 고산 기후 빗금)는 덮개에 넣지 않고 따로 같은 처리.
# 선: 단순화(허용치 절반) 후 경도를 접고, 이웃 점이 날짜변경선을 건너면 그 자리에서 MultiLineString 으로 나눈다.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shapely
from shapely.geometry import shape, mapping, box, MultiPolygon, Polygon, LineString
from shapely.affinity import translate
from shapely.ops import unary_union
from shapely.strtree import STRtree
from atlas_common import WORK, layer_config, polygonal, flat_polygons

GRID_DEG = 0.001          # 좌표 소수 3자리
HOLE_COVER_FRAC = 0.01    # 구멍 안에 다른 분류가 이 비율 넘게 있으면 실제 경계로 보고 메우지 않음
LINE_TOL_FRAC = 0.5       # 선 단순화 허용치 = 면 허용치 × 이 값
_land = None

assert tuple(int(v) for v in shapely.__version__.split('.')[:2]) >= (2, 1), 'shapely ≥ 2.1 필요(coverage_simplify)'


def land():
    global _land
    if _land is None:
        with open(os.path.join(WORK, 'raw', 'ne', 'ne_10m_land.geojson'), encoding='utf-8') as f:
            gj = json.load(f)
        parts = [p for ft in gj['features'] for p in flat_polygons(polygonal(shape(ft['geometry'])))]
        _land = (parts, STRtree(parts))
    return _land


def fold(g):
    """경도가 ±180 을 넘는 부분을 360 옮겨 [-180,180] 안으로."""
    if g is None: return None
    out = []
    for k in (-1, 0, 1):
        part = g.intersection(box(-180 + 360 * k, -90, 180 + 360 * k, 90))
        if not part.is_empty: out.append(translate(part, -360 * k, 0))
    return polygonal(unary_union(out)) if out else None


def clip_to_land(g):
    if g is None: return None
    parts, tree = land()
    hits = [parts[i] for i in tree.query(g)]
    return polygonal(g.intersection(unary_union(hits))) if hits else None


def keep_large(g, min_area):
    ps = [p for p in flat_polygons(g) if p.area >= min_area]
    return polygonal(MultiPolygon(ps)) if ps else None


def fill_gap_holes(g, others, min_area):
    """min_area 보다 작은 구멍 중 다른 분류가 거의 없는 것(진짜 틈)만 메운다."""
    out = []
    for p in flat_polygons(g):
        holes = []
        for h in p.interiors:
            hp = Polygon(h)
            if hp.area >= min_area or (others is not None and hp.intersection(others).area > HOLE_COVER_FRAC * hp.area):
                holes.append(h)
        out.append(Polygon(p.exterior, holes))
    return polygonal(MultiPolygon(out)) if out else None


def orient_cw(g):
    return polygonal(shapely.orient_polygons(g, exterior_cw=True))


def snap(g):
    return polygonal(shapely.set_precision(g, GRID_DEG)) if g is not None else None


def coverage(geoms, tol, min_area, clip_land):
    """분류 면 목록(범례 순서) → 겹치지 않는 유효한 덮개(같은 순서, 빈 것은 None)."""
    gs = [fold(g) for g in geoms]
    if clip_land: gs = [clip_to_land(g) for g in gs]
    acc, disjoint = None, []
    for g in gs:
        if g is not None and acc is not None: g = polygonal(g.difference(acc))
        g = keep_large(g, min_area) if g is not None else None
        disjoint.append(g)
        if g is not None: acc = g if acc is None else acc.union(g)
    idx = [i for i, g in enumerate(disjoint) if g is not None]
    simp = shapely.coverage_simplify([disjoint[i] for i in idx], tol, simplify_boundary=True)
    res = [None] * len(gs)
    for i, g in zip(idx, simp): res[i] = snap(polygonal(g))
    # 격자 맞춤 뒤 남은 미세한 겹침도 앞 분류 우선으로 정리
    acc = None
    for i in idx:
        g = res[i]
        if g is not None and acc is not None and g.intersects(acc): g = snap(polygonal(g.difference(acc)))
        if g is not None: acc = g if acc is None else acc.union(g)
        res[i] = g
    for i in idx:
        if res[i] is None: continue
        others = unary_union([res[j] for j in idx if j != i and res[j] is not None]) if len(idx) > 1 else None
        res[i] = keep_large(fill_gap_holes(res[i], others, min_area), min_area)
        res[i] = orient_cw(res[i]) if res[i] is not None else None
    return res


def single(g, tol, min_area, clip_land):
    g = fold(g)
    if clip_land: g = clip_to_land(g)
    if g is None: return None
    g = keep_large(polygonal(g.simplify(tol, preserve_topology=True)), min_area)
    g = snap(g)
    g = keep_large(fill_gap_holes(g, None, min_area), min_area) if g is not None else None
    return orient_cw(g) if g is not None else None


def centroid(g):
    big = max(flat_polygons(g), key=lambda p: p.area)
    c = big.centroid
    if not big.contains(c): c = big.representative_point()
    return [round(c.x, 3), round(c.y, 3)]


def wrap_lon(x):
    return ((x + 180) % 360) - 180


def split_antimeridian(coords):
    """이어진 경도 좌표의 선 → [-180,180] 로 접고 날짜변경선을 건너는 곳에서 나눈 선 목록."""
    parts, cur = [], []
    for i, (x, y) in enumerate(coords):
        if i:
            px, py = coords[i - 1]
            k0, k1 = (px + 180) // 360, (x + 180) // 360
            if k0 != k1:
                edge = 180 + 360 * min(k0, k1)          # 건너는 경계(이어진 좌표)
                t = (edge - px) / (x - px); yy = py + t * (y - py)
                e_prev = 180.0 if x > px else -180.0
                cur.append([e_prev, round(yy, 3)])
                parts.append(cur); cur = [[-e_prev, round(yy, 3)]]
        cur.append([round(wrap_lon(x), 3), round(y, 3)])
    parts.append(cur)
    return [p for p in parts if len(p) >= 2]


def line_geom(lines, tol):
    out = []
    for L in lines:
        if len(L) > 2: L = [list(c) for c in LineString(L).simplify(tol * LINE_TOL_FRAC).coords]
        out += split_antimeridian(L)
    if not out: return None
    return {'type': 'LineString', 'coordinates': out[0]} if len(out) == 1 else {'type': 'MultiLineString', 'coordinates': out}


def process(lid):
    cfg = layer_config(lid)
    tol, min_area, clip = cfg['tol'], cfg['minArea'], cfg.get('source') != 'ne'
    with open(os.path.join(WORK, 'geo', f'{lid}.raw.geojson'), encoding='utf-8') as f:
        gj = json.load(f)
    feats = gj['features']
    area_idx = [i for i, ft in enumerate(feats) if ft['geometry']['type'] in ('Polygon', 'MultiPolygon')]
    cov_idx = [i for i in area_idx if not feats[i]['properties'].get('pattern')]
    geoms = {}
    cov_tol = tol * cfg['coverageTolFactor']
    for i, g in zip(cov_idx, coverage([polygonal(shape(feats[i]['geometry'])) for i in cov_idx], cov_tol, min_area, clip)):
        geoms[i] = g
    for i in area_idx:
        if i not in geoms: geoms[i] = single(polygonal(shape(feats[i]['geometry'])), tol, min_area, clip)
    out, dropped, invalid = [], [], []
    for i, ft in enumerate(feats):
        t = ft['geometry']['type']
        if i in geoms:
            g = geoms[i]
            if g is None: dropped.append(ft['properties'].get('label')); continue
            if not g.is_valid: invalid.append(ft['properties'].get('cls'))
            mp = g if g.geom_type == 'MultiPolygon' else MultiPolygon([g])
            ft = dict(ft, geometry=mapping(mp), properties=dict(ft['properties'], centroid=centroid(g)))
        elif t in ('LineString', 'MultiLineString'):
            lines = [ft['geometry']['coordinates']] if t == 'LineString' else ft['geometry']['coordinates']
            geom = line_geom(lines, tol)
            if geom is None: dropped.append(ft['properties'].get('label')); continue
            ft = dict(ft, geometry=geom)
        elif t == 'Point':
            x, y = ft['geometry']['coordinates']
            ft = dict(ft, geometry={'type': 'Point', 'coordinates': [round(wrap_lon(x), 3), round(y, 3)]})
        out.append(ft)
    if invalid: raise ValueError(f'{lid}: 유효하지 않은 면 {invalid}')
    with open(os.path.join(WORK, 'geo', f'{lid}.clipped.geojson'), 'w', encoding='utf-8') as f:
        json.dump(dict(gj, features=out), f, ensure_ascii=False)
    return {'id': lid, 'features': len(out), 'droppedEmpty': dropped}


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    for lid in argv: print(json.dumps(process(lid), ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
