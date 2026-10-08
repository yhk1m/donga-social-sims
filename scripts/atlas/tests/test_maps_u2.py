# © 2026 김용현
# scripts/atlas/tests/test_maps_u2.py — maps_u2.json 형식 검사
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring'}


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
                if m.get('georef', True) is False: continue  # 양식화된 모식도(p22-kashmir)는 맞추기 없음
                self.assertTrue(m['graticuleLabels'] or len(m['controls']) >= 4)

    def test_georef_flag(self):
        # 맞추기 제외 목록의 단일 출처: "georef": false (현재 p22-kashmir 만)
        self.assertEqual([m['id'] for m in self.maps if m.get('georef', True) is False], ['p22-kashmir'])
        for m in self.maps: self.assertIn(m.get('georef', True), (True, False))

    def test_controls_shape(self):
        for m in self.maps:
            for c in m['controls']:
                with self.subTest(id=m['id'], c=c['name']):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])

    def test_city_controls_only_on_general_maps(self):
        # 일반도(16·18·19쪽)만 도시 기호 기준점(src:'city', Natural Earth 짝)을 쓰고, 그 까닭을 controlsNote 에 적는다
        for m in self.maps:
            city = [c for c in m['controls'] if c.get('src') == 'city']
            with self.subTest(id=m['id']):
                if m['id'] in ('p16-asia', 'p18-east-asia', 'p19-southeast-asia'):
                    self.assertGreaterEqual(len(city), 10)
                    self.assertIn('Natural Earth', m['controlsNote'])
                    for c in city: self.assertTrue(c['ne'] and c['name'])
                else:
                    self.assertEqual(city, [])


if __name__ == '__main__': unittest.main()
