# © 2026 김용현
# scripts/atlas/clip_land.py — 경위도 주제 면을 Natural Earth 10m 육지로 자르고 다듬는다(build_layers.mjs 가 부름)
#   python -I scripts/atlas/clip_land.py <id> [--no-land] [--tol 0.02] [--min-area 0.01]
#   입력  $ATLAS_WORK/geo/<id>.raw.geojson      (경도는 연속으로 풀려 있어 ±180 을 넘을 수 있다)
#   출력  $ATLAS_WORK/geo/<id>.clipped.geojson
#   육지: $ATLAS_WORK/raw/ne/ne_10m_land.geojson (github.com/nvkelso/natural-earth-vector geojson/)
# 선: 허용치 절반으로 단순화. 면: 유효화 → 날짜변경선(±180)에서 나눠 [-180,180] 으로 접기 → 육지와 교차 → simplify(tol°) → 조각(MIN_AREA_DEG2) 버림
#     → 바깥 고리 시계 방향(d3 규약) → centroid(가장 큰 조각 안 대표점 또는 무게중심). 선·점은 경도만 접는다.
import json, os, sys
import shapely
from shapely.geometry import shape, mapping, box, MultiPolygon, Polygon, LineString
from shapely.affinity import translate
from shapely.ops import unary_union
from shapely.strtree import STRtree

WORK = os.environ.get('ATLAS_WORK', 'C:/Users/Public/atlas-work')
MIN_AREA_DEG2 = 0.01   # 약 10km × 10km 보다 작은 조각은 버림
_land = None


def land():
    global _land
    if _land is None:
        with open(os.path.join(WORK, 'raw', 'ne', 'ne_10m_land.geojson'), encoding='utf-8') as f:
            gj = json.load(f)
        parts = []
        for ft in gj['features']:
            g = shape(ft['geometry'])
            if not g.is_valid: g = shapely.make_valid(g)
            parts.extend(p for p in shapely.get_parts(g) if p.geom_type == 'Polygon')
        _land = (parts, STRtree(parts))
    return _land


def _flat(g):
    """도형 모음·다중 도형을 끝까지 풀어 빈 것 아닌 Polygon 만."""
    out = []
    for p in shapely.get_parts(g):
        if p.geom_type == 'Polygon':
            if not p.is_empty: out.append(p)
        elif p.geom_type in ('MultiPolygon', 'GeometryCollection'):
            out.extend(_flat(p))
    return out


def polys(g):
    if g is None or g.is_empty: return None
    if not g.is_valid: g = shapely.make_valid(g)
    ps = _flat(g)
    if not ps: return None
    return ps[0] if len(ps) == 1 else MultiPolygon(ps)


def fold(g):
    """경도가 ±180 을 넘는 부분을 360 옮겨 [-180,180] 안으로."""
    if g is None: return None
    out = []
    for k in (-1, 0, 1):
        part = g.intersection(box(-180 + 360 * k, -90, 180 + 360 * k, 90))
        if not part.is_empty: out.append(translate(part, -360 * k, 0))
    return polys(unary_union(out))


def clip_to_land(g):
    parts, tree = land()
    hits = [parts[i] for i in tree.query(g)]
    if not hits: return None
    return polys(g.intersection(unary_union(hits)))


def finish(g, tol, min_area=MIN_AREA_DEG2):
    g = polys(g.simplify(tol, preserve_topology=True)) if g is not None else None
    if g is None: return None
    keep = [Polygon(p.exterior, [h for h in p.interiors if Polygon(h).area >= min_area])  # 작은 구멍(호수·강 틈)도 메움
            for p in shapely.get_parts(g) if p.area >= min_area]
    if not keep: return None
    keep = [shapely.orient_polygons(p, exterior_cw=True) if hasattr(shapely, 'orient_polygons') else shapely.geometry.polygon.orient(p, -1.0) for p in keep]
    return keep[0] if len(keep) == 1 else MultiPolygon(keep)


def centroid(g):
    big = max(shapely.get_parts(g), key=lambda p: p.area)
    c = big.centroid
    if not big.contains(c): c = big.representative_point()
    return [round(c.x, 3), round(c.y, 3)]


def simp_line(coords, tol):
    """선 단순화(경도를 접기 전, 이어진 좌표에서). 선은 면보다 눈에 잘 띄어 절반 허용치."""
    if len(coords) < 3: return coords
    return [list(c) for c in LineString(coords).simplify(tol / 2).coords]


def wrap_lon(x):
    return ((x + 180) % 360) - 180


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    lid = argv[0]
    no_land = '--no-land' in argv
    tol = float(argv[argv.index('--tol') + 1]) if '--tol' in argv else 0.02
    min_area = float(argv[argv.index('--min-area') + 1]) if '--min-area' in argv else MIN_AREA_DEG2
    with open(os.path.join(WORK, 'geo', f'{lid}.raw.geojson'), encoding='utf-8') as f:
        gj = json.load(f)
    out, dropped = [], []
    for ft in gj['features']:
        geom = ft['geometry']; t = geom['type']
        if t in ('Polygon', 'MultiPolygon'):
            g = fold(polys(shape(geom)))
            if g is not None and not no_land: g = clip_to_land(g)
            g = finish(g, tol, min_area)
            if g is None:
                dropped.append(ft['properties'].get('label')); continue
            ft = dict(ft, geometry=mapping(g), properties=dict(ft['properties'], centroid=centroid(g)))
        elif t == 'LineString':
            L = simp_line(geom['coordinates'], tol)
            ft = dict(ft, geometry={'type': t, 'coordinates': [[wrap_lon(x), y] for x, y in L]})
        elif t == 'MultiLineString':
            Ls = [simp_line(L, tol) for L in geom['coordinates']]
            ft = dict(ft, geometry={'type': t, 'coordinates': [[[wrap_lon(x), y] for x, y in L] for L in Ls if len(L) >= 2]})
        elif t == 'Point':
            x, y = geom['coordinates']
            ft = dict(ft, geometry={'type': t, 'coordinates': [wrap_lon(x), y]})
        out.append(ft)
    res = dict(gj, features=out)
    with open(os.path.join(WORK, 'geo', f'{lid}.clipped.geojson'), 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False)
    print(json.dumps({'id': lid, 'features': len(out), 'droppedEmpty': dropped}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
