# © 2026 김용현
# scripts/atlas/tests/test_path_flows.py — 경로 화살표(lines.band_centerline·dash_centerline, U5-4 — 46쪽 지구본 인구 이동): 채운 가는 띠 → 가운데 선
import os, sys, unittest
import numpy as np

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import lines as LN


def arc_band(r0=20.0, w=0.6, a0=0.0, a1=np.pi / 2, n=40):
    """반지름 r0 원호를 따라 너비 w 인 띠(고리 — 바깥 변 → 안쪽 변 거꾸로)."""
    t = np.linspace(a0, a1, n)
    outer = np.c_[(r0 + w / 2) * np.cos(t), (r0 + w / 2) * np.sin(t)]
    inner = np.c_[(r0 - w / 2) * np.cos(t), (r0 - w / 2) * np.sin(t)][::-1]
    return np.r_[outer, inner]


class BandCenterline(unittest.TestCase):
    def test_straight_band(self):
        R = np.array([[0, 0], [10, 0], [10, 0.6], [0, 0.6]], float)
        P, w = LN.band_centerline(R, 0.5)
        # 두 끝 = 서로 가장 먼 두 꼭짓점(네모 띠면 대각 모서리)이라 끝 점만 너비의 반(0.3pt) 안에서 어긋남 — 안쪽 점은 가운데
        self.assertTrue(np.allclose(P[2:-2, 1], 0.3, atol=1e-6))
        self.assertTrue(np.all(np.abs(P[:, 1] - 0.3) <= 0.3 + 1e-9))
        self.assertAlmostEqual(abs(P[-1, 0] - P[0, 0]), 10, places=6)
        self.assertAlmostEqual(w, 0.6 * 10 / 10.6, places=6)   # 2 × 넓이 / 둘레 = 2·6 / 21.2(짧은 변 몫만큼 작음 — 긴 화살대에서는 무시할 만함)
        self.assertLessEqual(np.max(np.hypot(*np.diff(P, axis=0).T)), 0.5 + 1e-9)

    def test_curved_band_follows_arc(self):
        P, w = LN.band_centerline(arc_band(), 0.5)
        r = np.hypot(P[:, 0], P[:, 1])
        self.assertLess(np.max(np.abs(r[2:-2] - 20)), 0.05)   # 가운데 선이 반지름 20 원호 위(끝 점은 너비의 반 안)
        self.assertLessEqual(np.max(np.abs(r - 20)), 0.3 + 1e-9)
        self.assertAlmostEqual(w, 0.6, delta=0.02)
        for e, want in zip(sorted([tuple(P[0]), tuple(P[-1])]), [(0.0, 20.0), (20.0, 0.0)]):
            self.assertLessEqual(np.hypot(e[0] - want[0], e[1] - want[1]), 0.3 + 1e-9)


class DashCenterline(unittest.TestCase):
    def test_order_from_far_end_to_tip(self):
        # 토막 다섯(섞인 차례) — 화살촉 쪽 끝(10, 0) 에서 가장 먼 토막부터 이웃 차례로
        cs = [(4, 0), (0, 0), (8, 0), (2, 0), (6, 0)]
        pieces = [np.array([[x - 0.6, -0.25], [x + 0.6, -0.25], [x + 0.6, 0.25], [x - 0.6, 0.25]]) for x, _ in cs]
        P = LN.dash_centerline(pieces, (10, 0))
        self.assertEqual([round(p[0]) for p in P], [0, 2, 4, 6, 8])


if __name__ == '__main__':
    unittest.main()
