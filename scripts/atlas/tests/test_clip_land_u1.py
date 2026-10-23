# © 2026 김용현
# U1-4 clip_land 키(있을 때만): seaOnly(선의 바다 위 몫만 — 8·9쪽 국경·해양 경계가 같은 획) · postSimplify(덮개 다시 단순화 — 13쪽 세계 기후)
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from shapely.geometry import Polygon, box
from shapely.strtree import STRtree
import clip_land as C


class SeaOnly(unittest.TestCase):
    def setUp(self):
        self.old = C._land
        land = [box(0, 0, 10, 10)]
        C._land = (land, STRtree(land))
        C._inland.clear()

    def tearDown(self):
        C._land = self.old
        C._inland.clear()

    def test_land_part_removed_coast_stub_dropped(self):
        # 바다(−10..0) → 육지 안(0..10) → 바다(10..20): 육지 안 몫은 빠지고(insetDeg 0.2 띠 안 해안 토막은 minLen 아래라 버림) 바다 둘만
        out = C.sea_only([[[-10, 5], [20, 5]]], {'insetDeg': 0.2, 'minLenDeg': 0.5})
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(min(p[0] for p in out[0] + out[1]), -10)
        self.assertTrue(all(not (0.3 < p[0] < 9.7) for L in out for p in L))
        # 육지 안 국경(해안에 닿지 않음)은 통째로 빠짐
        self.assertEqual(C.sea_only([[[2, 2], [8, 8]]], {'insetDeg': 0.2, 'minLenDeg': 0.5}), [])
        # 날짜변경선을 건너는 선(이어진 경도 170 → 190)은 접어서 두 토막
        self.assertEqual(len(C.sea_only([[[170, -30], [190, -30]]], {'insetDeg': 0.2, 'minLenDeg': 0.5})), 2)


class PostSimplify(unittest.TestCase):
    def test_simplified_disjoint_in_legend_order(self):
        import numpy as np
        t = np.linspace(0, np.pi, 400)
        wig = [(float(x), 5 + 0.01 * np.sin(40 * x)) for x in np.linspace(0, 10, 400)]   # 0.01° 물결 경계
        a = Polygon([(0, 0), (10, 0)] + wig[::-1])
        b = Polygon(wig + [(10, 10), (0, 10)])
        out = C.post_simplify({0: a, 1: b}, 0.05, 0.1)
        self.assertLess(len(out[0].exterior.coords if out[0].geom_type == 'Polygon' else out[0].geoms[0].exterior.coords), 20)
        self.assertLess(out[0].intersection(out[1]).area, 1e-9, '겹침 없음(앞 분류 우선)')
        self.assertGreater(out[0].area + out[1].area, 99.5)


if __name__ == '__main__':
    unittest.main()
