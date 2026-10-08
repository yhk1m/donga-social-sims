# © 2026 김용현
# scripts/atlas/tests/test_controls.py — 기준점 추출(extract_vectors.controls) 검사
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_vectors as ev

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Labels(unittest.TestCase):
    def test_parse_degree_labels(self):
        self.assertEqual(ev.parse_labels('100˚E'), [('lon', 100.0, 0, 5)])
        self.assertEqual(ev.parse_labels('10°S'), [('lat', -10.0, 0, 4)])
        self.assertEqual(ev.parse_labels('0˚'), [('lat', 0.0, 0, 2)])
        self.assertEqual(ev.parse_labels('20˚W'), [('lon', -20.0, 0, 4)])
        self.assertEqual([x[:2] for x in ev.parse_labels('80˚E 100˚E')], [('lon', 80.0), ('lon', 100.0)])
        self.assertEqual(ev.parse_labels('(°C)'), [])


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

    def test_kashmir_has_none(self):
        self.assertEqual(ev.controls('p22-kashmir'), [])


if __name__ == '__main__': unittest.main()
