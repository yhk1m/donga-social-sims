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


class Outline(unittest.TestCase):
    def test_band_inside_border_marks_country_not_neighbour(self):
        # 지면 나라 A(0~40)·B(40~80) 이웃, A 경계 안쪽에 너비 1pt 띠(유로 사용국 노란 테두리) → A 만 윤곽 분류, B(스위스 꼴)는 아님
        A, B = box(0, 0, 40, 40), box(40, 0, 80, 40)
        band = A.difference(A.buffer(-1.0))
        got = cc.outline_members({'AAA': A, 'BBB': B}, {'c3': band}, box(-10, -10, 90, 50))
        self.assertEqual(got, {'AAA': ['c3']})
        # 줄이면 없어지는 작은 나라: 면 반 이상이 띠면
        tiny = box(10, 10, 11.2, 11.2)
        self.assertEqual(cc.outline_members({'TNY': tiny}, {'c3': tiny}, box(0, 0, 50, 50)), {'TNY': ['c3']})

    def test_merge_and_list_overrides(self):
        self.assertEqual(cc.merge_classes({'AAA': 'c1', 'BBB': 'c2'}, {'AAA': ['c3'], 'LUX': ['c3']}), {'AAA': ['c1', 'c3'], 'BBB': 'c2', 'LUX': 'c3'})
        out, log = cc.apply_overrides({'LUX': 'c3'}, {'LUX': {'label': ['80~100', '50 이하'], 'why': '작아서 띠에 덮임'}}, LEGEND)
        self.assertEqual(out['LUX'], ['c1', 'c3'])
        out, _ = cc.apply_overrides({}, {'LUX': {'cls': ['c1', 'c3'], 'why': 'x'}}, LEGEND)
        self.assertEqual(out['LUX'], ['c1', 'c3'])
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'LUX': {'cls': ['c1', 'c9'], 'why': 'x'}}, LEGEND)


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


class Levels(unittest.TestCase):
    """U3-3 리뷰(중요 1): 분류는 50m 나라로 뽑지만 앱은 10a(10m 을 단원 상자로 자름)도 그린다 — 두 상세도 iso 대조, 10a 에만 있는 나라도 분류."""
    def test_level_check_reports_one_level_only(self):
        r = cc.level_check(['AAA', 'GIB', 'OLD', 'ZZZ'], have50={'AAA', 'OLD'}, have10a={'AAA', 'GIB'})
        self.assertEqual(r, {'only50': ['OLD'], 'only10a': ['GIB'], 'neither': ['ZZZ']})

    def test_extra_10a_countries_inside_unit_boxes(self):
        c50 = [('AAA', box(0, 0, 8, 8))]
        c10 = [('AAA', box(0, 0, 8, 8)), ('GIB', box(5, 5, 5.1, 5.1)), ('FAR', box(100, 0, 101, 1))]
        self.assertEqual([i for i, _ in cc.extra_10a(c50, c10, [[-10, -10, 20, 20]])], ['GIB'])

    def test_small_state_needs_check_when_not_drawn_alone(self):
        # 작은 나라(지면 넓이 < smallPt2): 표본이 든 분류 면 조각이 나라보다 훨씬 크면(이웃 나라 면에 묻힘) 또는 분류가 없으면 확인 필요
        states = {'SMR': {'pt2': 0.3, 'comp': 0.35, 'cls': 'c1'},       # 교과서가 따로 칠함
                  'VAT': {'pt2': 0.01, 'comp': 1115.0, 'cls': 'c2'},    # 이탈리아 면에 묻힘
                  'LIE': {'pt2': 0.6, 'comp': None, 'cls': None},       # 분류 없음(띠·범례 상자 밑)
                  'FRA': {'pt2': 2000.0, 'comp': 2300.0, 'cls': 'c1'}}  # 큰 나라는 보지 않음
        got = cc.small_state_issues(states, small_pt2=8.0)
        self.assertEqual([i for i, _ in got], ['LIE', 'VAT'])

    def test_component_area_of_zone_part(self):
        zones = {'c1': box(0, 0, 10, 10).union(box(20, 20, 21, 21))}
        self.assertAlmostEqual(cc.component_area(zones, 'c1', (20.5, 20.5)), 1.0)
        self.assertAlmostEqual(cc.component_area(zones, 'c1', (5, 5)), 100.0)
        self.assertIsNone(cc.component_area(zones, 'c1', (15, 15)))
        self.assertIsNone(cc.component_area(zones, None, (5, 5)))

    def test_drawn_area_topmost_item(self):
        # 벡터 지도: 같은 분류 이웃(안도라 c1 ↔ 에스파냐 c1)과 합친 면 조각 대신, 그 점을 덮은 맨 위 채움 도형 하나의 넓이
        items = [('c1', box(0, 0, 50, 50)), ('c1', box(10, 10, 11, 11)), ('c2', box(30, 30, 31, 31))]
        self.assertEqual(cc.drawn_area(items, (10.5, 10.5)), ('c1', 1.0))
        self.assertEqual(cc.drawn_area(items, (5, 5)), ('c1', 2500.0))
        self.assertEqual(cc.drawn_area(items, (60, 60)), (None, None))

    def test_lon_span_over_180_rejected(self):
        # 날짜변경선을 넘는 틀(되돌린 고리 경도 170°E … −170°)은 아직 다루지 않음 → ValueError
        with self.assertRaises(ValueError): cc.check_lon_span([(170, 60), (179, 62), (-179, 62), (-170, 60)])
        cc.check_lon_span([(-30, 30), (70, 30), (70, 75), (-30, 75)])   # 유럽 틀(폭 100°)은 통과

    def test_override_needs_exactly_one_of_cls_label(self):
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'AAA': {'cls': 'c1', 'label': '80~100', 'why': 'x'}}, LEGEND)
        with self.assertRaises(ValueError): cc.apply_overrides({}, {'AAA': {'why': 'x'}}, LEGEND)
        out, _ = cc.apply_overrides({'AAA': 'c1'}, {'AAA': {'cls': None, 'why': '분류 없음'}}, LEGEND)
        self.assertEqual(out, {})


