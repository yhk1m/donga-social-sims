# © 2026 김용현
# scripts/atlas/tests/test_route_fan.py — 대권 노선 자료(route_fan.py, U1-3g) 검사: 합성 점·선(PDF 없이)
#   python -I -m unittest discover -s scripts/atlas/tests -p test_route_fan.py
import os, sys, unittest

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import route_fan as rf

HUB = (100.0, 50.0)


def line(to, frm=HUB):
    return [frm, ((frm[0] + to[0]) / 2, (frm[1] + to[1]) / 2 - 3), to]


class Hub(unittest.TestCase):
    def test_hub_is_shared_endpoint(self):
        ends = [(150, 60), (40, 20), (120, 90), (101, 49)]
        lines = [line(e, (HUB[0] + 0.05 * k, HUB[1])) for k, e in enumerate(ends)]
        lines[1] = list(reversed(lines[1]))                     # 선 방향이 거꾸로여도
        h = rf.hub_of(lines)
        self.assertAlmostEqual(h[0], 100.075, places=6); self.assertAlmostEqual(h[1], 50.0, places=6)

    def test_hub_needs_lines(self):
        with self.assertRaises(ValueError): rf.hub_of([])


class Match(unittest.TestCase):
    def test_lines_and_lineless_dots(self):
        dots = [(150, 60), (40, 20), (120, 90), (300, 10)]       # 마지막 점은 선 없음
        lines = [line(d) for d in dots[:3]]
        m = rf.match_dots(dots, lines, HUB, tol=1.0)
        self.assertEqual(m['withLine'], [0, 1, 2]); self.assertEqual(m['lineless'], [3]); self.assertEqual(m['loose'], [])

    def test_line_without_dot_is_loose(self):
        m = rf.match_dots([(150, 60)], [line((150, 60)), line((10, 10))], HUB, tol=1.0)
        self.assertEqual(m['loose'], [1])

    def test_two_lines_one_dot(self):
        m = rf.match_dots([(150, 60)], [line((150, 60)), line((150.2, 60.1))], HUB, tol=1.0)
        self.assertEqual(m['withLine'], [0]); self.assertEqual(m['shared'], {0: 2})


class Dots(unittest.TestCase):
    def test_merge_and_origin_cluster(self):
        dots = [(150, 60), (150.1, 60.05), (101, 50.5), (40, 20)]   # 둘째 = 첫째 사본, 셋째 = 출발점 둘레
        keep, rep = rf.clean_dots(dots, HUB, dup_pt=0.3, origin_pt=2.0)
        self.assertEqual(keep, [(150, 60), (40, 20)])
        self.assertEqual(rep, {'duplicates': 1, 'originCluster': 1})

    def test_page_dots_filter(self):
        ds = [{'fill': '#ed1c24', 'rect': (10, 10, 11.45, 11.45)},
              {'fill': '#ed1c24', 'rect': (20, 20, 30, 30)},                # 너무 큼(점 아님)
              {'fill': '#005496', 'rect': (40, 40, 41.4, 41.4)},             # 다른 색(비행기 그림)
              {'fill': '#ed1c24', 'rect': (500, 500, 501.4, 501.4)}]         # 지도 틀 밖
        got = rf.page_dots(ds, '#ed1c24', 2.5, (0, 0, 100, 100), [])
        self.assertEqual(got, [(10.725, 10.725)])
        self.assertEqual(rf.page_dots(ds, '#ed1c24', 2.5, (0, 0, 100, 100), [(5, 5, 15, 15)]), [])


class Layer(unittest.TestCase):
    CFG = {'id': 'p14-routes', 'map': 'p14-routes', 'legend': [{'cls': 'route', 'label': '인천 국제공항 직항 노선', 'color': '#f072ab', 'kind': 'line'}],
           'width': 0.6, 'digits': 2}

    def test_layer_json_shape(self):
        out = rf.layer_json(self.CFG, {'page': 14, 'title': '우리나라의 항공망', 'kind': 'routes'}, [126.44, 37.46],
                            [[-0.4512, 51.4712], [139.781, 35.553], None, [-0.4512, 51.4712]])
        p = out['properties']
        self.assertEqual(p['layerType'], 'routeFan'); self.assertEqual(p['origin'], [126.44, 37.46]); self.assertFalse(p['arrow'])
        self.assertEqual(len(p['legend']), 1); self.assertEqual(p['width'], 0.6)
        self.assertEqual(len(out['features']), 1)                                    # 분류 하나 = MultiPoint 하나(용량)
        f = out['features'][0]
        self.assertEqual(f['properties'], {'cls': 'route'}); self.assertEqual(f['geometry']['type'], 'MultiPoint')
        self.assertEqual(f['geometry']['coordinates'], [[-0.45, 51.47], [139.78, 35.55]])   # 실패 null·같은 점 뺌, 경도 차례

    def test_layer_json_needs_legend(self):
        with self.assertRaises(ValueError): rf.layer_json({**self.CFG, 'legend': []}, {'page': 14}, [126.44, 37.46], [[0, 0]])


if __name__ == '__main__':
    unittest.main()
