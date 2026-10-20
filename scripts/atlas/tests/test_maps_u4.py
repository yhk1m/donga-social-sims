# © 2026 김용현
# scripts/atlas/tests/test_maps_u4.py — maps_u4.json(Ⅳ 아프리카 지도 목록) 형식 검사 (test_maps_u3.py 꼴)
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring',                      # 1단계
         'urban', 'green-capital', 'ev-chargers', 'eu', 'separatism', 'belgium', 'italy', 'locator',  # 유럽
         'language', 'solar', 'afcfta', 'desertification'}                                       # 아프리카에서 새로
IDS = ['p34-africa', 'p35-coloring', 'p36-relief', 'p37-climate', 'p37-jan', 'p37-jul', 'p38-language', 'p38-religion',
       'p38-resources', 'p38-solar', 'p39-afcfta', 'p39-desert']
BOX_KEYS = ('bbox', 'legendBbox', 'cartoucheBbox', 'insetBbox', 'locatorBbox')


class MapsU4(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u4.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)
        cls.by = {m['id']: m for m in cls.maps}

    def test_count_and_ids(self):
        # 계획 쪽 목록: 지도 12(설계 §5.2 의 13 에서 38쪽 「아프리카의 면적 비교」는 삽화라 뺌)
        self.assertEqual([m['id'] for m in self.maps], IDS)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']}-"), m['id'])
            self.assertTrue(34 <= m['page'] <= 39)

    def test_kinds(self):
        for m in self.maps:
            self.assertIn(m['kind'], KINDS, m['id'])

    def test_boxes_inside_page(self):
        for m in self.maps:
            for key in BOX_KEYS:
                b = m.get(key)
                if b is None: continue
                with self.subTest(id=m['id'], key=key):
                    x0, y0, x1, y1 = b
                    self.assertTrue(0 <= x0 < x1 <= PAGE_W and 0 <= y0 < y1 <= PAGE_H, b)

    def test_cover_boxes_overlap_frame(self):
        # 덮개 상자(범례·제목·활동 상자)는 그 지도 틀과 겹쳐야 뜻이 있다
        for m in self.maps:
            fx0, fy0, fx1, fy1 = m['bbox']
            for key in BOX_KEYS[1:]:
                b = m.get(key)
                if b is None: continue
                with self.subTest(id=m['id'], key=key):
                    self.assertTrue(b[0] < fx1 and b[2] > fx0 and b[1] < fy1 and b[3] > fy0, b)

    def test_georef_source(self):
        # 모든 지도를 맞춘다(모식도 없음): 경위선 눈금, 또는 기준점 원천 shapes / 지도 목록 controls
        for m in self.maps:
            with self.subTest(id=m['id']):
                self.assertNotEqual(m.get('georef', True), False)
                self.assertTrue(m['graticuleLabels'] or m.get('shapes') or len(m.get('controls', [])) >= 4)

    def test_shapes_config(self):
        # 눈금 없는 지도는 섬·호수 기준점(land_shapes·shape_controls)의 원천 shapes 와 처음 식 init 을 적는다
        for m in self.maps:
            if m['graticuleLabels'] and 'shapes' not in m: continue
            with self.subTest(id=m['id']):
                s = m['shapes']
                mode = s.get('mode', 'vector')
                self.assertIn(mode, ('vector', 'raster'))
                if mode == 'vector': self.assertTrue(s.get('land') or s.get('sea'))
                self.assertIn(s.get('target', 'land'), ('land', 'countries'))
                if not m['graticuleLabels']: self.assertTrue(s.get('init'), '처음 식(init) 없음')
                init = s.get('init') or {}
                for sd in init.get('seeds', []) + init.get('pts', []):
                    self.assertTrue(-180 <= sd['at'][0] <= 180 and -90 <= sd['at'][1] <= 90, sd)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= sd['c'][0] <= x1 and y0 <= sd['c'][1] <= y1, sd)
                if init.get('pts'): self.assertGreaterEqual(len(init['pts']), 2)

    def test_map_references_exist(self):
        # projectionFrom·init.fromMap 이 가리키는 지도는 목록에 있고 자기 자신이 아니며, 목록에서 먼저 맞춰진다(georef-cli 차례)
        ids = [m['id'] for m in self.maps]
        for m in self.maps:
            for ref in (m.get('projectionFrom'), (m.get('shapes') or {}).get('init', {}).get('fromMap')):
                if not ref: continue
                with self.subTest(id=m['id'], ref=ref):
                    self.assertIn(ref, ids)
                    self.assertNotEqual(ref, m['id'])
                    self.assertLess(ids.index(ref), ids.index(m['id']))

    def test_projection_from_has_reason(self):
        # projectionFrom(본 지도 도법·매개변수 고정)은 까닭(_projectionFrom)을 적는다(유럽 U3-4 아이슬란드 결정)
        for m in self.maps:
            if m.get('projectionFrom'):
                with self.subTest(id=m['id']): self.assertTrue(m.get('_projectionFrom'))

    def test_control_sources(self):
        # 일반도(34쪽)만 도시 기호 기준점(src:'city'), shapes 가 있는 지도는 섬·호수·나라 중심·꺾인 점(src:'shape') — 기준점이 있으면
        for m in self.maps:
            cs = m.get('controls', [])
            if not cs: continue
            city = [c for c in cs if c.get('src') == 'city']; sh = [c for c in cs if c.get('src') == 'shape']
            with self.subTest(id=m['id']):
                if m['id'] == 'p34-africa':
                    self.assertGreaterEqual(len(city), 10)
                    for c in city: self.assertTrue(c['ne'] and c['name'])
                else:
                    self.assertEqual(city, [])
                if 'shapes' in m:
                    self.assertGreaterEqual(len(sh), 10)
                    for c in sh: self.assertIn(c['type'], ('centroid', 'tip')); self.assertTrue(c['ne'])
                else:
                    self.assertEqual(sh, [])
                self.assertIn('Natural Earth', m.get('controlsNote', ''))

    def test_controls_shape(self):
        for m in self.maps:
            for c in m.get('controls', []):
                with self.subTest(id=m['id'], c=c['name']):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])
                    if m['kind'] != 'solar':   # 세계 지도 밖은 아프리카 + 둘레(남유럽·서아시아·대서양·인도양 섬)
                        self.assertTrue(-32 <= c['lon'] <= 66 and -40 <= c['lat'] <= 46, (c['lon'], c['lat']))


if __name__ == '__main__': unittest.main()
