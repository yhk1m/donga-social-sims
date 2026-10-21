# © 2026 김용현
# scripts/atlas/tests/test_maps_u5.py — maps_u5.json(Ⅴ 아메리카 지도 목록) 형식 검사 (test_maps_u4.py 꼴)
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring',                      # 1단계
         'urban', 'green-capital', 'ev-chargers', 'eu', 'separatism', 'belgium', 'italy', 'locator',  # 유럽
         'language', 'solar', 'afcfta', 'desertification',                                       # 아프리카
         'general-inset', 'globe-migration', 'canada-language', 'us-ethnic', 'us-inset', 'ethnic',  # 아메리카에서 새로
         'tnc-hq', 'tnc-hq-inset', 'tnc-agri', 'maquila'}
US = ['european', 'african', 'hispanic', 'asian']
IDS = (['p40-americas', 'p40-central', 'p41-coloring', 'p42-north', 'p43-south', 'p44-relief', 'p45-climate', 'p45-jan', 'p45-jul',
        'p46-migration', 'p46-canada']
       + [f'p46-us-{g}{s}' for g in US for s in ('', '-ak', '-hi')]
       + ['p46-ethnic', 'p47-hq', 'p47-hq-sv', 'p47-agri', 'p47-maquila'])
BOX_KEYS = ('bbox', 'legendBbox', 'cartoucheBbox', 'insetBbox', 'locatorBbox')
# 1단계 8개(georef.PHASE1_FAMILIES) + 아메리카에서 등록하는 평사·정사(U5-3a — fitCore registerFamily)
FAMILIES = {'azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson',
            'equirectangular', 'mercator', 'stereographic', 'orthographic'}