class MultiFill(unittest.TestCase):
    """다중 채움 줄무늬(설정 multi — U4-3a): 표본을 늘리고 둘 이상 분류가 minShare 를 넘으면 배열."""
    @staticmethod
    def stripes():
        from shapely.ops import unary_union
        # 나라 SSS(경위도 0~8 × 0~8 → 지면 x 100~180) 안을 세로 띠 3pt 씩 c1·c2 번갈아(교과서 줄무늬 꼴), 나라 BBB(10~18) 자리는 c2 한 색
        a = unary_union([box(100 + 6 * i, 120, 103 + 6 * i, 200) for i in range(14)])
        b = unary_union([box(103 + 6 * i, 120, 106 + 6 * i, 200) for i in range(14)]).union(box(200, 120, 280, 200))
        return {'c1': a, 'c2': b.difference(a)}

    def countries(self):
        return [('SSS', box(0, 0, 8, 8)), ('BBB', box(10, 0, 18, 8))]

    def test_two_colour_stripes_become_list_one_colour_stays(self):
        classes, rep = cc.classify_countries(self.countries(), project, self.stripes(), ORDER, FRAME, grid=7, multi={'minShare': 0.25})
        self.assertIsInstance(classes['SSS'], list)
        self.assertEqual(sorted(classes['SSS']), ['c1', 'c2'])
        v = rep['votes']['SSS']
        self.assertEqual(classes['SSS'][0], max(v, key=lambda c: (v[c], -ORDER.index(c))))   # 많은 표가 먼저
        self.assertEqual(classes['BBB'], 'c2')
        self.assertEqual(rep['multi'], ['SSS'])
        self.assertNotIn('SSS', rep['split'])

    def test_without_multi_majority_unchanged(self):
        z = self.stripes()
        a, ra = cc.classify_countries(self.countries(), project, z, ORDER, FRAME)
        b, rb = cc.classify_countries(self.countries(), project, z, ORDER, FRAME, grid=3, multi=None)
        self.assertEqual(a, b)
        self.assertIsInstance(a['SSS'], str)
        self.assertNotIn('multi', ra)
        # 기존 합성 쪽(ZONES)도 multi 없이는 지금 결과 그대로
        c = Classify().countries()
        self.assertEqual(cc.classify_countries(c, project, ZONES, ORDER, FRAME), cc.classify_countries(c, project, ZONES, ORDER, FRAME, multi=None))

    def test_minor_share_below_threshold_not_listed_and_max(self):
        c, _ = cc.classify({'DDD': [[150, 80]] * 8 + [[120, 80]] * 2}, ZONES, ORDER, FRAME, multi={'minShare': 0.25})
        self.assertEqual(c['DDD'], 'c3')                    # c1 은 20% — minShare 아래
        three = [[150, 80]] * 4 + [[120, 80]] * 3 + [[220, 150]] * 3
        c, _ = cc.classify({'EEE': three}, ZONES, ORDER, FRAME, multi={'minShare': 0.25, 'max': 2})
        self.assertEqual(c['EEE'], ['c3', 'c1'])            # 4 : 3 : 3 → 많은 차례, 같은 표면 범례 차례, 최대 2

    def test_merge_keeps_fill_list_then_outline(self):
        self.assertEqual(cc.merge_classes({'MAR': ['c1', 'c2']}, {'MAR': ['c3']}), {'MAR': ['c1', 'c2', 'c3']})




