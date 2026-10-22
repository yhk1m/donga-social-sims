# © 2026 김용현
# scripts/atlas/tests/test_maps_u6.py — maps_u6.json(Ⅵ 오세아니아와 극지방 지도 목록) 형식 검사 (test_maps_u5.py 꼴)
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring',                      # 1단계
         'urban', 'green-capital', 'ev-chargers', 'eu', 'separatism', 'belgium', 'italy', 'locator',  # 유럽
         'language', 'solar', 'afcfta', 'desertification',                                       # 아프리카
         'general-inset', 'globe-migration', 'canada-language', 'us-ethnic', 'us-inset', 'ethnic',  # 아메리카
         'tnc-hq', 'tnc-hq-inset', 'tnc-agri', 'maquila',
         'polar-general', 'polar-claims', 'polar-bases', 'globe-route', 'globe-araon',            # 오세아니아·극지방에서 새로
         'fta', 'garbage', 'sealevel', 'treaty'}
IDS = ['p48-oceania', 'p48-hawaii', 'p48-tahiti', 'p49-coloring', 'p50-arctic', 'p51-antarctic', 'p52-relief',
       'p53-climate', 'p53-jan', 'p53-jul', 'p54-fta', 'p54-garbage', 'p54-sealevel',
       'p55-route', 'p55-claims', 'p55-treaty', 'p55-bases', 'p55-araon-s', 'p55-araon-n']
BOX_KEYS = ('bbox', 'legendBbox', 'cartoucheBbox', 'insetBbox', 'locatorBbox')
# 1단계 8개(georef.PHASE1_FAMILIES) + 아메리카에서 등록한 평사·정사(U5-3a — fitCore registerFamily) = u5 목록 그대로
FAMILIES = {'azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson',
            'equirectangular', 'mercator', 'stereographic', 'orthographic'}
# 극 지도 4장: 고정 후보 {family: azimuthalEquidistant, params: [0, ±90]} — 북극 둘 +90, 남극 둘 −90 (U6-3a)
POLAR = {'p50-arctic': 90, 'p55-claims': 90, 'p51-antarctic': -90, 'p55-bases': -90}
# 처음 식(shapes.init)을 U6-2 Step 4 로 미룬 지도(섬·해안 씨앗을 지금 정할 수 없음 — 위성 사진 래스터 지구본 셋·북극해 영유권 원판):
# init 대신 까닭 _init(손 기준점 후보 자리)을 적는다. 목록을 늘리지 말 것.
DEFERRED_INIT = {'p55-route', 'p55-claims', 'p55-araon-s', 'p55-araon-n'}


def fam_name(f):
    return f['family'] if isinstance(f, dict) else f


