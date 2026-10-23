# © 2026 김용현
# scripts/atlas/tests/test_continent_layers.py — 대륙·대양 면(continent_layers.py, U1-3c·3d) 검사: 합성 나라·쪼개는 선·색 견본(PDF 없이)
import os, sys, unittest
import numpy as np
from shapely.geometry import box, Polygon, MultiPolygon, LineString, Point, shape

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import continent_layers as cl

# 대륙 견본(Lab) — 10·11쪽 실측 값 일부
PROTOS = [{'cls': 'asia', 'lab': [74.2, 23.2, 30.3]}, {'cls': 'asia', 'lab': [83.8, 9.1, 23.3]},
          {'cls': 'europe', 'lab': [81.9, -10.4, -14.4]}, {'cls': 'africa', 'lab': [89.4, -9.2, 14.3]}]
GREY = [82.2, -4.9, -10.1]   # 그린란드 회색 — 유럽 견본 [81.6, -4.9, -10.1] 이 없으면 어느 견본과도 멂


def pix(lab, n, noise=0.8, seed=1):
    r = np.random.default_rng(seed)
    return np.asarray(lab, float) + r.normal(0, noise, (n, 3))


class Split(unittest.TestCase):
    def test_line_splits_country_area_preserved(self):
        ctry = box(40, 40, 80, 60)                         # 나라 하나(경위도)
        line = LineString(cl.extend_line([(60, 60), (58, 50), (61, 40)], 0.5))   # 해안에서 끝나는 선 → 늘여서 끝까지 지남
        parts = cl.split_by_lines(ctry, [line])
        self.assertEqual(len(parts), 2)
        self.assertAlmostEqual(sum(p.area for p in parts), ctry.area, places=6)

    def test_line_not_crossing_leaves_country(self):
        ctry = box(40, 40, 80, 60)
        self.assertEqual(len(cl.split_by_lines(ctry, [LineString([(60, 60), (58, 50)])])), 1)   # 늘이지 않아 안에서 끝남
        self.assertEqual(len(cl.split_by_lines(ctry, [LineString([(100, 0), (100, 10)])])), 1)  # 안 지남

    def test_snap_line_follows_border(self):
        border = LineString([(50, 40), (50, 60)])
        got = cl.snap_line([(50.3, 40), (50.3, 60)], border, 0.6, step=1.0)
        self.assertTrue(all(abs(x - 50) < 1e-9 for x, _ in got))
        far = cl.snap_line([(55, 40), (55, 60)], border, 0.6, step=1.0)
        self.assertTrue(all(abs(x - 55) < 1e-9 for x, _ in far))   # 먼 곳(우랄산맥)은 그대로

    def test_merge_slivers(self):
        parts = cl.split_by_lines(box(40, 40, 80, 60), [LineString([(60, 61), (60, 39)]), LineString([(60.05, 61), (60.05, 39)])])
        self.assertEqual(len(parts), 3)
        got = cl.merge_slivers(parts, 1.5)          # 가운데 띠(0.05 × 20 = 1 deg²)는 문턱 1.5 아래 → 합침
        self.assertEqual(len(got), 2)
        self.assertAlmostEqual(sum(p.area for p in got), 800, places=6)

    def test_allowed_classes_by_domain(self):
        classes = [{'cls': 'asia', 'domain': [[25, -12, 150, 82]]}, {'cls': 'europe', 'domain': [[-32, 34, 70, 59]]}]
        self.assertEqual(cl.allowed_classes((45, 50), classes), ['asia', 'europe'])
        self.assertEqual(cl.allowed_classes((100, 50), classes), ['asia'])
        self.assertEqual(cl.allowed_classes((-100, 0), classes), [])


