# © 2026 김용현
# scripts/atlas/tests/test_unit_symbols.py — 네모 단위 기호(symbols.unit_columns·unit_stacks, U5-3f — 47쪽 마킬라도라): 작은 네모 → 열 → 주별 칸 묶음
import os, sys, unittest

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import symbols as S

P = 2.45   # 칸 간격(가운데끼리, pt)


def column(x, bot, n, cls):
    return [(x, bot - i * P, cls) for i in range(n)]


class UnitStacks(unittest.TestCase):
    def test_columns_split_by_color_x_and_gap(self):
        pts = column(10, 100, 5, 'a') + column(10 + P, 100, 3, 'b') + column(10, 80, 2, 'a')   # 같은 x 의 위쪽 떨어진 열(간격 > 1.5칸)은 따로
        cols = S.unit_columns(pts, 0.4, P)
        got = sorted((c['cls'], round(c['x'], 2), c['n'], round(c['bot'], 2)) for c in cols)
        self.assertEqual(got, [('a', 10.0, 2, 80.0), ('a', 10.0, 5, 100.0), ('b', 12.45, 3, 100.0)])

    def test_synthetic_page_three_stacks(self):
        # 합성 쪽: 묶음 셋 — (5 파랑 + 3 주황), (파랑 열 둘 4+2 + 주황 2), (주황만 1). 밑이 다르거나 멀리 떨어진 열은 다른 묶음
        pts = (column(10, 100, 5, 'plants') + column(10 + P, 100, 3, 'workers')
               + column(40, 120, 4, 'plants') + column(40 + P, 120, 2, 'plants') + column(40 + 2 * P, 120, 2, 'workers')
               + column(40 + 3 * P, 90, 1, 'workers'))       # 바로 옆이지만 밑 줄이 30pt 위 — 다른 묶음
        st = S.unit_stacks(S.unit_columns(pts, 0.4, P), P, ['plants', 'workers'])
        self.assertEqual(len(st), 3)
        by = {tuple((q['cls'], q['count']) for q in s['series']): s for s in st}
        self.assertIn((('plants', 5), ('workers', 3)), by)
        self.assertIn((('plants', 6), ('workers', 2)), by)
        self.assertIn((('workers', 1),), by)
        s2 = by[(('plants', 6), ('workers', 2))]
        self.assertEqual(s2['cols'], 3); self.assertEqual(s2['maxRun'], 4)
        self.assertAlmostEqual(s2['base'][0], 40 + P, places=2); self.assertAlmostEqual(s2['base'][1], 120, places=2)
        total = sum(q['count'] for s in st for q in s['series'])
        self.assertEqual(total, len(pts), '칸 수는 센 그대로')

    def test_empty(self):
        self.assertEqual(S.unit_stacks(S.unit_columns([], 0.4, P), P, ['a']), [])


if __name__ == '__main__':
    unittest.main()
