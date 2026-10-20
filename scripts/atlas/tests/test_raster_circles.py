# © 2026 김용현
# scripts/atlas/tests/test_raster_circles.py — 래스터 원 기호 찾기(symbols.circles_from_mask·nearest_class·green_mask):
#   30쪽 도시 인구 원은 PDF 벡터가 아니라 투명 겹침을 펼친 작은 그림·조각이라 렌더 화소에서 원을 찾는다(U3-4).
import os, sys, unittest
import numpy as np
import cv2

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import symbols as S


def disc_mask(shape, discs):
    m = np.zeros(shape, np.uint8)
    for x, y, r in discs: cv2.circle(m, (x, y), r, 1, -1)
    return m


class Circles(unittest.TestCase):
    def test_separate_and_overlapping_discs(self):
        # 따로 떨어진 원 셋(반지름 20·8·4px) + 겹친 원 둘(반지름 14·10px, 중심 거리 18px)
        m = disc_mask((200, 300), [(40, 40, 20), (120, 40, 8), (180, 40, 4), (60, 140, 14), (78, 140, 10)])
        got = sorted(S.circles_from_mask(m, rmin=2.5), key=lambda c: -c[2])
        self.assertEqual(len(got), 5)
        for (x, y, r), (ex, ey, er) in zip(got, [(40, 40, 20), (60, 140, 14), (78, 140, 10), (120, 40, 8), (180, 40, 4)]):
            self.assertLess(abs(x - ex) + abs(y - ey), 4.5, (x, y, ex, ey))
            self.assertLess(abs(r - er), 2.0, (r, er))

    def test_ring_hole_filled(self):
        # 어두운 원 가운데가 색 조건을 못 넘어 고리만 남아도(겹친 원 위 진한 곳) 구멍을 메워 원 하나
        m = disc_mask((100, 100), [(50, 50, 20)]); cv2.circle(m, (50, 50), 12, 0, -1)
        got = S.circles_from_mask(m, rmin=2.5)
        self.assertEqual(len(got), 1); self.assertGreater(got[0][2], 17)

    def test_nearest_class_in_log_space(self):
        legend = [7.34, 5.9, 4.46, 3.02, 1.51]                       # 범례 원 지름(pt) — 큰 것부터
        self.assertEqual([S.nearest_class(d, legend) for d in (7.5, 6.0, 4.0, 2.5, 2.0, 1.0)], [0, 1, 2, 3, 4, 4])

    def test_green_mask(self):
        im = np.array([[[39, 78, 61], [241, 93, 43], [0, 166, 80], [0, 174, 239], [128, 210, 120]]], np.uint8)
        self.assertEqual(S.green_mask(im, 22, 3, 40).tolist(), [[1, 0, 1, 0, 0]])   # 마지막 = 해안 하늘색 + 노랑 섞인 밝은 연두(너무 밝음)
