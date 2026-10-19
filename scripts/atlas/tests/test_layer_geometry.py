# © 2026 김용현
# scripts/atlas/tests/test_layer_geometry.py — 앱에 실리는 레이어(sims/atlas-u2-asia/data/layer-*.json) 도형 불변식
#   모든 면이 유효(shapely)·닫힘, 경도 [-180,180]·위도 [-90,90], 분류끼리 겹침 < OVERLAP_DEG2(빗금 같은 덧씌움 분류 제외),
#   선은 이웃 점 경도 차가 180° 를 넘지 않는다(날짜변경선에서 나눔), 바깥 고리 시계 방향(d3).
import glob, itertools, json, os, unittest
import shapely
from shapely.geometry import shape

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
FILES = sorted(glob.glob(os.path.join(ROOT, 'sims', 'atlas-u2-asia', 'data', 'layer-*.json')))
OVERLAP_DEG2 = 0.001     # 격자(0.001°) 맞춤에서 남는 실오라기 수준만 허용


def _signed(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2


class LayerGeometry(unittest.TestCase):
    def test_files_exist(self):
        self.assertGreaterEqual(len(FILES), 11)

    def test_polygons_valid_closed_in_range(self):
        for f in FILES:
            gj = json.load(open(f, encoding='utf-8'))
            for ft in gj['features']:
                g = ft['geometry']
                if g['type'] != 'MultiPolygon': continue
                with self.subTest(layer=os.path.basename(f), cls=ft['properties']['cls']):
                    for poly in g['coordinates']:
                        for r in poly:
                            self.assertGreaterEqual(len(r), 4)
                            self.assertEqual(r[0], r[-1], '고리가 닫히지 않음')
                            for x, y in r:
                                self.assertTrue(-180 <= x <= 180 and -90 <= y <= 90, (x, y))
                        self.assertLess(_signed(poly[0]), 0, '바깥 고리가 시계 방향이 아님')
                    geom = shape(g)
                    self.assertTrue(geom.is_valid, shapely.is_valid_reason(geom))

    def test_no_cross_class_overlap(self):
        for f in FILES:
            gj = json.load(open(f, encoding='utf-8'))
            areas = [(ft['properties']['cls'], shape(ft['geometry'])) for ft in gj['features']
                     if ft['geometry']['type'] == 'MultiPolygon' and not ft['properties'].get('pattern')]
            for (a, ga), (b, gb) in itertools.combinations(areas, 2):
                if a == b: continue
                with self.subTest(layer=os.path.basename(f), pair=(a, b)):
                    ov = ga.buffer(0).intersection(gb.buffer(0)).area
                    self.assertLess(ov, OVERLAP_DEG2, f'{a}∩{b} = {ov:.4f}°²')

    def test_lines_do_not_jump_antimeridian(self):
        for f in FILES:
            gj = json.load(open(f, encoding='utf-8'))
            for ft in gj['features']:
                g = ft['geometry']
                lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates'] if g['type'] == 'MultiLineString' else []
                for L in lines:
                    for p, q in zip(L, L[1:]):
                        self.assertLessEqual(abs(q[0] - p[0]), 180, f'{os.path.basename(f)} {ft["properties"]["cls"]} {p}->{q}')


if __name__ == '__main__':
    unittest.main()
