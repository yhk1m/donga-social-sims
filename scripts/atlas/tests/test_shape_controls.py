# © 2026 김용현
# scripts/atlas/tests/test_shape_controls.py — 섬·호수·나라 중심 기준점(shape_controls.py)과 교과서 도형 뽑기(land_shapes.py) 검사
import json, math, os, subprocess, sys, unittest
import numpy as np
from shapely.geometry import box

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import pdfkit
import shape_controls as sc

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
O = dict(sc.DEFAULTS)


class Match(unittest.TestCase):
    def test_mutual_best_with_area_ratio(self):
        pdf = [{'kind': 'land', 'area': 100.0, 'c': [10, 10]}, {'kind': 'land', 'area': 100.0, 'c': [30, 10]},
               {'kind': 'water', 'area': 50.0, 'c': [50, 10]}, {'kind': 'land', 'area': 100.0, 'c': [70, 10]}]
        ne = [{'kind': 'land', 'area': 105.0, 'c': [10.5, 10]},     # 0 ↔ 0
              {'kind': 'land', 'area': 400.0, 'c': [30, 10]},      # 넓이 비 4 → 짝 아님
              {'kind': 'land', 'area': 50.0, 'c': [50, 10]},       # 종류가 다름(물 ↔ 육지) → 짝 아님
              None,
              {'kind': 'land', 'area': 100.0, 'c': [70, 30]}]      # 너무 멂(20pt > max(4, 0.15·10))
        self.assertEqual(sc.match_centroids(pdf, ne, O), [(0, 0)])

    def test_one_ne_shape_pairs_once(self):
        pdf = [{'kind': 'land', 'area': 100.0, 'c': [10, 10]}, {'kind': 'land', 'area': 100.0, 'c': [12, 10]}]
        ne = [{'kind': 'land', 'area': 100.0, 'c': [11.8, 10]}]
        self.assertEqual(sc.match_centroids(pdf, ne, O), [(1, 0)])   # 서로 가장 좋은 짝만

    def test_tips(self):
        a = [(0, 0, 0), (10, 0, 1), (5, 9, 2)]
        b = [(0.5, 0.2, 0), (10.1, 0, 1), (20, 20, 2)]
        self.assertEqual(sc.match_tips(a, b, 2.0), [(0, 0), (1, 1)])


class Corners(unittest.TestCase):
    def test_square_corners_and_frame_margin(self):
        sq = np.array([[0, 0], [40, 0], [40, 40], [0, 40]], float)
        t = sc.sharp_vertices(sq, O)
        got = sorted((round(x), round(y)) for x, y, _ in t)
        self.assertEqual(got, [(0, 0), (0, 40), (40, 0), (40, 40)])
        # 틀 경계(왼쪽 x=0)에 붙은 꼭짓점은 잘린 자리라 뺀다
        fr = box(0, -10, 100, 100)
        self.assertEqual(sorted((round(x), round(y)) for x, y, _ in sc.sharp_vertices(sq, O, fr)), [(40, 0), (40, 40)])

    def test_smooth_circle_has_no_corner(self):
        th = np.linspace(0, 2 * math.pi, 200, endpoint=False)
        circ = np.column_stack([30 * np.cos(th), 30 * np.sin(th)])
        self.assertEqual(sc.sharp_vertices(circ, O), [])

    def test_concave_corner_found(self):
        L = np.array([[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]], float)   # ㄱ자 — 오목 꼭짓점 (20, 20)
        self.assertIn((20, 20), [(round(x), round(y)) for x, y, _ in sc.sharp_vertices(L, O)])


class Families(unittest.TestCase):
    def test_families_for_like_georef(self):
        self.assertEqual(sc.families_for({'families': ['miller']}), ['miller'])


def run_u3(code):
    env = {k: v for k, v in os.environ.items() if k not in ('ATLAS_UNIT', 'ATLAS_UNIT_CONFIG')}
    env['ATLAS_UNIT'] = 'u3'
    r = subprocess.run([sys.executable, '-I', '-c', f'import sys, json; sys.path.insert(0, {HERE!r}); ' + code], env=env, capture_output=True)
    if r.returncode != 0: raise AssertionError(r.stderr.decode('utf-8', 'replace'))
    return json.loads(r.stdout.decode('utf-8'))


@NEED_PDF
class LandShapesU3(unittest.TestCase):
    def test_belgium_is_one_whole_shape(self):
        # 벨기에 지도: 언어 3분류 + 브뤼셀 채움의 합 = 벨기에 하나(틀·범례에 닿지 않음)
        o = run_u3('import land_shapes as ls; r = ls.shapes("p32-belgium"); '
                   'print(json.dumps([[s["kind"], s["area"], s["edge"]] for s in r["shapes"]]))')
        self.assertEqual(len(o), 1)
        kind, area, edge = o[0]
        self.assertEqual((kind, edge), ('land', False))
        self.assertAlmostEqual(area, 7026, delta=60)

    def test_eu_map_islands(self):
        # EU 지도: 그레이트브리튼섬(넓이 약 940pt²)·아이슬란드(약 460)·아일랜드섬(약 360)이 잘리지 않은 따로 된 육지
        o = run_u3('import land_shapes as ls; r = ls.shapes("p32-eu"); '
                   'print(json.dumps([[s["kind"], s["area"], s["edge"]] for s in r["shapes"][:4]]))')
        self.assertTrue(o[0][2])   # 가장 큰 것 = 대륙(틀에 닿음)
        self.assertEqual([round(a, -1) for _, a, e in o[1:]], [940, 460, 360])
        self.assertFalse(any(e for _, _, e in o[1:]))


if __name__ == '__main__': unittest.main()
