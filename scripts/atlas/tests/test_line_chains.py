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



def _fill(pts, color, items=None):
    """가짜 채움 그리기(PyMuPDF get_drawings 꼴): 닫힌 꺾은선 'l' 항목들"""
    import fitz
    P = [fitz.Point(*q) for q in pts]
    it = [('l', P[i], P[(i + 1) % len(P)]) for i in range(len(P))]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return {'type': 'f', 'fill': tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)), 'color': None, 'items': it if items is None else it[:items],
            'rect': fitz.Rect(min(xs), min(ys), max(xs), max(ys))}


def _stroke(pts, color, width=0.4, dashes='[] 0'):
    import fitz
    P = [fitz.Point(*q) for q in pts]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return {'type': 's', 'fill': None, 'color': tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)), 'width': width, 'dashes': dashes,
            'items': [('l', P[i], P[i + 1]) for i in range(len(P) - 1)], 'rect': fitz.Rect(min(xs), min(ys), max(xs), max(ys))}


class Synthetic(unittest.TestCase):
    M = {'id': 'syn', 'page': 1, 'bbox': [0, 0, 400, 400]}

    def run_with(self, drs, fn):
        old = LC.drawings
        LC.drawings = lambda pno: drs
        try: return fn()
        finally: LC.drawings = old

    def test_line_chains_filters_colour_ring_box(self):
        c = (200, 200)
        # 반지름 100 원 위 접선 방향 파선 토막 18(색 #00a6e9) — 하나로 이어져야 함
        good = [_fill(dash(c[0] + 100 * np.cos(a), c[1] + 100 * np.sin(a), a + np.pi / 2, L=5), '#00a6e9') for a in np.linspace(0, np.pi, 18)]
        wrong_colour = [_fill(dash(200, 50, 0, L=5), '#ff0000')]                 # 다른 색
        off_ring = [_fill(dash(200 + 30 * np.cos(a), 200 + 30 * np.sin(a), a + np.pi / 2, L=5), '#00a6e9') for a in (0.3, 0.6)]   # 띠 밖
        out_box = [_fill(dash(c[0] + 100 * np.cos(a), c[1] + 100 * np.sin(a), a + np.pi / 2, L=5), '#00a6e9') for a in (4.0, 4.2, 4.4, 4.6)]  # 상자 밖(위쪽 반원)
        radial = [_fill(dash(200 + 100 * np.cos(2.0), 200 + 100 * np.sin(2.0), 2.0, L=5), '#00a6e9')]   # 반지름 방향(경선 토막)
        spec = {'label': '시험 선', 'color': '#00a6e9', 'dashed': True, 'fills': ['#00a6e9'], 'pieceLenPt': [3, 7], 'pieceMaxWidthPt': 1,
                'ring': {'center': list(c), 'r': [90, 110]}, 'tangentialDeg': 35, 'boxes': [[0, 195, 400, 400]], 'gapPt': 15, 'minPts': 4}
        w = []
        leg, lines, rep = self.run_with(good + wrong_colour + off_ring + out_box + radial, lambda: LC.line_chains(self.M, [spec], w))
        self.assertEqual(leg, [{'cls': 'l1', 'color': '#00a6e9', 'kind': 'line', 'label': '시험 선', 'dashed': True}])
        self.assertEqual(rep['시험 선']['pieces'], 18)
        self.assertEqual(len(lines), 1)
        r = np.hypot(*(np.array(lines[0]['points']) - c).T)
        self.assertTrue(np.all(np.abs(r - 100) < 1), '모두 원 위')
        # 범례 밖 선(legend false)은 범례 항목 없이 선만
        leg2, lines2, _ = self.run_with(good, lambda: LC.line_chains(self.M, [{**spec, 'legend': False}], []))
        self.assertEqual(leg2, []); self.assertEqual(len(lines2), 1)

    def test_stroke_flows_head_direction(self):
        # 획 둘: 하나는 화살촉(같은 색 작은 채움)이 첫 점 쪽 → 뒤집혀야 함, 하나는 끝 점 쪽 → 그대로. 파선 무늬 → dashed
        a = _stroke([(10, 10), (60, 10), (110, 10)], '#fff200')
        b = _stroke([(10, 50), (60, 50), (110, 50)], '#fff200', dashes='[ 1.6 .8 ] 0')
        heads = [_fill([(8, 9), (6, 10), (8, 11)], '#fff200'), _fill([(112, 49), (114, 50), (112, 51)], '#fff200')]
        fc = {'cls': 'x', 'fill': '#fff200', 'label': '경로', 'stroke': True, 'headMaxPt': 3, 'headNearPt': 4, 'minLenPt': 2}
        out = self.run_with([a, b] + heads, lambda: LC.stroke_flows(self.M, fc, {'stepPt': 5}, []))
        self.assertEqual(len(out), 2)
        top = next(o for o in out if abs(o['points'][0][1] - 10) < 1e-6)
        bot = next(o for o in out if abs(o['points'][0][1] - 50) < 1e-6)
        self.assertAlmostEqual(top['points'][0][0], 110); self.assertAlmostEqual(top['tip'][0], 10)   # 화살촉 왼쪽 → 끝 = 왼쪽
        self.assertAlmostEqual(bot['points'][-1][0], 110); self.assertTrue(bot['dashed']); self.assertFalse(top['dashed'])
        # 화살촉이 없으면 headPt 쪽이 끝
        out2 = self.run_with([a], lambda: LC.stroke_flows(self.M, {**fc, 'headPt': [5, 10]}, {}, []))
        self.assertAlmostEqual(out2[0]['tip'][0], 10)


if __name__ == '__main__':
    unittest.main()
