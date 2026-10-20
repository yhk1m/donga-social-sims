# © 2026 김용현
# scripts/atlas/tests/test_country_class.py — 나라 단위 단계구분도(country_class.py) 검사: 합성 쪽(사각형 나라 + 범례색 면)
import os, sys, unittest
from shapely.geometry import box

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import country_class as cc

LEGEND = [{'cls': 'c1', 'color': '#e8562a', 'label': '80~100', 'kind': 'fill'}, {'cls': 'c2', 'color': '#f6b26b', 'label': '70~80', 'kind': 'fill'},
          {'cls': 'c3', 'color': '#fde3a7', 'label': '50 이하', 'kind': 'fill'}]
ORDER = ['c1', 'c2', 'c3']
# 합성 「쪽」: 경위도 → 지면 xy = (10·lon + 100, 200 − 10·lat) (북쪽이 위)
proj_pt = lambda p: [10 * p[0] + 100, 200 - 10 * p[1]]
project = lambda by: {iso: [proj_pt(p) for p in pts] for iso, pts in by.items()}
FRAME = box(100, 40, 300, 200)                       # 지면 틀 = 경위도 0~20°E, 0~16°N
# 범례색 면(지면): 나라 AAA(경위도 0~8 × 0~8) 자리는 c1, BBB(10~18 × 0~8) 자리는 c2, CCC(0~8 × 9~15)는 왼쪽 반 c1·오른쪽 반 c3
ZONES = {'c1': box(100, 120, 180, 200).union(box(100, 50, 140, 110)), 'c2': box(200, 120, 280, 200), 'c3': box(140, 50, 180, 110)}


class Samples(unittest.TestCase):
    def test_rep_point_first_and_grid_inside(self):
        pts = cc.sample_points(box(0, 0, 9, 9))
        self.assertEqual(len(pts), 10)                     # representative_point + 3×3
        self.assertTrue(box(0, 0, 9, 9).contains(box(*pts[0], *pts[0]).centroid))
        # ㄱ자 나라: 격자 칸 가운데 중 나라 밖 점은 뺀다
        L = box(0, 0, 9, 3).union(box(0, 0, 3, 9))
        self.assertEqual(len(cc.sample_points(L)), 1 + 5)


class Classify(unittest.TestCase):
    def countries(self):
        return [('AAA', box(0, 0, 8, 8)), ('BBB', box(10, 0, 18, 8)), ('CCC', box(0, 9, 8, 15)), ('OUT', box(40, 40, 45, 45)),
                ('SEA', box(19.2, 12, 19.8, 15))]

    def test_majority_absent_unclassified(self):
        classes, rep = cc.classify_countries(self.countries(), project, ZONES, ORDER, FRAME)
        self.assertEqual(classes['AAA'], 'c1')
        self.assertEqual(classes['BBB'], 'c2')
        self.assertEqual(rep['absent'], ['OUT'])            # 표본이 모두 틀 밖 → 지도에 없는 나라
        self.assertEqual(rep['unclassified'], ['SEA'])      # 틀 안이지만 어느 범례색 면에도 안 듦

    def test_split_votes_warned(self):
        classes, rep = cc.classify_countries(self.countries(), project, ZONES, ORDER, FRAME)
        self.assertEqual(classes['CCC'], 'c1')              # 왼쪽 두 열 + 가운데 representative_point 가 c1 (7 : 3)
        self.assertEqual(rep['split'], [])
        # 표본이 반으로 갈리면 경고, 같은 표면 첫 표본(representative_point)의 분류
        c, r = cc.classify({'DDD': [[150, 80], [120, 80], [160, 80], [170, 60]]}, ZONES, ORDER, FRAME)
        self.assertEqual((c['DDD'], r['split'], r['votes']['DDD']), ('c3', [], {'c3': 3, 'c1': 1}))
        c, r = cc.classify({'DDD': [[150, 80], [120, 80], [110, 80], [170, 60]]}, ZONES, ORDER, FRAME)
        self.assertEqual(r['split'], ['DDD'])
        self.assertEqual(c['DDD'], 'c3')                    # c1 2 : c3 2 → 첫 표본(150, 80)이 c3

    def test_drawn_on_top_wins_via_zones(self):
        # zones 는 vector_zones 가 위에 그린 것 우선으로 뺀 결과 — 겹치지 않으므로 점 하나는 한 분류
        self.assertEqual(cc.zone_at([150, 150], ZONES, ORDER), 'c1')
        self.assertIsNone(cc.zone_at([190, 150], ZONES, ORDER))


    def test_window_samples_inside_for_partly_shown_country(self):
        # 틀에 일부만 든 큰 나라(경위도 15~60°E): 나라 전체 상자로 찍으면 representative_point·격자가 거의 틀 밖 → window(틀을 되돌린 면) 안에서 찍는다
        big = [('RUS', box(15, 0, 60, 8))]
        classes, rep = cc.classify_countries(big, project, ZONES, ORDER, FRAME)
        self.assertNotEqual(classes.get('RUS'), 'c2')
        window = box(0, 0, 20, 16)
        classes, rep = cc.classify_countries(big + [('FAR', box(40, 0, 50, 5))], project, ZONES, ORDER, FRAME, window=window)
        self.assertEqual(classes['RUS'], 'c2')               # 틀 안쪽 15~18°E 는 c2 면
        self.assertIn('FAR', rep['absent'])


class Overrides(unittest.TestCase):
    def test_apply_by_label_cls_and_none(self):
        classes = {'AAA': 'c1', 'BBB': 'c2', 'KOS': 'c3'}
        out, log = cc.apply_overrides(classes, {'BBB': {'label': '50 이하', 'why': '교과서는 50 이하'}, 'XKX': {'cls': 'c2', 'why': '코소보'},
                                                'KOS': {'cls': None, 'why': '교과서에 없음'}, '_doc': {}}, LEGEND)
        self.assertEqual(out, {'AAA': 'c1', 'BBB': 'c3', 'XKX': 'c2'})
        self.assertEqual([(o['iso'], o['cls'], o['was']) for o in log], [('BBB', 'c3', 'c2'), ('XKX', 'c2', None), ('KOS', None, 'c3')])

    def test_unknown_or_no_reason_rejected(self):
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'AAA': {'cls': 'c9', 'why': 'x'}}, LEGEND)
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'AAA': {'label': '없는 이름', 'why': 'x'}}, LEGEND)
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'AAA': {'cls': 'c1'}}, LEGEND)


if __name__ == '__main__': unittest.main()
