# © 2026 김용현
# scripts/atlas/tests/test_controls.py — 기준점 추출(extract_vectors.controls) 검사
import json, os, subprocess, sys, unittest
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
        # 경위선 교차점은 10° 격자 위, 그 밖에는 도시 기호 기준점(src:'city', maps_u2.json)만
        cps = ev.controls('p16-asia')
        self.assertEqual({c['src'] for c in cps}, {'grid', 'city'})
        for c in cps:
            if c['src'] != 'grid': continue
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


def controls_u3(map_id, unit_id='u3'):
    """단원 u3(ATLAS_UNIT=u3, unit_id 로 다른 단원) 의 extract_vectors.controls(map_id) — 이 모듈은 u2 로 import 되므로 하위 프로세스로."""
    here = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    env = {k: v for k, v in os.environ.items() if k not in ('ATLAS_UNIT', 'ATLAS_UNIT_CONFIG')}
    env['ATLAS_UNIT'] = unit_id
    code = (f'import sys, json; sys.path.insert(0, {here!r}); import extract_vectors as ev; '
            f'sys.stdout.buffer.write(json.dumps(ev.controls({map_id!r})).encode("utf-8"))')
    r = subprocess.run([sys.executable, '-I', '-c', code], env=env, capture_output=True)
    if r.returncode != 0: raise AssertionError(r.stderr.decode('utf-8', 'replace'))
    return json.loads(r.stdout.decode('utf-8'))


@NEED_PDF
class ControlsU3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p26 = controls_u3('p26-europe')

    def test_p26_controls(self):
        # 26쪽 유럽 일반도: 경위선 교차점 + 도시 기호 기준점, 모두 경위도 범위 안
        self.assertGreaterEqual(len(self.p26), 12)
        for c in self.p26:
            self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
            self.assertEqual(len(c['xy']), 2)

    def test_p26_grid_on_10deg_lattice(self):
        grid = [c for c in self.p26 if c['src'] == 'grid']
        self.assertGreaterEqual(len(grid), 20)          # 눈금 글자 21개 → 경선 8 × 위선 4 중 지도 안 교차점
        self.assertEqual({c['src'] for c in self.p26}, {'grid', 'city'})
        for c in grid:
            self.assertEqual(c['lon'] % 10, 0); self.assertEqual(c['lat'] % 10, 0)


@NEED_PDF
class ControlsU4(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p34 = controls_u3('p34-africa', 'u4')

    def test_p34_controls(self):
        # 34쪽 아프리카 일반도: 경위선 교차점 + 도시 기호 기준점, 모두 경위도 범위·지도 둘레(남유럽·서아시아) 안
        self.assertGreaterEqual(len(self.p34), 12)
        for c in self.p34:
            self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
            self.assertTrue(-37 <= c['lon'] <= 67 and -39 <= c['lat'] <= 42, (c['lon'], c['lat']))
            self.assertEqual(len(c['xy']), 2)

    def test_p34_grid_on_10deg_lattice(self):
        # 눈금 글자 32개 → 경선 10 × 위선 6(적도는 가는 사각 채움 're' 라 경위선 후보가 아님 — 「0˚」 위선 글자 2개는 버림)
        grid = [c for c in self.p34 if c['src'] == 'grid']
        self.assertGreaterEqual(len(grid), 40)
        self.assertEqual({c['src'] for c in self.p34}, {'grid', 'city'})
        self.assertGreaterEqual(sum(c['src'] == 'city' for c in self.p34), 10)
        for c in grid:
            self.assertEqual(c['lon'] % 10, 0); self.assertEqual(c['lat'] % 10, 0)


@NEED_PDF
class ControlsU5(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.maps = {mid: controls_u3(mid, 'u5') for mid in ('p40-americas', 'p42-north', 'p43-south')}

    def test_general_maps_controls(self):
        # 40·42·43쪽 일반도: 경위선 교차점 + 도시 기호 기준점 ≥ 12, 모두 경위도 범위 안(40쪽은 서유럽·서아프리카 끝 — 리스본·파리·니스까지)
        for mid, cps in self.maps.items():
            self.assertGreaterEqual(len(cps), 12, mid)
            self.assertEqual({c['src'] for c in cps}, {'grid', 'city'}, mid)
            for c in cps:
                self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                self.assertTrue(-180 <= c['lon'] <= 8 and -65 <= c['lat'] <= 83, (mid, c['lon'], c['lat']))   # places.neBox
                self.assertEqual(len(c['xy']), 2)

    def test_p40_inset_excluded(self):
        # 40쪽 본 지도: 삽입 「중앙아메리카」 틀(excludeBoxes) 안의 교차점이 없고, 교차점은 20° 격자(본 지도 눈금 글자)
        grid = [c for c in self.maps['p40-americas'] if c['src'] == 'grid']
        self.assertGreaterEqual(len(grid), 30)
        for c in grid:
            self.assertFalse(50 <= c['xy'][0] <= 393 and 469 <= c['xy'][1] <= 645, c)
            self.assertEqual(c['lon'] % 20, 0); self.assertEqual(c['lat'] % 20, 0)

if __name__ == '__main__': unittest.main()
