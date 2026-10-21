# © 2026 김용현
# scripts/atlas/tests/test_korea_outline.py — 같은 축척의 우리나라 윤곽 도형(korea_outline.build, U5-3i): KOR+PRK 합치기 · 작은 섬 버림(독도·울릉도는 남김) ·
# 바깥 고리 시계 방향(d3-geo) · 단순화 · 소수 자리. 합성 Natural Earth 꼴 GeoJSON(임시 파일)으로.
import os, sys, json, tempfile, unittest

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import korea_outline as K


def sq(x0, y0, x1, y1, ccw=True):
    r = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    return r if ccw else r[::-1]


def feat(a3, polys):
    return {'type': 'Feature', 'properties': {'ADM0_A3': a3}, 'geometry': {'type': 'MultiPolygon', 'coordinates': [[p] for p in polys]}}


def signed_area(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2


class KoreaOutline(unittest.TestCase):
    def setUp(self):
        gj = {'type': 'FeatureCollection', 'features': [
            feat('KOR', [sq(126, 34, 129.5, 38), sq(126.2, 33.2, 126.9, 33.6), sq(130.85, 37.48, 130.88, 37.51), sq(131.86, 37.235, 131.87, 37.245), sq(125.0, 34.0, 125.02, 34.02)]),
            feat('PRK', [sq(124.5, 38, 130, 42.5)]),
            feat('JPN', [sq(130, 31, 140, 40)]),
        ]}
        fd, self.path = tempfile.mkstemp(suffix='.geojson')
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(gj, fh)

    def tearDown(self):
        os.unlink(self.path)

    def test_union_keep_islands_clockwise(self):
        f = K.build(self.path, tol=0.02, min_area=0.01, digits=4)
        g = f['geometry']
        self.assertEqual(g['type'], 'MultiPolygon')
        # 본토(남 + 북 합침 — 휴전선 경계 없음) · 제주 · 울릉도(작아도 남김) · 독도(작아도 남김) / 작은 이름 없는 섬 버림 / 일본 없음
        self.assertEqual(f['properties']['parts'], 4)
        self.assertEqual(sorted(f['properties']['kept']), ['독도', '울릉도'])
        main = g['coordinates'][0][0]
        xs = [c[0] for c in main]; ys = [c[1] for c in main]
        self.assertEqual((min(xs), max(xs), min(ys), max(ys)), (124.5, 130.0, 34.0, 42.5), '본토 = 남 + 북 하나')
        for pg in g['coordinates']:
            self.assertLess(signed_area(pg[0]), 0, '바깥 고리 시계 방향')
        self.assertFalse(any(c[0] >= 130 and c[1] < 37 for pg in g['coordinates'] for c in pg[0]), '일본 면 없음')

    def test_digits_and_small_island_min_area(self):
        f = K.build(self.path, tol=0.0, min_area=0.0, digits=2)
        self.assertEqual(f['properties']['parts'], 5, '넓이 기준 0 이면 작은 섬도')
        for pg in f['geometry']['coordinates']:
            for c in pg[0]:
                self.assertEqual(c, [round(c[0], 2), round(c[1], 2)])


if __name__ == '__main__':
    unittest.main()