class MapsU6(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u6.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)
        with open(os.path.join(HERE, '..', 'config', 'u6.json'), encoding='utf-8') as f:
            cls.cfg = json.load(f)
        with open(os.path.join(HERE, '..', 'units.json'), encoding='utf-8') as f:
            cls.units = json.load(f)
        cls.by = {m['id']: m for m in cls.maps}

    def test_count_and_ids(self):
        # 계획 쪽 목록 표의 지도 19(계획 「합계 20」은 표 줄 수와 다름 — 실행 중 결정 U6-1), 53쪽 뉴질랜드는 같은 지도라 삽입 없음
        self.assertEqual([m['id'] for m in self.maps], IDS)
        self.assertEqual(len(self.maps), 19)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']}-"), m['id'])
            self.assertTrue(48 <= m['page'] <= 55)

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

    def test_legend_inside_frame(self):
        # 범례 상자는 그 지도 틀 안(파이프라인은 덮개 상자를 넓히지 않으므로 글자 끝까지 직접 여유 — 53쪽 1월·7월 범례 x1 739, 틀 753.3)
        for m in self.maps:
            b = m.get('legendBbox')
            if b is None: continue
            with self.subTest(id=m['id']):
                fx0, fy0, fx1, fy1 = m['bbox']
                self.assertTrue(fx0 <= b[0] and fy0 <= b[1] and b[2] <= fx1 and b[3] <= fy1, (b, m['bbox']))

    def test_insets_inside_main_map(self):
        # 48쪽 삽입 둘은 본 지도 틀 안이고, 본 지도 excludeBoxes(눈금 글자·교차점 버림)가 삽입 틀을 품는다. 하와이 틀은 덮개 둘(모서리 잘린 틀)
        main = self.by['p48-oceania']
        for mid in ('p48-hawaii', 'p48-tahiti'):
            b = self.by[mid]['bbox']
            with self.subTest(id=mid):
                self.assertTrue(any(e[0] <= b[0] and e[1] <= b[1] and e[2] >= b[2] and e[3] >= b[3] for e in main['excludeBoxes']), b)
        hb = self.by['p48-hawaii']['bbox']
        top, low = main['insetBbox'], main['locatorBbox']
        self.assertEqual((top[0], top[1], top[2]), (hb[0], hb[1], hb[2]))
        self.assertEqual((low[2], low[3]), (hb[2], hb[3]))
        self.assertEqual(top[3], low[1])

    def test_georef_source(self):
        # 모든 지도를 맞춘다(모식도 없음): 경위선 눈금, 기준점 원천 shapes / 지도 목록 controls, 또는 다른 지도 식 빌림(fitFrom·projectionFrom)
        for m in self.maps:
            with self.subTest(id=m['id']):
                self.assertNotEqual(m.get('georef', True), False)
                self.assertTrue(m['graticuleLabels'] or m.get('shapes') or len(m.get('controls', [])) >= 4
                                or m.get('fitFrom') or m.get('projectionFrom'))

    def test_shapes_config(self):
        # 눈금 없는 지도는 섬·호수·해안 기준점(land_shapes·shape_controls)의 원천 shapes 와 처음 식 init 을 적는다
        # (DEFERRED_INIT 은 init 대신 까닭 _init — U6-2 에서 손 기준점 또는 {fromMap, pts})
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
                if m['id'] in DEFERRED_INIT:
                    self.assertNotIn('init', s); self.assertTrue(s.get('_init'), '미룬 처음 식의 까닭(_init) 없음')
                elif not m['graticuleLabels']:
                    self.assertTrue(s.get('init'), '처음 식(init) 없음')
                init = s.get('init') or {}
                x0, y0, x1, y1 = m['bbox']
                for sd in init.get('seeds', []) + init.get('pts', []):
                    self.assertTrue(-180 <= sd['at'][0] <= 180 and -90 <= sd['at'][1] <= 90, sd)
                    self.assertTrue(x0 <= sd['c'][0] <= x1 and y0 <= sd['c'][1] <= y1, sd)
                if init.get('pts'): self.assertGreaterEqual(len(init['pts']), 2); self.assertTrue(init.get('fromMap'))
                if init.get('seeds'): self.assertGreaterEqual(len(init['seeds']), 3)
                if init.get('land'): self.assertTrue(-180 <= init['land'][0] <= 180 and -90 <= init['land'][1] <= 90)

    def test_deferred_init_list(self):
        # 미룬 지도는 정한 넷뿐이고 모두 눈금 없는 지도
        for mid in DEFERRED_INIT:
            self.assertFalse(self.by[mid]['graticuleLabels'], mid)
        later = {m['id'] for m in self.maps if 'shapes' in m and 'init' not in m['shapes'] and not m['graticuleLabels']}
        self.assertEqual(later, DEFERRED_INIT)

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
        # projectionFrom·fitFrom(다른 지도 식 빌림)은 까닭을 적는다(유럽 U3-4 아이슬란드 결정), 고정 후보도 까닭(_families)
        for m in self.maps:
            with self.subTest(id=m['id']):
                if m.get('projectionFrom'): self.assertTrue(m.get('_projectionFrom'))
                if m.get('fitFrom'): self.assertTrue(m.get('_fitFrom'))
                if any(isinstance(f, dict) for f in m.get('families', [])): self.assertTrue(m.get('_families'))

    def test_families_known(self):
        # 도법 후보 이름 = u5 목록(1단계 8개 + 평사·정사). 고정 후보 객체 {family, params} 의 family 도 같은 집합 안
        self.assertEqual(set(self.cfg['georef']['families']), FAMILIES)
        for m in self.maps:
            fams = m.get('families')
            if fams is None: continue
            with self.subTest(id=m['id']):
                self.assertTrue(fams and {fam_name(f) for f in fams} <= FAMILIES, fams)
                for f in fams:
                    if isinstance(f, dict):
                        self.assertEqual(set(f), {'family', 'params'})
                        self.assertEqual(len(f['params']), 2)
        for mid in ('p48-oceania', 'p49-coloring'): self.assertEqual(self.by[mid]['families'], ['azimuthalEqualArea'])
        for mid in ('p55-route', 'p55-araon-s', 'p55-araon-n'): self.assertEqual(self.by[mid]['families'], ['orthographic'])
        for mid in ('p54-fta', 'p55-treaty'):
            self.assertEqual(self.by[mid]['families'], ['miller', 'equirectangular', 'mercator', 'robinson'])

    def test_polar_fixed_candidates(self):
        # 극 지도 4장: 후보는 고정 정거 방위 하나, 중심 위도 = ±90(북극 둘 +, 남극 둘 −), 중심 경도 0(회전은 닮음 변환이 흡수)
        for mid, lat in POLAR.items():
            with self.subTest(id=mid):
                fams = self.by[mid]['families']
                self.assertEqual(fams, [{'family': 'azimuthalEquidistant', 'params': [0, lat]}])
        self.assertEqual({m['id'] for m in self.maps if m['kind'].startswith('polar-')}, set(POLAR))

    def test_controls_shape(self):
        # 기준점(U6-2 에서 씀)이 있으면 틀 안 지면 자리 · 경위도 범위 안(48쪽은 날짜변경선 양쪽 ±180)
        for m in self.maps:
            for c in m.get('controls', []):
                with self.subTest(id=m['id'], c=c.get('name')):
                    self.assertEqual(len(c['xy']), 2)
                    self.assertTrue(-180 <= c['lon'] <= 180 and -90 <= c['lat'] <= 90)
                    x0, y0, x1, y1 = m['bbox']
                    self.assertTrue(x0 <= c['xy'][0] <= x1 and y0 <= c['xy'][1] <= y1, c['xy'])

    def test_unit_entry(self):
        # units.json u6 줄(thumbBounds 는 U6-10)
        u = self.units['u6']
        self.assertEqual(u['sim'], 'atlas-u6-oceania-polar')
        self.assertEqual(u['title'], 'Ⅵ. 오세아니아와 극지방')
        self.assertEqual(u['pages'], [48, 55])
        self.assertEqual(u['config'], 'config/u6.json')
        self.assertNotIn('thumbBounds', u)

    def test_unit_config_paths(self):
        # 단원 설정 뼈대: 지도 목록·출력·사진·작업 파일 자리가 u6 것(앞 단원 산출물을 덮어쓰지 않음), 아메리카 전용 값은 지움
        c = self.cfg
        self.assertEqual(c['maps'], '../maps_u6.json')
        self.assertEqual(c['out'], 'sims/atlas-u6-oceania-polar/data')
        self.assertEqual(c['photos']['outJson'], 'content/atlas/u6/photos.json')
        self.assertEqual(c['photos']['assetDir'], 'docs/assets/atlas/u6')
        self.assertEqual(c['photos']['assetPrefix'], 'u6/')
        self.assertEqual(c['photos']['pages'], [48, 55])
        self.assertEqual(c['content']['labels'], 'units/u6/text/p49-labels.json')
        self.assertEqual(c['content']['pages'], [48, 55])
        self.assertEqual(c['content']['expect']['topics'],
                         ['general', 'coloring', 'arctic', 'antarctic', 'relief', 'climate', 'exchange', 'environment', 'arcticRoute', 'antarcticResearch'])
        self.assertEqual(c['photos']['topics'], c['content']['expect']['topics'])
        self.assertNotIn('tint', c); self.assertNotIn('natural', c)
        self.assertEqual(c['layers'], {})
        text = json.dumps({k: v for k, v in c.items() if not k.startswith('_')}, ensure_ascii=False)
        for bad in ('units/u5/', 'content/atlas/u5', 'atlas-u5-americas', 'docs/assets/atlas/u5', 'charts-u5', 'p41-',
                    'units/u4/', 'atlas-u4-africa', '"u5/"'):
            self.assertNotIn(bad, text)
        # 도장(@unit/…) 자리와 출력
        st = c['content']['stamps']
        self.assertIn('@unit/text/p49-labels.json', st['coloring']['files'])
        self.assertIn('@work/geo/p49-coloring.fit.json', st['coloring']['files'])
        self.assertNotIn('src/atlas/americasExtra.js', st['coloring']['files'])
        self.assertEqual(st['charts']['stamp'], '@unit/tables/charts-u6.stamp.json')
        # 바탕 지도: 태평양 섬 상자 둘(날짜변경선 건넘), 아메리카 기아나 자르기 없음
        bm = c['basemap']
        self.assertEqual(bm['out'], 'sims/atlas-u6-oceania-polar/data/basemap.json')
        self.assertEqual(bm['unitBoxes'], [[140, -25, 180, 15], [-180, -25, -150, 15]])
        for k in ('cutIsos', 'names', 'mergeIsos'): self.assertNotIn(k, bm)
        lv10a = [lv for lv in bm['levels'] if lv['id'] == '10a'][0]
        self.assertNotIn('simplifyByIso', lv10a)
        # 지명: 일반도 다섯(48 본 지도·삽입 둘·50·51), 도시 기준점은 타히티 뺀 넷, 인구 지점 상자 넷(48쪽 날짜변경선 둘 + 극 둘레 둘)
        p = c['places']
        self.assertEqual(p['maps'], ['p48-oceania', 'p48-hawaii', 'p48-tahiti', 'p50-arctic', 'p51-antarctic'])
        self.assertEqual(c['cityControls']['maps'], ['p48-oceania', 'p48-hawaii', 'p50-arctic', 'p51-antarctic'])
        self.assertEqual(p['overview'], 'p48-oceania')
        self.assertEqual(p['index']['checkPages'], [48, 51])
        self.assertEqual(p['neBox'], [[95, -55, 180, 15], [-180, -55, -150, 25], [-180, 35, 180, 90], [-180, -90, 180, -50]])
        for k in ('mergePriority', 'mergeKmMaps', 'rankBySizeMaps', 'areaKmByName', 'symbolFix', 'spellAs', 'hidden'):
            self.assertNotIn(k, p)
        for k in ('neAlias', 'snapAlways', 'keepTextbookPosition', 'relocate', 'indexExclude', 'extraNames'):
            self.assertEqual(p[k], {})
        self.assertFalse([s for s in p['styles'] if s.get('maps')])
        for k in ('places', 'cityControls'):
            for mid in c[k]['maps']: self.assertIn(mid, self.by)
        # 색칠하기: 49쪽, 아메리카 지역·자르기 키 없음
        col = c['content']['coloring']
        self.assertEqual((col['page'], col['map']), (49, 'p49-coloring'))
        self.assertIn(col['map'], self.by)
        for k in ('regions', 'noCapital', 'joinLabels', 'cutIsos', 'extraCountries', 'isoByLabel', 'capitalAlias', 'splitLabels'):
            self.assertNotIn(k, col)
        self.assertEqual(c['photos']['items'], []); self.assertEqual(c['charts']['items'], {})
        self.assertEqual(c['insets'], [])


if __name__ == '__main__': unittest.main()
