# © 2026 김용현
# scripts/atlas/tests/test_line_chains.py — 조각으로 그린 선 잇기(line_chains, U6-4 — 50·51·55쪽 파선 토막·물결 조각·점선)
import os, sys, unittest
import numpy as np

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import line_chains as LC


def dash(cx, cy, ang, L=2.0, W=0.25):
    u, v = np.array([np.cos(ang), np.sin(ang)]), np.array([-np.sin(ang), np.cos(ang)])
    c = np.array([cx, cy])
    return np.array([c - u * L / 2 - v * W / 2, c + u * L / 2 - v * W / 2, c + u * L / 2 + v * W / 2, c - u * L / 2 + v * W / 2])


class PieceEnds(unittest.TestCase):
    def test_long_piece_axis_ends(self):
        a, b, L, W = LC.piece_ends(dash(10, 5, 0.0, L=4, W=0.3))
        self.assertAlmostEqual(min(a[0], b[0]), 8, 3); self.assertAlmostEqual(max(a[0], b[0]), 12, 3)
        self.assertAlmostEqual(L, 4, 3); self.assertAlmostEqual(W, 0.3, 3)

    def test_round_piece_centre(self):
        t = np.linspace(0, 2 * np.pi, 13)[:-1]
        a, b, L, W = LC.piece_ends(np.c_[3 + 0.5 * np.cos(t), 4 + 0.5 * np.sin(t)])
        self.assertTrue(np.allclose(a, b)); self.assertTrue(np.allclose(a, [3, 4], atol=1e-6))


class Chain(unittest.TestCase):
    def test_dashes_on_arc_join_in_order(self):
        # 반지름 50 원호 위 파선 토막 20개(차례를 섞음) → 한 줄, 끝에서 끝까지 각도 차례
        angs = np.linspace(0, np.pi / 2, 20)
        rng = np.random.default_rng(3); order = rng.permutation(20)
        pieces = [LC.piece_ends(dash(50 * np.cos(a), 50 * np.sin(a), a + np.pi / 2))[:2] for a in angs[order]]
        lines = LC.chain(pieces, gap=4.0)
        self.assertEqual(len(lines), 1)
        th = np.unwrap([np.arctan2(y, x) for x, y in lines[0]])
        d = np.diff(th)
        self.assertTrue(np.all(d > -1e-9) or np.all(d < 1e-9), '차례대로 이어짐')

    def test_gap_splits(self):
        p = [(np.array([0., 0]), np.array([1., 0])), (np.array([1.5, 0]), np.array([2.5, 0])), (np.array([20., 0]), np.array([21., 0]))]
        lines = LC.chain(p, gap=1.0)
        self.assertEqual(sorted(len(L) for L in lines), [2, 4])

    def test_near_colour(self):
        self.assertTrue(LC._near('#f58466', ['#f48365']))
        self.assertFalse(LC._near('#f58466', ['#f07060']))
        self.assertFalse(LC._near(None, ['#000000']))

    def test_dedup(self):
        P = [(None, None, np.array([1.0, 1.0]), None), (None, None, np.array([1.2, 1.1]), None), (None, None, np.array([3.0, 1.0]), None)]
        self.assertEqual(len(LC.dedup(P, 0.4)), 2)


if __name__ == '__main__':
    unittest.main()