class Colour(unittest.TestCase):
    def test_vote_picks_continent_and_ignores_far_pixels(self):
        labs = np.vstack([pix([74.2, 23.2, 30.3], 80), pix([30, 0, 0], 40, seed=2)])   # 아시아 색 80 + 글자(어두움) 40
        c, votes = cl.vote(labs, PROTOS, ['asia', 'europe'], 6.0, 12, 0.5)
        self.assertEqual(c, 'asia'); self.assertEqual(votes, {'asia': 80})

    def test_vote_respects_domain(self):
        c, votes = cl.vote(pix([74.2, 23.2, 30.3], 50), PROTOS, ['europe', 'africa'], 6.0, 12, 0.5)
        self.assertIsNone(c); self.assertEqual(votes, {})

    def test_grey_is_unclassified(self):
        c, _ = cl.vote(pix(GREY, 200), PROTOS, ['northAmerica', 'asia', 'africa'], 6.0, 12, 0.5)   # 그린란드 지역 상자 = 북아메리카(유럽 아님)
        self.assertIsNone(c)
        self.assertEqual(cl.far_class(GREY, PROTOS, ['africa'], 16.0, 8.0)[0], None)

    def test_split_votes_need_majority(self):
        labs = np.vstack([pix([74.2, 23.2, 30.3], 50), pix([81.9, -10.4, -14.4], 50, seed=3)])
        self.assertIsNone(cl.vote(labs, PROTOS, ['asia', 'europe'], 6.0, 12, 0.5)[0])

    def test_far_class_margin(self):
        self.assertEqual(cl.far_class([80, 20, 25], PROTOS, ['asia', 'europe'], 16.0, 8.0)[0], 'asia')
        mid = [80, 6, 8]   # 아시아·유럽 사이 — 차가 margin 보다 작음
        self.assertIsNone(cl.far_class(mid, PROTOS, ['asia', 'europe'], 40.0, 30.0)[0])

    def test_merge_protos_same_class_only(self):
        m = cl.merge_protos([{'cls': 'asia', 'lab': [74, 23, 30], 'px': 100, 'src': 'CHN'}, {'cls': 'asia', 'lab': [74.5, 23, 30], 'px': 100, 'src': 'THA'},
                             {'cls': 'africa', 'lab': [74.5, 23, 30], 'px': 10, 'src': 'X'}], 2.0)
        self.assertEqual(len(m), 2)
        a = next(p for p in m if p['cls'] == 'asia')
        self.assertEqual(a['src'], ['CHN', 'THA']); self.assertAlmostEqual(a['lab'][0], 74.25)

    def test_lab_hex_roundtrip(self):
        from atlas_common import lab_hex as lh
        for h in ('#f0a580', '#b6cedd', '#cbdb90'):
            self.assertEqual(cl.lab_hex(lh(h)), h)


class Assemble(unittest.TestCase):
    W, E = box(40, 40, 60, 60), box(60, 40, 80, 60)

    def test_cut_country_becomes_geometry_pieces(self):
        parts = [{'iso': 'RUS', 'geom': self.W, 'cls': 'europe', 'cut': True}, {'iso': 'RUS', 'geom': self.E, 'cls': 'asia', 'cut': True},
                 {'iso': 'RUS', 'geom': box(81, 50, 82, 51), 'cls': None}]                       # 못 정한 섬 → 가까운 아시아
        classes, pieces, rep = cl.assemble(parts)
        self.assertNotIn('RUS', classes)
        self.assertEqual(sorted((p['cls'], p['mode']) for p in pieces), [('asia', 'geom'), ('europe', 'geom')])
        self.assertAlmostEqual(sum(p['geom'].area for p in pieces), self.W.area + self.E.area + 1)
        self.assertEqual(rep['inherited'], {'RUS': 1})

    def test_island_split_keeps_main_class(self):
        parts = [{'iso': 'USA', 'geom': box(-120, 30, -80, 50), 'cls': 'northAmerica'}, {'iso': 'USA', 'geom': box(-156, 19, -155, 20), 'cls': 'oceania'}]
        classes, pieces, _ = cl.assemble(parts)
        self.assertEqual(classes['USA'], 'northAmerica')
        self.assertEqual([(p['cls'], p['mode']) for p in pieces], [('oceania', 'parts')])

    def test_unreadable_uses_domain_readable_grey_does_not(self):
        parts = [{'iso': 'TUV', 'geom': box(179, -8, 179.1, -7.9), 'cls': None, 'domainCls': 'oceania'},
                 {'iso': 'GRL', 'geom': box(-50, 60, -20, 80), 'cls': None, 'readable': True},
                 {'iso': 'GRL', 'geom': box(-20, 70, -19.9, 70.1), 'cls': None, 'domainCls': 'northAmerica'}]
        classes, pieces, rep = cl.assemble(parts)
        self.assertEqual(classes, {'TUV': 'oceania'})
        self.assertEqual(rep['unclassified'], ['GRL']); self.assertEqual(rep['domainOnly'], ['TUV'])

    def test_overrides_need_reason(self):
        parts = [{'iso': 'MLT', 'geom': box(14, 35, 14.5, 36), 'cls': None}]
        self.assertEqual(cl.assemble(parts, {'MLT': {'cls': 'europe', 'why': '확대 — 회청'}})[0], {'MLT': 'europe'})
        with self.assertRaises(ValueError): cl.assemble(parts, {'MLT': {'cls': 'europe'}})


