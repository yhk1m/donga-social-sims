# © 2026 김용현
# scripts/atlas/korea_outline.py — 같은 축척의 우리나라 윤곽(U5-3i compareOutline — 42·43쪽) 도형 만들기.
#   python -I scripts/atlas/korea_outline.py <Natural Earth 10m 나라 GeoJSON> <출력 JSON> [--tol 0.02] [--min-area 0.01] [--digits 4] [--mirror-lat]
#   KOR + PRK 면을 하나로 합치고(unary_union — 휴전선 경계 없는 한 윤곽, 교과서 실루엣과 같음), 작은 섬(넓이 < min-area °²)은 버리되
#   독도·울릉도(KEEP 상자 안)는 늘 남기고, 조각마다 tol(°)로 단순화(모양 유지 — 너무 작아 무너지면 원래 조각), 바깥 고리 시계 방향(d3-geo 규칙),
#   소수 digits 자리. 출력 = Feature {properties:{name, isos, tolDeg, minAreaDeg2, parts, points, kept:[섬 이름]}, geometry: MultiPolygon}.
#   --mirror-lat(U6-3h — 48쪽 「같은 축척과 같은 경도의 우리나라」, 설정 mode 'mirrorLat' 일 때 build_layers 가 넘김): 꼭짓점 (λ, φ) → (λ, −φ)
#   (위도 부호만 — 황해 왼쪽·동해 오른쪽 그대로, 작은 섬 고르기는 실제 자리로 한 뒤) + 감김 다시 맞춤(거울상은 감김이 뒤집힘), properties.mirror 'lat'.
#   없으면 출력 바이트 그대로(u5 42·43쪽 — 시험).
#   build_layers.mjs(설정 type 'compareOutline')가 부른다. 받은 자료 폴더 안에서 돌리지 않는다(경로는 인자).
import sys
import json
import argparse
from shapely.geometry import shape, box, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, transform

ISOS = ('KOR', 'PRK')
# 늘 남기는 작은 섬(대표점이 상자 안): 넓이 기준으로 버려지면 안 되는 것
KEEP = {'울릉도': (130.7, 37.4, 131.0, 37.6), '독도': (131.8, 37.2, 131.95, 37.3)}


def build(src, tol=0.02, min_area=0.01, digits=4, mirror_lat=False):
    with open(src, encoding='utf-8') as fh:
        gj = json.load(fh)
    geoms = [shape(f['geometry']) for f in gj['features'] if f['properties'].get('ADM0_A3') in ISOS]
    if len(geoms) != len(ISOS):
        raise SystemExit(f'KOR·PRK 면을 찾지 못함({len(geoms)}개)')
    u = unary_union(geoms)
    polys = list(u.geoms) if u.geom_type == 'MultiPolygon' else [u]
    out, kept = [], []
    for p in sorted(polys, key=lambda q: -q.area):
        rp = p.representative_point()
        name = next((n for n, b in KEEP.items() if box(*b).contains(rp)), None)
        if p.area < min_area and not name:
            continue
        q = p.simplify(tol, preserve_topology=True)
        if q.is_empty or q.geom_type != 'Polygon' or q.area < p.area * 0.5:
            q = p
        if mirror_lat:
            q = transform(lambda x, y, z=None: (x, -y), q)
        q = orient(q, sign=-1.0)
        if name:
            kept.append(name)
        out.append(q)
    mp = MultiPolygon(out)
    rnd = lambda c: [round(c[0], digits), round(c[1], digits) + 0.0]   # + 0.0: 거울상의 −0.0 을 0.0 으로(위도 0 은 없지만 바이트 안전)
    coords = [[[rnd(c) for c in ring.coords] for ring in [p.exterior, *p.interiors]] for p in out]
    pts = sum(len(r) for pg in coords for r in pg)
    return {'type': 'Feature',
            'properties': {'name': '우리나라', 'isos': list(ISOS), 'tolDeg': tol, 'minAreaDeg2': min_area, 'parts': len(out), 'points': pts, 'kept': kept,
                           'areaDeg2': round(mp.area, 4), **({'mirror': 'lat'} if mirror_lat else {})},
            'geometry': {'type': 'MultiPolygon', 'coordinates': coords}}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--tol', type=float, default=0.02)
    ap.add_argument('--min-area', type=float, default=0.01)
    ap.add_argument('--digits', type=int, default=4)
    ap.add_argument('--mirror-lat', action='store_true')
    a = ap.parse_args(argv)
    f = build(a.src, a.tol, a.min_area, a.digits, a.mirror_lat)
    with open(a.out, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(f, fh, ensure_ascii=False, separators=(',', ':'))
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(f['properties'], ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
