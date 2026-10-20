# © 2026 김용현
# scripts/atlas/tests/test_zones.py — 점무늬 면(zones.dots_area, U4-3b — 39쪽 사하라 사막) 검사: 합성 점 격자
import os, sys, unittest
from shapely.geometry import box

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import zones as Z


def grid(x0, y0, x1, y1, step):
    """사각형 [x0, x1] × [y0, y1] 을 칸 step 으로 나눈 칸 가운데 점들(교과서 점무늬 — 칸마다 점 하나)."""
    out, y = [], y0 + step / 2
    while y < y1:
        x = x0 + step / 2
        while x < x1: out.append((x, y)); x += step
        y += step
    return out


class DotsArea(unittest.TestCase):
    def test_grid_covers_rectangle(self):
        rect = box(100, 100, 160, 140)                     # 60 × 40pt, 점 간격 4pt(반지름 0.6pt 원 중심)
        g = Z.dots_area(grid(100, 100, 160, 140, 4), 4)
        self.assertIsNotNone(g)
        self.assertTrue(0.9 <= g.area / rect.area <= 1.1, g.area / rect.area)
        self.assertGreater(g.intersection(rect).area / rect.area, 0.97)

    def test_isolated_dot_dropped_and_holes_filled(self):
        pts = grid(100, 100, 160, 140, 4)
        pts = [p for p in pts if not (128 < p[0] < 132 and 118 < p[1] < 122)]   # 가운데 점 하나 빠짐(빈 칸) → 구멍 아님
        g = Z.dots_area(pts + [(200, 200)], 4)             # 멀리 떨어진 점 하나
        self.assertFalse(g.covers(box(199, 199, 201, 201).centroid))
        self.assertTrue(g.covers(box(129, 119, 131, 121).centroid))
        self.assertEqual(len(getattr(g, 'geoms', [g])), 1)

    def test_frame_clip_and_empty(self):
        g = Z.dots_area(grid(100, 100, 160, 140, 4), 4, fr=box(0, 0, 130, 300))
        self.assertLessEqual(g.bounds[2], 130 + 1e-9)
        self.assertIsNone(Z.dots_area([], 4))


if __name__ == '__main__': unittest.main()