class Geometry(unittest.TestCase):
    def test_unwrap_dateline_joins_halves(self):
        g = MultiPolygon([box(170, 60, 180, 70), box(-180, 60, -170, 70)])
        u = cl.unwrap_dateline(g)
        self.assertIsInstance(u, Polygon)
        self.assertAlmostEqual(u.bounds[2], 190)
        self.assertIs(cl.unwrap_dateline(box(10, 10, 20, 20)).geom_type, 'Polygon')

    def test_d3_winding_clockwise(self):
        g = cl.round_geom(Polygon([(0, 0), (10, 0), (10, 10), (0, 10)], [[(2, 2), (2, 4), (4, 4), (4, 2)]]))
        ext, hole = g['coordinates'][0]
        self.assertLess(Polygon(ext).exterior.is_ccw, 1)          # 시계 방향
        self.assertTrue(Polygon(hole).exterior.is_ccw)            # 구멍은 반시계
        self.assertEqual(g['type'], 'MultiPolygon')

    def test_sphere_center(self):
        c = cl.sphere_center([box(170, -10, 180, 10), box(-180, -10, -170, 10)])
        self.assertAlmostEqual(abs(c[0]), 180, places=4); self.assertAlmostEqual(c[1], 0, places=4)
        self.assertEqual(cl.sphere_center([box(10, 40, 20, 50)]), [15.0, 45.0])


class Oceans(unittest.TestCase):
    # 합성 세계: 남북으로 긴 대륙 셋(경도 −60~−40 · 20~40 · 60~80, 북극권 너머까지) — 셋째는 갇힌 호수(카스피해 꼴)를 품음
    LAND = box(-60, -50, -40, 70).union(box(20, -50, 40, 70)).union(box(60, -10, 80, 70).difference(box(68, 28, 72, 32)))
    RULES = [{'lat': 66.56}, {'lat': -60}, {'line': [[-50, -49], [-50, -61]]}, {'line': [[30, -49], [30, -61]]}, {'line': [[70, -9], [70, -61]]}]
    SEEDS = {'pacific': [[-150, 0], [150, 0]], 'atlantic': [[-10, 0]], 'indian': [[50, -20]], 'arctic': [[0, 85]], 'southern': [[0, -70]]}

    def test_five_oceans_disjoint_cover_sea(self):
        got, rep = cl.ocean_polygons(self.LAND, self.RULES, self.SEEDS)
        self.assertEqual(sorted(got), sorted(self.SEEDS))
        names = list(got)
        for i, a in enumerate(names):
            for b in names[i + 1:]: self.assertLess(got[a].intersection(got[b]).area, 1e-6, (a, b))
        sea = box(-180, -90, 180, 90).difference(self.LAND).area - 16   # 갇힌 호수 4×4 는 버림
        self.assertAlmostEqual(sum(g.area for g in got.values()) / sea, 1.0, delta=0.03)
        self.assertEqual(len(rep['dropped']), 1)
        for cls, pt in [('pacific', (-150, 30)), ('atlantic', (-30, 0)), ('indian', (50, -20)), ('arctic', (0, 85)), ('southern', (0, -65))]:
            self.assertTrue(got[cls].contains(Point(pt)), cls)
        self.assertGreater(got['southern'].area, 0)
        self.assertLess(got['southern'].area, box(-180, -90, 180, -60).area + 1e-6)   # 「지구 − 면」이 아님

    def test_open_strait_is_an_error(self):
        with self.assertRaises(ValueError):   # 인도양·태평양을 가르는 70°E 선이 없으면 한 덩어리
            cl.ocean_polygons(self.LAND, self.RULES[:4], self.SEEDS)

    def test_seed_on_land_is_an_error(self):
        with self.assertRaises(ValueError):
            cl.ocean_polygons(self.LAND, self.RULES, {**self.SEEDS, 'indian': [[30, 0]]})


if __name__ == '__main__':
    unittest.main()
