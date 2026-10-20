# © 2026 김용현
# scripts/atlas/tests/test_maps_u3.py — maps_u3.json(Ⅲ 유럽 지도 목록) 형식 검사 (test_maps_u2.py 꼴)
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring',                      # 1단계
         'urban', 'green-capital', 'ev-chargers', 'eu', 'separatism', 'belgium', 'italy', 'locator'}   # 유럽에서 새로
IDS = ['p26-europe', 'p27-coloring', 'p28-relief', 'p29-climate', 'p29-climate-iceland', 'p29-jan', 'p29-jul', 'p30-urban',
       'p31-green-capital', 'p31-lisbon', 'p32-eu', 'p32-separatism', 'p32-belgium', 'p32-italy', 'p33-locator']


class MapsU3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u3.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)

    def test_count_and_ids(self):
        # 2단계 설계 §5.1: 지도 15(일반도·색칠·지형·기후 4·도시화·녹색 수도·리스본·EU·분리·벨기에·이탈리아·33쪽 위치도)
        self.assertEqual([m['id'] for m in self.maps], IDS)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']}-"), m['id'])
            self.assertTrue(26 <= m['page'] <= 33)

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
        # 모든 지도를 맞춘다(모식도 없음): 경위선 눈금, 기준점 4개 이상, 또는 섬·호수 기준점 원천(shapes + 처음 식 init — U3-2 가 기준점을 씀)
        for m in self.maps:
            with self.subTest(id=m['id']):
                self.assertNotEqual(m.get('georef', True), False)
                self.assertTrue(m['graticuleLabels'] or len(m['controls']) >= 4 or (m.get('shapes') or {}).get('init'))

    def test_shapes_config(self):
        # 눈금 없는 지도는 섬·호수 기준점(land_shapes·shape_controls)의 원천 shapes 와 처음 식 init 을 적는다
        for m in self.maps:
            if m['graticuleLabels']: continue
            with self.subTest(id=m['id']):
                s = m['shapes']
                self.assertIn(s.get('mode', 'vector'), ('vector', 'raster'))
                if s.get('mode', 'vector') == 'vector': self.assertTrue(s.get('land') or s.get('sea'))
                self.assertIn(s.get('target', 'land'), ('land', 'countries'))
                self.assertTrue(s.get('init'), '처음 식(init) 없음')

    def test_controls_shape(self):
        for m in self.maps:
            for c in m['controls']:
                with self.subTest(id=m['id'], c=c['name']):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    self.assertTrue(-32 <= c['lon'] <= 75 and 27 <= c['lat'] <= 75, (c['lon'], c['lat']))   # 유럽 + 둘레
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])


if __name__ == '__main__': unittest.main()
