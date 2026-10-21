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




class ClipAreas(unittest.TestCase):
    """빗금·점무늬를 잘라 그리기 경로로 그린 지도(U4-4 — 37쪽 동아프리카 고산, 39쪽 사하라·사헬): 설정 상자와 같은 경로 → 면."""
    def test_clip_path_to_polygon_and_missing_box_fails(self):
        import fitz
        doc = fitz.open(); pg = doc.new_page(width=200, height=200)
        sh = pg.new_shape()
        sh.draw_polyline([(20, 20), (80, 30), (60, 90), (20, 20)]); sh.finish(color=(0, 0, 1), width=0.2, closePath=True); sh.commit()
        # 잘라 그리기 경로 하나를 담은 내용(삼각형 W n) + 그 안 선 하나
        xref = pg.get_contents()[0]
        doc.update_stream(xref, doc.xref_stream(xref) + b"\nq 20 180 m 80 170 l 60 110 l h W n 0 0 1 RG 0.2 w 10 150 m 90 150 l S Q\n")
        old = Z.pdfkit.doc
        Z.pdfkit.doc = lambda: doc
        try:
            clips = [d for d in pg.get_drawings(extended=True) if d.get('type') == 'clip' and d.get('items')]
            self.assertTrue(clips)
            b = list(clips[0]['scissor'])
            g = Z.clip_areas(1, [b])
            self.assertEqual(len(g), 1)
            self.assertAlmostEqual(g[0].area, 0.5 * abs((80 - 20) * (90 - 20) - (60 - 20) * (30 - 20)), delta=5)   # 삼각형 넓이(쪽 좌표 — 위아래 뒤집힘)
            with self.assertRaises(ValueError): Z.clip_areas(1, [[0, 0, 5, 5]])
            self.assertEqual(Z.clip_areas(1, []), [])
        finally:
            Z.pdfkit.doc = old


class StrokeClipAreas(unittest.TestCase):
    """줄 무늬 면(U5-3h — 46쪽 중남미 「혼혈」 가로 분홍 줄·「아프리카계」 사선 검은 빗금): 그 색 줄을 감싼 잘라 그리기 경로(가장 안쪽의 다각형 — 무늬 칸 네모 말고) → 면."""
    def test_union_of_region_clips_by_line_color(self):
        import fitz
        doc = fitz.open(); pg = doc.new_page(width=200, height=200)
        sh = pg.new_shape(); sh.draw_rect((1, 1, 2, 2)); sh.finish(color=(0, 0, 0), width=0.1); sh.commit()
        xref = pg.get_contents()[0]
        # 삼각형 지역(분홍 가로 줄, 안쪽에 무늬 칸 네모 잘라 그리기 하나 더) · 오각형 지역(분홍) · 네모 지역(검은 사선 — 다른 색)
        pink = b"0.94 0.36 0.63 RG 0.36 w "
        tri = b"q 20 180 m 80 170 l 60 110 l h W n q 10 100 90 90 re W n " + pink + b"10 150 m 90 150 l S 10 160 m 90 160 l S Q Q\n"
        pent = b"q 120 180 m 180 180 l 190 150 l 150 120 l 110 150 l h W n " + pink + b"100 150 m 190 150 l S Q\n"
        sq = b"q 20 20 m 60 20 l 60 60 l 20 60 l h W n 0.14 0.13 0.13 RG 0.28 w 20 20 m 60 60 l S Q\n"
        doc.update_stream(xref, doc.xref_stream(xref) + b"\n" + tri + pent + sq)
        old = Z.pdfkit.doc
        Z.pdfkit.doc = lambda: doc
        try:
            hexs = {Z.hexc(d.get('color')) for d in pg.get_drawings() if d.get('color') is not None}
            pinkc = next(h for h in hexs if h.startswith('#ef') or h.startswith('#f0'))
            g = Z.stroke_clip_areas(1, pinkc, [0, 0, 200, 200])
            tri_a = 0.5 * abs((80 - 20) * (110 - 180) - (60 - 20) * (170 - 180))
            pent_a = shapely_area([(120, 20), (180, 20), (190, 50), (150, 80), (110, 50)])
            self.assertAlmostEqual(g.area, tri_a + pent_a, delta=8)
            self.assertEqual(len(getattr(g, 'geoms', [g])), 2)
            self.assertIsNone(Z.stroke_clip_areas(1, '#123456', [0, 0, 200, 200]))
            # 지도 틀 밖 경로는 버림
            self.assertAlmostEqual(Z.stroke_clip_areas(1, pinkc, [100, 0, 200, 200]).area, pent_a, delta=8)
        finally:
            Z.pdfkit.doc = old


def shapely_area(pts):
    from shapely.geometry import Polygon
    return Polygon(pts).area


if __name__ == '__main__': unittest.main()
