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


class RasterHeuristics(unittest.TestCase):
    """U3-4 리뷰: zones 래스터 규칙(해안 띠·작은 그림 채움·덮개 보호·채우기)을 순수 배열로."""
    def setUp(self):
        import zones as Z
        self.Z = Z

    def test_coast_band_one_pixel(self):
        sea = np.zeros((5, 8), bool); sea[:, 6:] = True             # 오른쪽 두 열이 바다
        self.assertEqual(self.Z.coast_band(sea, 1).sum(axis=0).tolist(), [0, 0, 0, 0, 0, 5, 0, 0])
        self.assertFalse(self.Z.coast_band(sea, 0).any())
        # 띠가 다 덮는 작은 섬(폭 2화소)은 띠에서 뺀다 — 지우면 섬이 사라짐(29쪽 페로 제도)
        sea2 = np.ones((6, 6), bool); sea2[2:4, 2:4] = False
        self.assertFalse(self.Z.coast_band(sea2, 1).any())

    def test_fill_labels_distance_limit_and_force(self):
        lbl = np.array([[1, 1, 1, 0, 0, 0, 0, 0, 0, 0]], np.int32)   # 3~9 미분류
        sea = np.zeros(lbl.shape, bool)
        force = np.zeros(lbl.shape, bool); force[0, 8:] = True
        full = self.Z.fill_labels(lbl, sea, force, fill_px=2.5, grow_px=0)
        self.assertEqual(full.tolist(), [[1, 1, 1, 1, 1, 0, 0, 0, 1, 1]])   # 거리 2.5 안 + force 는 거리 무관

    def test_coast_band_then_fill_gives_inner_class(self):
        # 해안 1화소에 섞인 색(분류 3 = 지중해성 연두로 잘못 잡힘)이 있어도 해안 띠를 지우고 채우면 안쪽 분류(1)
        lbl = np.array([[1, 1, 1, 3, 0]], np.int32); sea = np.array([[False, False, False, False, True]])
        lbl[self.Z.coast_band(sea, 1)] = 0
        self.assertEqual(self.Z.fill_labels(lbl, sea, np.zeros(lbl.shape, bool), 2.5, 0).tolist(), [[1, 1, 1, 1, 0]])

    def test_force_boxes_do_not_resurrect_masked(self):
        lbl = np.full((4, 6), 2, np.int32)
        masked = np.zeros(lbl.shape, bool); masked[:, 3:] = True       # 오른쪽 반은 덮개(유럽 밖)
        lbl[masked] = 0                                                # raster_zones 처럼 덮개(바다) 자리는 분류 없음
        sea = masked.copy(); force = np.zeros(lbl.shape, bool)
        self.Z.force_boxes(lbl, sea, force, [(1, 0, 5, 4)], masked)    # 핀 상자가 덮개에 걸침
        self.assertTrue((lbl[:, 1:5] == 0).all())
        self.assertTrue(force[:, 1:3].all() and not force[:, 3:].any())
        self.assertTrue(sea[:, 3:].all() and not sea[:, :3].any())
        self.assertTrue((self.Z.fill_labels(lbl, sea, force, 1.0, 0)[:, 3:] == 0).all())   # 덮개 자리는 채워지지 않음

    def test_edge_band_margin_becomes_sea(self):
        # rasterEdgePt: 틀 가장자리 e 화소 안의 분류 화소는 바다가 되고, 채우기도 되살리지 않음(29쪽 틀 끝 래스터 띠)
        lbl = np.full((6, 8), 2, np.int32); sea = np.zeros(lbl.shape, bool)
        self.Z.edge_band(lbl, sea, 1)
        self.assertEqual(lbl[0, 3], 0); self.assertTrue(sea[0, 3])       # 가장자리 화소 → 바다
        self.assertTrue(sea[:, 0].all() and sea[:, -1].all() and sea[-1, :].all())
        self.assertTrue((lbl[1:-1, 1:-1] == 2).all() and not sea[1:-1, 1:-1].any())
        full = self.Z.fill_labels(lbl, sea, np.zeros(lbl.shape, bool), 2.5, 0)
        self.assertEqual(full[0, 3], 0)
        # e = 0 이면 아무것도 바꾸지 않음(arr[-0:] 은 배열 전체라 그대로 쓰면 다 덮음)
        lbl0 = np.full((4, 4), 2, np.int32); sea0 = np.zeros(lbl0.shape, bool)
        self.Z.edge_band(lbl0, sea0, 0)
        self.assertTrue((lbl0 == 2).all() and not sea0.any())


class RescueIslands(unittest.TestCase):
    def test_deblend_prefers_strong_color_mixed_with_white(self):
        import zones as Z
        protos = [(0x8d, 0xc6, 0x3f), (0xd2, 0xe2, 0x88), (0xa8, 0x80, 0xb9)]   # 서안 해양성·지중해성·툰드라
        self.assertEqual(Z.deblend_class((156, 165, 136), protos), 0)          # 29쪽 페로 제도 가장 진한 화소
        self.assertEqual(Z.deblend_class((0xd2, 0xe2, 0x88), protos), 1)

    def test_unclassified_island_takes_darkest_pixel_class(self):
        import zones as Z
        sea = np.ones((6, 10), bool); sea[1:4, 1:4] = False; sea[1:4, 6:9] = False; sea[5, 9] = False
        lbl = np.zeros(sea.shape, np.int32); lbl[2, 7] = 2                       # 오른쪽 섬은 이미 분류 있음
        rgb = np.full(sea.shape + (3,), 250, np.uint8); rgb[2, 2] = (156, 165, 136)   # 왼쪽 섬 가장 진한 화소
        protos = [(0xd2, 0xe2, 0x88), (0x8d, 0xc6, 0x3f)]; owner = [3, 4]          # 견본 1(서안 해양성) → fills 4번
        self.assertEqual(Z.rescue_islands(lbl, sea, rgb, protos, owner, min_px=4), 1)
        self.assertTrue((lbl[1:4, 1:4] == 5).all())                              # 왼쪽 섬 통째로 5(= 4 + 1)
        self.assertEqual(lbl[1:4, 6:9].sum(), 2)                                  # 오른쪽 섬은 그대로
        self.assertEqual(lbl[5, 9], 0)                                            # 1화소 점은 둠
        # 틀 가장자리에 닿은 덩어리(이웃 지도 그림 띠)는 섬이 아니라 둠
        sea2 = np.ones((6, 10), bool); sea2[:, 0:2] = False
        lbl2 = np.zeros(sea2.shape, np.int32)
        self.assertEqual(Z.rescue_islands(lbl2, sea2, rgb, protos, owner), 0)
