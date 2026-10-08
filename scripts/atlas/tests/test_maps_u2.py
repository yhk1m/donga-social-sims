# © 2026 김용현
# scripts/atlas/tests/test_maps_u2.py — maps_u2.json 형식 검사
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring'}
NO_CONTROLS_OK = {'p22-kashmir'}  # 양식화된 모식도라 기준점을 만들 수 없음(notes 참고)


class MapsU2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u2.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)

    def test_count(self):
        self.assertEqual(len(self.maps), 17)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']}-"), m['id'])
            self.assertTrue(16 <= m['page'] <= 25)

    def test_kinds(self):
        for m in self.maps:
            self.assertIn(m['kind'], KINDS, m['id'])

    def test_boxes_inside_page(self):
        for m in self.maps:
            for key in ('bbox', 'legendBbox', 'cartoucheBbox', 'insetBbox', 'locatorBbox'):
                b = m.get(key)
                if b is None: continue
                with self.subTest(id=m['id'], key=key):
                    x0, y0, x1, y1 = b
                    self.assertTrue(0 <= x0 < x1 <= PAGE_W and 0 <= y0 < y1 <= PAGE_H, b)

    def test_georef_source(self):
        for m in self.maps:
            with self.subTest(id=m['id']):
                if m['id'] in NO_CONTROLS_OK: continue
                self.assertTrue(m['graticuleLabels'] or len(m['controls']) >= 4)

    def test_controls_shape(self):
        for m in self.maps:
            for c in m['controls']:
                with self.subTest(id=m['id'], c=c['name']):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])


if __name__ == '__main__': unittest.main()
