# © 2026 김용현
# scripts/atlas/tests/test_controls.py — 기준점 추출(extract_vectors.controls) 검사
import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_vectors as ev

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Labels(unittest.TestCase):
    def test_parse_degree_labels(self):
        self.assertEqual(ev.parse_labels('100˚E'), [('lon', 100.0, 0, 5)])
        self.assertEqual(ev.parse_labels('10°S'), [('lat', -10.0, 0, 4)])
        self.assertEqual(ev.parse_labels('0˚'), [('zero', 0.0, 0, 2)])
        self.assertEqual(ev.parse_labels('20˚W'), [('lon', -20.0, 0, 4)])
        self.assertEqual([x[:2] for x in ev.parse_labels('80˚E 100˚E')], [('lon', 80.0), ('lon', 100.0)])
        self.assertEqual(ev.parse_labels('(°C)'), [])
        self.assertEqual(ev.parse_labels('25˚'), [])          # 방향 없는 0 아닌 값(기온 등)

    def test_out_of_range_rejected(self):
        self.assertEqual(ev.parse_labels('190˚E'), [])
        self.assertEqual(ev.parse_labels('95˚N'), [])
        self.assertEqual(ev.parse_labels('180˚W'), [('lon', -180.0, 0, 5)])


class Geometry(unittest.TestCase):
    def test_dist_to_polyline(self):
        P = np.array([[0, 0], [10, 0], [10, 10]], float)
        self.assertAlmostEqual(ev._dist_to_polyline((5, 3), P), 3)
        self.assertAlmostEqual(ev._dist_to_polyline((13, 5), P), 3)
        self.assertAlmostEqual(ev._dist_to_polyline((-3, -4), P), 5)   # 끝점 바깥

    def test_intersections(self):
        P = np.array([[0, 0], [10, 10]], float)
        Q = np.array([[0, 10], [10, 0]], float)
        (x, y), = ev._intersections(P, Q)
        self.assertAlmostEqual(x, 5); self.assertAlmostEqual(y, 5)
        # 꺾인 선은 두 번 만난다
        Z = np.array([[0, 2], [10, 2], [10, 8], [0, 8]], float)
        V = np.array([[5, -1], [5, 11]], float)
        self.assertEqual(sorted(round(p[1], 6) for p in ev._intersections(Z, V)), [2, 8])
        # 평행·떨어진 선은 없음
        self.assertEqual(ev._intersections(P, P + [0, 1]), [])


class Assign(unittest.TestCase):
    H = np.array([[0, 50], [100, 50]], float)     # 가로선(위선)
    V = np.array([[50, 0], [50, 100]], float)     # 세로선(경선)

    def lab(self, kind, v, c): return {'kind': kind, 'value': v, 'c': c, 'text': f'{v}'}

    def test_nearest_and_zero_direction(self):
        votes, rej = ev.assign_labels([self.lab('lat', 30, (10, 48)), self.lab('zero', 0, (52, 90)),
                                       self.lab('zero', 0, (90, 51))], [self.H, self.V])
        self.assertEqual(votes[0], {('lat', 30): 1, ('lat', 0.0): 1})
        self.assertEqual(votes[1], {('lon', 0.0): 1})   # 세로선 옆 0˚ → 본초 자오선
        self.assertEqual(rej, [])

    def test_ambiguous_and_far_rejected(self):
        votes, rej = ev.assign_labels([self.lab('lat', 30, (51, 51.2)), self.lab('lat', 30, (10, 80))], [self.H, self.V])
        self.assertEqual(votes, [{}, {}])
        self.assertEqual([r['why'] for r in rej], ['ambiguous', 'far'])

    def test_pieces_of_same_line_not_ambiguous(self):
        H2 = np.array([[100, 50.3], [200, 50.3]], float)   # 같은 위선의 다음 조각
        votes, rej = ev.assign_labels([self.lab('lat', 30, (99, 49))], [self.H, H2, self.V])
        self.assertEqual(rej, [])
        self.assertEqual(votes[0], {('lat', 30): 1})


@NEED_PDF
class Controls(unittest.TestCase):
    def test_p16_controls(self):
        cps = ev.controls('p16-asia')
        self.assertGreaterEqual(len(cps), 12)
        for c in cps:
            self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
            self.assertEqual(len(c['xy']), 2)

    def test_p16_grid_points_on_10deg_lattice(self):
        for c in ev.controls('p16-asia'):
            self.assertEqual(c['src'], 'grid')
            self.assertEqual(c['lon'] % 10, 0); self.assertEqual(c['lat'] % 10, 0)

    def test_p16_known_intersection(self):
        # 100˚E 경선은 x=440.3 의 곧은 선(중앙 경선), 0˚ 적도는 y≈600.6
        c = [c for c in ev.controls('p16-asia') if c['lon'] == 100 and c['lat'] == 0]
        self.assertEqual(len(c), 1)
        self.assertAlmostEqual(c[0]['xy'][0], 440.3, delta=0.3)
        self.assertAlmostEqual(c[0]['xy'][1], 600.6, delta=0.5)

    def test_all_graticule_maps(self):
        for mid in ('p18-east-asia', 'p19-southeast-asia', 'p21-climate'):
            with self.subTest(id=mid):
                self.assertGreaterEqual(len(ev.controls(mid)), 8)

    def test_manual_controls_passthrough(self):
        cps = ev.controls('p23-growth')
        self.assertEqual(len(cps), 8)
        self.assertTrue(all(c['src'] == 'manual' for c in cps))

    def test_p16_report_dropped(self):
        rep = {}
        ev.grid_controls(ev.maps()['p16-asia'], report=rep)
        self.assertEqual(set(rep['dropped']), {'labels', 'ties', 'spread'})

    def test_kashmir_has_none(self):
        self.assertEqual(ev.controls('p22-kashmir'), [])


if __name__ == '__main__': unittest.main()