class AreaShares(unittest.TestCase):
    """줄무늬 넓이 몫(multi.areaInsetPt — U4-4): 표본 격자가 줄 주기와 맞물려 한 색만 줍는 경우도 넓이로는 두 색."""
    def test_aliasing_grid_vs_area(self):
        from shapely.ops import unary_union
        # 나라 SSS(지면 x 100~180) 안 세로 띠 폭 1pt·주기 2pt: 7×7 격자(나라 상자 80pt → 칸 11.43pt, 첫 칸 가운데 105.7) — 띠와 상관없이 표가 갈리지만
        # 띠 주기를 격자 간격과 같게 맞추면 칸 가운데(c2)만 걸린다 → 넓이 몫은 40 : 60
        step = 80 / 7
        a = unary_union([box(100 + step * i, 120, 100 + step * i + step * 0.4, 200) for i in range(7)])   # 각 칸 왼쪽 40% = c1
        b = box(100, 120, 180, 200).difference(a)
        zones = {'c1': a, 'c2': b}
        page = {'SSS': box(100, 120, 180, 200), 'BBB': box(200, 120, 280, 200)}
        zones['c3'] = box(200, 120, 280, 200)
        classes, shares = cc.area_classes(page, zones, ['c1', 'c2', 'c3'], FRAME, {'minShare': 0.25}, inset=1.0)
        self.assertEqual(sorted(classes['SSS']), ['c1', 'c2'])
        self.assertAlmostEqual(shares['SSS']['c1'], 0.4, delta=0.05)
        self.assertEqual(classes['BBB'], 'c3')
        g, _ = cc.classify_countries([('SSS', box(0, 0, 8, 8))], project, zones, ['c1', 'c2', 'c3'], FRAME, grid=7, multi={'minShare': 0.25})
        self.assertEqual(g['SSS'], 'c2', '표본 격자는 칸 가운데(오른쪽 반)만 걸려 한 색 — 맞물림')

    def test_inset_drops_thin_border_contamination_and_keeps_tiny(self):
        page = {'BIG': box(100, 120, 180, 200), 'TINY': box(150, 60, 151, 61)}
        zones = {'c1': box(100, 120, 179.5, 200).union(box(150, 60, 151, 61)), 'c2': box(179.5, 120, 200, 200)}   # 오른쪽 0.5pt 만 이웃 색
        classes, shares = cc.area_classes(page, zones, ['c1', 'c2'], FRAME, {'minShare': 0.25}, inset=1.0)
        self.assertEqual(classes['BIG'], 'c1'); self.assertNotIn('c2', shares['BIG'])
        self.assertEqual(classes['TINY'], 'c1', '줄이면 없어지는 작은 나라는 면 그대로')


class ManualLegend(unittest.TestCase):
    def test_manual_legend_order_and_errors(self):
        import legend as LG
        leg = LG.manual_legend([{'color': '#2FA3DC', 'label': '기니'}, {'color': '#6dcff6', 'label': '가나'}])
        self.assertEqual([(e['cls'], e['color'], e['label'], e['kind']) for e in leg], [('c1', '#2fa3dc', '기니', 'fill'), ('c2', '#6dcff6', '가나', 'fill')])
        with self.assertRaises(ValueError): LG.manual_legend([{'color': '#000000'}])


if __name__ == '__main__': unittest.main()
