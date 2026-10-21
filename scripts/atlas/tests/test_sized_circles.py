# © 2026 김용현
# scripts/atlas/tests/test_sized_circles.py — 크기 비례 원(symbols.sized_circles 의 도우미, U5-3e — 47쪽 세계 100대 초국적 기업 본사):
#   범례 겹친 원 √ 맞춤, 값 → 범례 단계, 지시선(채움 사각형·둥근 끝) 두 끝, 원 ↔ 지시선 ↔ 끝 점 짝
import os, sys, unittest
import numpy as np

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import symbols as S


class SqrtScale(unittest.TestCase):
    def test_legend_sqrt_fit(self):
        # 47쪽 범례 겹친 원(테두리 뺀 지름 8.5·6.1·1.95pt) — 지수 ≈ 0.5, 최소 제곱 k 로 200 ↔ 10 지름 비 = √20
        k, expo, err = S.sqrt_scale([8.5, 6.1, 1.95], [200, 100, 10])
        self.assertAlmostEqual(expo, 0.5, delta=0.02)
        self.assertLess(err, 0.03)
        self.assertAlmostEqual((k * 200 ** 0.5) / (k * 10 ** 0.5), 4.47, delta=0.05)
        # 정확한 √ 자료면 k 그대로·오차 0
        k2, e2, r2 = S.sqrt_scale([2 * 200 ** 0.5, 2 * 100 ** 0.5, 2 * 10 ** 0.5], [200, 100, 10])
        self.assertAlmostEqual(k2, 2.0, places=9); self.assertAlmostEqual(e2, 0.5, places=9); self.assertAlmostEqual(r2, 0.0, places=9)

    def test_size_class_geometric_bounds(self):
        vals = [200, 100, 10]
        self.assertEqual([S.size_class(v, vals) for v in (250, 142, 141, 40, 31.7, 31.6, 5)], [0, 0, 1, 1, 1, 2, 2])


class ThinEnds(unittest.TestCase):
    def test_square_end_quad(self):
        a, b = S.thin_ends([[0, 0], [10, 0], [10, 0.3], [0, 0.3]], 0.6)
        got = sorted([tuple(np.round(a, 6)), tuple(np.round(b, 6))])
        self.assertEqual(got, [(0.0, 0.15), (10.0, 0.15)])

    def test_closed_ring_and_diagonal(self):
        # 닫힌 고리(첫 점 = 끝 점)·기운 선: 끝 = 짧은 변 가운데
        P = [[0, 0], [0.2, -0.2], [5.2, 4.8], [5, 5], [0, 0]]
        a, b = S.thin_ends(P, 0.6)
        ends = sorted([tuple(np.round(a, 3)), tuple(np.round(b, 3))])
        self.assertAlmostEqual(ends[0][0], 0.1, places=2); self.assertAlmostEqual(ends[1][0], 5.1, places=2)

    def test_round_cap_and_rejects(self):
        # 둥근 끝 선(반원 끝 — 점 여럿): 주축 양 끝
        t = np.linspace(-np.pi / 2, np.pi / 2, 7)
        right = [[8 + 0.15 * np.cos(a), 0.15 * np.sin(a)] for a in t]
        left = [[0 - 0.15 * np.cos(a), -0.15 * np.sin(a)] for a in t]
        a, b = S.thin_ends(right + left, 0.6)
        xs = sorted([a[0], b[0]])
        self.assertAlmostEqual(xs[0], -0.15, places=6); self.assertAlmostEqual(xs[1], 8.15, places=6)
        self.assertIsNone(S.thin_ends([[0, 0], [3, 0], [3, 1], [0, 1]], 0.6))       # 굵음(원 테두리 고리 등)
        self.assertIsNone(S.thin_ends([[0, 0], [0.5, 0], [0.5, 0.3], [0, 0.3]], 0.6))  # 짧음
        self.assertIsNone(S.thin_ends([[0, 0], [1, 0], [1, 1]], 0.6))


class LeaderTargets(unittest.TestCase):
    def test_leader_end_dot_is_position(self):
        circles = [(0, 0, 3), (20, 0, 2), (0, 20, 4), (40, 40, 1)]
        dots = [(10, 10, 0.5), (60, 60, 0.5)]
        segs = [((1, 1), (9.8, 9.8)),        # 원 0 안 → 점 (10,10)
                ((10.2, 9.9), (19, 0.5)),    # 거꾸로 그린 선: 점 → 원 1
                ((0, 17), (10, 10.3))]       # 원 2 가장자리(가운데에서 3 — 반지름 4 안) → 같은 점
        out, used = S.leader_targets(circles, segs, dots, 0.8)
        self.assertEqual(out[:3], [(10, 10), (10, 10), (10, 10)])
        self.assertIsNone(out[3], '지시선 없는 원은 원 가운데(None)')
        self.assertEqual(used, 3)

    def test_far_ends_ignored_and_longest_wins(self):
        circles = [(0, 0, 2)]
        dots = [(5, 0, 0.5), (15, 0, 0.5)]
        segs = [((1, 0), (4.6, 0)), ((1.5, 0), (14.6, 0)), ((5, 5), (8, 8))]   # 셋째는 원·점 어디에도 안 닿음
        out, used = S.leader_targets(circles, segs, dots, 0.8)
        self.assertEqual(out, [(15, 0)])
        self.assertEqual(used, 2)
        self.assertEqual(S.leader_targets([], segs, dots, 0.8), ([], 0))
        self.assertEqual(S.leader_targets(circles, segs, [], 0.8), ([None], 0))


if __name__ == '__main__':
    unittest.main()