class MapsU5(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u5.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)
        with open(os.path.join(HERE, '..', 'config', 'u5.json'), encoding='utf-8') as f:
            cls.cfg = json.load(f)
        cls.by = {m['id']: m for m in cls.maps}

    def test_count_and_ids(self):
        # 계획 쪽 목록: 지도 20 + 미국 알래스카·하와이 삽입 틀 8 = 28(설계 §5.3 어림 22 는 삽입 틀을 반쯤 섞어 셈)
        self.assertEqual([m['id'] for m in self.maps], IDS)
        self.assertEqual(len([m for m in self.maps if m['kind'] != 'us-inset']), 20)
        self.assertEqual(len([m for m in self.maps if m['kind'] == 'us-inset']), 8)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']}-"), m['id'])
            self.assertTrue(40 <= m['page'] <= 47)

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
        # 덮개 상자(범례·제목·활동 상자·삽입)는 그 지도 틀과 겹쳐야 뜻이 있다
        for m in self.maps:
            fx0, fy0, fx1, fy1 = m['bbox']
            for key in BOX_KEYS[1:]:
                b = m.get(key)
                if b is None: continue
                with self.subTest(id=m['id'], key=key):
                    self.assertTrue(b[0] < fx1 and b[2] > fx0 and b[1] < fy1 and b[3] > fy0, b)

    def test_georef_source(self):
        # 모든 지도를 맞춘다(모식도 없음): 경위선 눈금, 기준점 원천 shapes / 지도 목록 controls, 또는 다른 지도 식 빌림(fitFrom·projectionFrom)
        for m in self.maps:
            with self.subTest(id=m['id']):
                self.assertNotEqual(m.get('georef', True), False)
                self.assertTrue(m['graticuleLabels'] or m.get('shapes') or len(m.get('controls', [])) >= 4
                                or m.get('fitFrom') or m.get('projectionFrom'))

    def test_shapes_config(self):
        # 눈금 없는 지도는 섬·호수 기준점(land_shapes·shape_controls)의 원천 shapes 와 처음 식 init 을 적는다(fitFrom 지도는 빌린 식이라 없음)
        for m in self.maps:
            if m['graticuleLabels'] and 'shapes' not in m: continue
            if m.get('fitFrom'):
                self.assertNotIn('shapes', m, m['id']); continue
            with self.subTest(id=m['id']):
                s = m['shapes']
                mode = s.get('mode', 'vector')
                self.assertIn(mode, ('vector', 'raster'))
                if mode == 'vector': self.assertTrue(s.get('land') or s.get('sea'))
                self.assertIn(s.get('target', 'land'), ('land', 'countries'))
                if not m['graticuleLabels']: self.assertTrue(s.get('init'), '처음 식(init) 없음')
                init = s.get('init') or {}
                x0, y0, x1, y1 = m['bbox']
                for sd in init.get('seeds', []) + init.get('pts', []):
                    self.assertTrue(-180 <= sd['at'][0] <= 180 and -90 <= sd['at'][1] <= 90, sd)
                    self.assertTrue(x0 <= sd['c'][0] <= x1 and y0 <= sd['c'][1] <= y1, sd)
                if init.get('pts'): self.assertGreaterEqual(len(init['pts']), 2)
                if init.get('seeds'): self.assertGreaterEqual(len(init['seeds']), 3)
                if init.get('land'): self.assertTrue(-180 <= init['land'][0] <= 180 and -90 <= init['land'][1] <= 90)

    def test_map_references_exist(self):
        # projectionFrom·fitFrom.map·init.fromMap 이 가리키는 지도는 목록에 있고 자기 자신이 아니며, 목록에서 먼저 맞춰진다(georef-cli 차례)
        ids = [m['id'] for m in self.maps]
        for m in self.maps:
            refs = (m.get('projectionFrom'), (m.get('fitFrom') or {}).get('map'), (m.get('shapes') or {}).get('init', {}).get('fromMap'))
            for ref in refs:
                if not ref: continue
                with self.subTest(id=m['id'], ref=ref):
                    self.assertIn(ref, ids)
                    self.assertNotEqual(ref, m['id'])
                    self.assertLess(ids.index(ref), ids.index(m['id']))
                    self.assertNotIn('fitFrom', self.by[ref], '빌린 지도가 또 빌림')

    def test_reasons(self):
        # projectionFrom·fitFrom(다른 지도 식 빌림)은 까닭을 적는다(유럽 U3-4 아이슬란드 결정)
        for m in self.maps:
            with self.subTest(id=m['id']):
                if m.get('projectionFrom'): self.assertTrue(m.get('_projectionFrom'))
                if m.get('fitFrom'): self.assertTrue(m.get('_fitFrom'))

    def test_fit_from_shift(self):
        # fitFrom 이동량(쪽 pt): 같은 쪽, 빌린 지도 틀을 dx·dy 만큼 옮기면 이 지도 틀(±1pt), 옮긴 틀이 쪽 안
        for m in self.maps:
            ff = m.get('fitFrom')
            if not ff: continue
            with self.subTest(id=m['id']):
                ref = self.by[ff['map']]
                self.assertEqual(ref['page'], m['page'])
                self.assertEqual(set(ff), {'map', 'dx', 'dy'})
                dx, dy = ff['dx'], ff['dy']
                self.assertTrue(abs(dx) < PAGE_W and abs(dy) < PAGE_H and (abs(dx) > 1 or abs(dy) > 1))
                rx0, ry0, rx1, ry1 = ref['bbox']
                moved = [rx0 + dx, ry0 + dy, rx1 + dx, ry1 + dy]
                self.assertTrue(0 <= moved[0] and moved[2] <= PAGE_W and 0 <= moved[1] and moved[3] <= PAGE_H, moved)
                for a, b in zip(moved, m['bbox']): self.assertAlmostEqual(a, b, delta=1.0)
                self.assertEqual(m['kind'], ref['kind'])

    def test_us_maps_share_base(self):
        # 46쪽 미국 4장 × 본토·알래스카·하와이: 유럽계 셋만 shapes, 나머지 9 장은 그 틀을 옮긴 fitFrom
        for g in US:
            for s in ('', '-ak', '-hi'):
                m = self.by[f'p46-us-{g}{s}']
                with self.subTest(id=m['id']):
                    if g == 'european': self.assertIn('shapes', m); self.assertNotIn('fitFrom', m)
                    else: self.assertEqual(m['fitFrom']['map'], f'p46-us-european{s}')

    def test_families_known(self):
        # 도법 후보 이름 = 1단계 8개 + 평사·정사(U5-3a 등록 뒤 풀림). 단원 설정 georef.families 도 같은 집합 안
        self.assertEqual(set(self.cfg['georef']['families']), FAMILIES)
        for m in self.maps:
            fams = m.get('families')
            if fams is None: continue
            with self.subTest(id=m['id']):
                self.assertTrue(fams and set(fams) <= FAMILIES, fams)
        self.assertEqual(self.by['p40-americas']['families'], ['stereographic'])
        self.assertEqual(self.by['p41-coloring']['families'], ['stereographic'])
        self.assertEqual(self.by['p46-migration']['families'], ['orthographic'])
        for mid in ('p47-hq', 'p47-agri'): self.assertNotIn('stereographic', self.by[mid]['families'])

    def test_controls_shape(self):
        # 기준점(U5-2 에서 씀)이 있으면 틀 안 지면 자리 · 아메리카 + 둘레(그린란드·서유럽·서아프리카 끝) 경위도, 세계 지도(47쪽)는 전 지구
        for m in self.maps:
            for c in m.get('controls', []):
                with self.subTest(id=m['id'], c=c['name']):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])
                    if not m['kind'].startswith('tnc-') and m['kind'] != 'globe-migration':
                        self.assertTrue(-180 <= c['lon'] <= 20 and -60 <= c['lat'] <= 85, (c['lon'], c['lat']))

    def test_unit_config_paths(self):
        # 단원 설정 뼈대: 지도 목록·출력·사진·작업 파일 자리가 u5 것(앞 단원 산출물을 덮어쓰지 않음)
        c = self.cfg
        self.assertEqual(c['maps'], '../maps_u5.json')
        self.assertEqual(c['out'], 'sims/atlas-u5-americas/data')
        self.assertEqual(c['photos']['outJson'], 'content/atlas/u5/photos.json')
        self.assertEqual(c['photos']['assetDir'], 'docs/assets/atlas/u5')
        self.assertEqual(c['photos']['assetPrefix'], 'u5/')
        self.assertEqual(c['content']['labels'], 'units/u5/text/p41-labels.json')
        self.assertNotIn('tint', c); self.assertNotIn('natural', c)
        text = json.dumps({k: v for k, v in c.items() if not k.startswith('_')}, ensure_ascii=False)
        for bad in ('units/u4/', 'content/atlas/u4', 'atlas-u4-africa', 'docs/assets/atlas/u4', 'charts-u4', 'p35-'):
            self.assertNotIn(bad, text)
        self.assertEqual(c['basemap']['unitBoxes'], [[-93, 7, -59, 28]])
        lv10a = [lv for lv in c['basemap']['levels'] if lv['id'] == '10a'][0]
        self.assertNotIn('simplifyByIso', lv10a)
        self.assertEqual(c['content']['coloring']['map'], 'p41-coloring')
        for k in ('places', 'cityControls'):
            for mid in c[k]['maps']: self.assertIn(mid, self.by)


if __name__ == '__main__': unittest.main()
