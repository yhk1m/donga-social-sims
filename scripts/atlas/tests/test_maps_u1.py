# © 2026 김용현
# scripts/atlas/tests/test_maps_u1.py — maps_u1.json(Ⅰ 세계화 시대, 지리의 힘 지도 목록)·단원 설정 뼈대 형식 검사 (test_maps_u6.py 꼴)
import json, os, unittest

HERE = os.path.dirname(__file__)
PAGE_W, PAGE_H = 779.53, 722.84  # 모든 쪽 page.rect (pt)
KINDS = {'general', 'relief', 'climate', 'temp-precip', 'religion', 'density', 'growth', 'resources',
         'exports', 'trade', 'heritage', 'singapore', 'kashmir', 'coloring',                      # 1단계
         'urban', 'green-capital', 'ev-chargers', 'eu', 'separatism', 'belgium', 'italy', 'locator',  # 유럽
         'language', 'solar', 'afcfta', 'desertification',                                       # 아프리카
         'general-inset', 'globe-migration', 'canada-language', 'us-ethnic', 'us-inset', 'ethnic',  # 아메리카
         'tnc-hq', 'tnc-hq-inset', 'tnc-agri', 'maquila',
         'polar-general', 'polar-claims', 'polar-bases', 'globe-route', 'globe-araon',            # 오세아니아·극지방
         'fta', 'garbage', 'sealevel', 'treaty',
         'general-spread', 'continents', 'routes', 'internet', 'mobile', 'covid', 'burger', 'korean', 'blank'}  # 세계화에서 새로
IDS = ['p08-world', 'p09-world', 'p08-europe', 'p10-continents', 'p11-continents', 'p12-relief', 'p13-climate',
       'p14-routes', 'p14-internet', 'p14-mobile', 'p14-covid', 'p15-burger', 'p15-korean', 'p15-blank']
BOX_KEYS = ('bbox', 'legendBbox', 'cartoucheBbox', 'insetBbox', 'locatorBbox')
# u6 목록 그대로(1단계 8개 + 아메리카에서 등록한 평사·정사 — fitCore registerFamily)
FAMILIES = {'azimuthalEqualArea', 'azimuthalEquidistant', 'conicEqualArea', 'conicConformal', 'miller', 'robinson',
            'equirectangular', 'mercator', 'stereographic', 'orthographic'}
CYL = ['miller', 'equirectangular', 'mercator', 'robinson']
# 두 쪽에 걸친 한 지도(설계 §6.1-5): 오른쪽 반 → 왼쪽 반
SPREADS = {'p09-world': 'p08-world', 'p11-continents': 'p10-continents'}
# U1-3a Step 1 실측(가름선 띠에서 꼭짓점이 모두 같은 도형 — 오른쪽 쪽 점의 왼쪽 쪽 좌표 = (x + dx, y + dy))
OFFSETS = {'p09-world': [767.055, 0], 'p11-continents': [765.354, -0.001]}
PAGE_W = 779.528
TOPICS = ['general', 'continents', 'relief', 'climate', 'connection', 'interaction', 'glocal', 'themeActivity']


def fam_name(f):
    return f['family'] if isinstance(f, dict) else f


class MapsU1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(HERE, '..', 'maps_u1.json'), encoding='utf-8') as f:
            cls.maps = json.load(f)
        with open(os.path.join(HERE, '..', 'config', 'u1.json'), encoding='utf-8') as f:
            cls.cfg = json.load(f)
        with open(os.path.join(HERE, '..', 'units.json'), encoding='utf-8') as f:
            cls.units = json.load(f)
        cls.by = {m['id']: m for m in cls.maps}

    def test_count_and_ids(self):
        # 계획 쪽 목록 「합계 지도 14」 = 설계 §5.5 어림 14. 9·11쪽 지구본 그림 10·14쪽 작아지는 지구 지구본은 지도가 아님(U1-6)
        self.assertEqual([m['id'] for m in self.maps], IDS)
        self.assertEqual(len(self.maps), 14)

    def test_ids_unique_and_named(self):
        ids = [m['id'] for m in self.maps]
        self.assertEqual(len(ids), len(set(ids)))
        for m in self.maps:
            self.assertTrue(m['id'].startswith(f"p{m['page']:02d}-"), m['id'])
            self.assertTrue(8 <= m['page'] <= 15)

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
            for b in m.get('excludeBoxes', []):
                self.assertTrue(0 <= b[0] < b[2] <= PAGE_W and 0 <= b[1] < b[3] <= PAGE_H, (m['id'], b))

    def test_cover_boxes_overlap_frame(self):
        # 덮개 상자(범례·제목·활동 상자·사진)는 그 지도 틀과 겹쳐야 뜻이 있다
        for m in self.maps:
            fx0, fy0, fx1, fy1 = m['bbox']
            for key in BOX_KEYS[1:]:
                b = m.get(key)
                if b is None: continue
                with self.subTest(id=m['id'], key=key):
                    self.assertTrue(b[0] < fx1 and b[2] > fx0 and b[1] < fy1 and b[3] > fy0, b)
                    self.assertTrue(m.get('_covers'), '덮개 까닭(_covers)')

    def test_legend_inside_frame(self):
        for m in self.maps:
            b = m.get('legendBbox')
            if b is None: continue
            with self.subTest(id=m['id']):
                fx0, fy0, fx1, fy1 = m['bbox']
                self.assertTrue(fx0 <= b[0] and fy0 <= b[1] and b[2] <= fx1 and b[3] <= fy1, (b, m['bbox']))

    def test_inset_inside_main_map(self):
        # 8쪽 유럽 원형 삽입은 본 지도 틀 안이고, 본 지도 excludeBoxes(눈금 글자·교차점 버림)가 삽입 틀을 품으며 insetBbox 와 같은 틀
        main, eu = self.by['p08-world'], self.by['p08-europe']
        b = eu['bbox']
        self.assertTrue(any(e[0] <= b[0] and e[1] <= b[1] and e[2] >= b[2] and e[3] >= b[3] for e in main['excludeBoxes']), b)
        self.assertEqual(main['insetBbox'], b)
        self.assertTrue(main.get('_excludeBoxes'))
        mx0, my0, mx1, my1 = main['bbox']
        self.assertTrue(mx0 <= b[0] and my0 <= b[1] and b[2] <= mx1 and b[3] <= my1)

    def test_georef_source(self):
        # 모든 지도를 맞춘다(georef:false 없음): 경위선 눈금, 기준점 원천 shapes / controls, 또는 다른 지도 식 빌림(fitFrom·projectionFrom·spreadOf)
        for m in self.maps:
            with self.subTest(id=m['id']):
                self.assertNotEqual(m.get('georef', True), False)
                self.assertTrue(m['graticuleLabels'] or m.get('shapes') or len(m.get('controls', [])) >= 4
                                or m.get('fitFrom') or m.get('projectionFrom') or m.get('spreadOf'))
                self.assertIsInstance(m.get('controls'), list)

    def test_graticule_maps(self):
        # 경위도 눈금 글자가 있는 지도(find_maps: 8쪽 32 · 9쪽 25 · 13쪽 23) — 나머지는 적도 「0°」 하나뿐이라 false + 까닭(빌린 지도 제외)
        self.assertEqual({m['id'] for m in self.maps if m['graticuleLabels']}, {'p08-world', 'p09-world', 'p08-europe', 'p13-climate'})
        for mid in ('p10-continents', 'p11-continents', 'p12-relief', 'p14-routes'):
            self.assertTrue(self.by[mid].get('_graticuleLabels'), mid)

    def test_shapes_config(self):
        # 눈금 없고 빌리지 않는 지도는 섬·해안 기준점(land_shapes·shape_controls)의 원천 shapes, 처음 식은 init(씨앗) 또는 U1-2 로 미룬 까닭(_init)
        for m in self.maps:
            if m['graticuleLabels'] or m.get('fitFrom') or m.get('spreadOf'):
                self.assertNotIn('shapes', m, m['id']); continue
            with self.subTest(id=m['id']):
                s = m['shapes']
                mode = s.get('mode', 'vector')
                self.assertIn(mode, ('vector', 'raster'))
                if mode == 'vector': self.assertTrue(s.get('land') or s.get('sea'))
                self.assertIn(s.get('target', 'land'), ('land', 'countries'))
                self.assertTrue(s.get('_why'))
                init = s.get('init')
                self.assertTrue(init or m.get('_init'), '처음 식(init) 또는 미룬 까닭(_init)')
                x0, y0, x1, y1 = m['bbox']
                covers = [m[k] for k in BOX_KEYS[1:] if m.get(k)]
                for sd in (init or {}).get('seeds', []):
                    self.assertTrue(-180 <= sd['at'][0] <= 180 and -90 <= sd['at'][1] <= 90, sd)
                    self.assertTrue(x0 <= sd['c'][0] <= x1 and y0 <= sd['c'][1] <= y1, sd)
                    for b in covers: self.assertFalse(b[0] <= sd['c'][0] <= b[2] and b[1] <= sd['c'][1] <= b[3], (sd, b))
                if init and init.get('seeds'): self.assertGreaterEqual(len(init['seeds']), 3)
        # 처음 식을 U1-2 로 미룬 지도는 12쪽 자연색 래스터 하나(계획 — {fromMap: p08-world, pts: 곶})
        self.assertEqual({m['id'] for m in self.maps if m.get('_init')}, {'p12-relief'})

    def test_spread_pairs(self):
        # 두 쪽 지도 짝(U1-3a): 오른쪽 반 spreadOf = 왼쪽 반, 같은 kind·도법 후보, 오른쪽 쪽 = 왼쪽 쪽 + 1, 까닭 필수
        self.assertEqual({m['id']: m['spreadOf'] for m in self.maps if m.get('spreadOf')}, SPREADS)
        for right, left in SPREADS.items():
            r, l = self.by[right], self.by[left]
            with self.subTest(right=right):
                self.assertEqual(r['page'], l['page'] + 1)
                self.assertEqual(r['kind'], l['kind'])
                self.assertEqual(r['families'], l['families'])
                self.assertTrue(r.get('_spreadOf'))
                self.assertLess(IDS.index(left), IDS.index(right))
                # offsetPt: 실측값, 쪽 너비보다 조금 작음(가름선 겹침 5~20pt), 세로는 거의 0 — georef-cli 가 두 쪽을 묶어 맞추는 키
                self.assertEqual(r['offsetPt'], OFFSETS[right])
                self.assertTrue(PAGE_W - 20 <= r['offsetPt'][0] <= PAGE_W - 5 and abs(r['offsetPt'][1]) < 0.05, r['offsetPt'])
                self.assertNotIn('fitFrom', r); self.assertNotIn('projectionFrom', r)
        # 오른쪽 지도 offsetPt 없는 spreadOf·spreadOf 없는 offsetPt 없음
        for m in self.maps:
            self.assertEqual('spreadOf' in m, 'offsetPt' in m, m['id'])
        # 11쪽은 기준점 없이 10쪽(fitFrom 8쪽)의 풀린 fit − offsetPt(빌림의 빌림은 spreadOf 만 — projection_from.planSpread)
        self.assertEqual(self.by['p11-continents']['controls'], [])
        self.assertIn('fitFrom', self.by['p10-continents'])

    def test_map_references_exist(self):
        # projectionFrom·fitFrom.map·spreadOf·init.fromMap 이 가리키는 지도는 목록에 있고 자기 자신이 아니며 먼저 맞춰진다(georef-cli 차례),
        # 빌린 지도(fitFrom·projectionFrom 대상)는 또 빌리지 않는다
        ids = [m['id'] for m in self.maps]
        for m in self.maps:
            refs = (m.get('projectionFrom'), (m.get('fitFrom') or {}).get('map'), m.get('spreadOf'),
                    ((m.get('shapes') or {}).get('init') or {}).get('fromMap'))
            for ref in refs:
                if not ref: continue
                with self.subTest(id=m['id'], ref=ref):
                    self.assertIn(ref, ids)
                    self.assertNotEqual(ref, m['id'])
                    self.assertLess(ids.index(ref), ids.index(m['id']))
            for ref in (m.get('projectionFrom'), (m.get('fitFrom') or {}).get('map')):
                if ref:
                    self.assertNotIn('fitFrom', self.by[ref], (m['id'], ref))
                    self.assertNotIn('spreadOf', self.by[ref], (m['id'], ref))

    def test_borrowed_fits(self):
        # 같은 바탕 그림을 되풀이한 지도(U1-1 조사): 10쪽 = 8쪽 + (0.90, 1.28) · 14쪽 인터넷·이동 전화 = 항공망 + (0, 200.24)·(0, 405.94) ·
        # 15쪽 한국어 = 햄버거 + (−0.02, 226.49), 15쪽 백지도 = 햄버거 축소본(projectionFrom)
        want = {'p10-continents': ('p08-world', 0.9, 1.28), 'p14-internet': ('p14-routes', 0, 200.24),
                'p14-mobile': ('p14-routes', 0, 405.94), 'p15-korean': ('p15-burger', -0.02, 226.49)}
        got = {m['id']: (m['fitFrom']['map'], m['fitFrom']['dx'], m['fitFrom']['dy']) for m in self.maps if m.get('fitFrom')}
        self.assertEqual(got, want)
        self.assertEqual({m['id']: m['projectionFrom'] for m in self.maps if m.get('projectionFrom')}, {'p15-blank': 'p15-burger'})
        for m in self.maps:
            if m.get('fitFrom'): self.assertEqual(set(m['fitFrom']), {'map', 'dx', 'dy'})

    def test_reasons(self):
        # 빌림(fitFrom·projectionFrom·spreadOf)과 고정 후보는 까닭을 적는다
        for m in self.maps:
            with self.subTest(id=m['id']):
                if m.get('projectionFrom'): self.assertTrue(m.get('_projectionFrom'))
                if m.get('fitFrom'): self.assertTrue(m.get('_fitFrom'))
                if m.get('spreadOf'): self.assertTrue(m.get('_spreadOf'))
                if any(isinstance(f, dict) for f in m.get('families', [])): self.assertTrue(m.get('_families'))
                self.assertTrue(m.get('notes'))

    def test_families_known(self):
        # 도법 후보 이름 = u6 목록. 8~11·13쪽 로빈슨, 유럽 삽입 람베르트 정각 원뿔, 12·14·15쪽 원통·의원통(U1-2 판정)
        self.assertEqual(set(self.cfg['georef']['families']), FAMILIES)
        for m in self.maps:
            fams = m.get('families')
            with self.subTest(id=m['id']):
                self.assertTrue(fams and {fam_name(f) for f in fams} <= FAMILIES, fams)
        for mid in ('p08-world', 'p09-world', 'p10-continents', 'p11-continents', 'p13-climate'):
            self.assertEqual(self.by[mid]['families'], ['robinson'], mid)
        self.assertEqual(self.by['p08-europe']['families'], ['conicConformal'])
        for mid in ('p12-relief', 'p14-routes', 'p14-internet', 'p14-mobile', 'p14-covid', 'p15-burger', 'p15-korean', 'p15-blank'):
            self.assertEqual(self.by[mid]['families'], CYL, mid)

    def test_unit_entry(self):
        # units.json u1 줄(thumbBounds 는 U1-10), 단원 표 차례는 u1 이 맨 앞(파이프라인은 열쇠로 찾으므로 차례 무관 — 아래 resolve 시험)
        u = self.units['u1']
        self.assertEqual(u['sim'], 'atlas-u1-world')
        self.assertEqual(u['title'], 'Ⅰ. 세계화 시대, 지리의 힘')
        self.assertEqual(u['pages'], [8, 15])
        self.assertEqual(u['config'], 'config/u1.json')
        self.assertNotIn('thumbBounds', u)
        self.assertEqual([k for k in self.units if not k.startswith('_')], ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'])

    def test_unit_resolves_by_key(self):
        # 파이프라인 단원 고르기(atlas_common.unit)는 열쇠로 찾는다 — u1 을 맨 앞에 더해도 기본 단원은 u2, --unit u1 은 u1 설정·작업 폴더
        import subprocess, sys
        code = ("import sys, json; sys.path.insert(0, %r); import atlas_common as a; u = a.unit(); "
                "print(json.dumps({'id': u['id'], 'config': a.UNIT_CONFIG.replace(chr(92), '/').split('/scripts/atlas/')[-1], 'work': u['work_dir'].replace(chr(92), '/').rsplit('/', 2)[-2:]}))")
        here = os.path.abspath(os.path.join(HERE, '..'))
        env = {**os.environ, 'ATLAS_WORK': 'C:/Users/Public/atlas-work'}
        env.pop('ATLAS_UNIT', None)
        def run(args):
            r = subprocess.run([sys.executable, '-I', '-c', code % here, *args], capture_output=True, text=True, encoding='utf-8', env=env)
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads(r.stdout.strip().splitlines()[-1])
        d = run([])
        self.assertEqual((d['id'], d['config']), ('u2', 'config/u2.json'))
        d = run(['--unit', 'u1'])
        self.assertEqual((d['id'], d['config']), ('u1', 'config/u1.json'))
        self.assertEqual(d['work'], ['units', 'u1'])

    def test_unit_config_paths(self):
        # 단원 설정 뼈대: 지도 목록·출력·사진·작업 파일 자리가 u1 것(앞 단원 산출물을 덮어쓰지 않음), 오세아니아 전용 값은 지움
        c = self.cfg
        self.assertEqual(c['maps'], '../maps_u1.json')
        self.assertEqual(c['out'], 'sims/atlas-u1-world/data')
        self.assertEqual(c['photos']['outJson'], 'content/atlas/u1/photos.json')
        self.assertEqual(c['photos']['assetDir'], 'docs/assets/atlas/u1')
        self.assertEqual(c['photos']['assetPrefix'], 'u1/')
        self.assertEqual(c['photos']['pages'], [8, 15])
        self.assertEqual(c['photos']['sheetDir'], 'units/u1/shots/c3')
        self.assertEqual(c['photos']['placesFile'], 'sims/atlas-u1-world/data/places.json')
        # U1-6 에서 채움(사진 29 · 제외 12 · 핀 지도 3 · 지구본 10 — 자세한 검사는 tests/atlas/units/u1.photos.test.mjs)
        self.assertEqual((len(c['photos']['items']), len(c['photos']['exclude']), sorted(c['photos']['pins']), len(c['photos']['globes'])),
                         (29, 12, ['p12-relief', 'p13-climate', 'p15-burger'], 10))
        self.assertEqual(c['photos']['expect'], {'relief': 8, 'climate': 8, 'connection': 3, 'glocal': 10})
        self.assertEqual(c['content']['labels'], 'units/u1/text/p10-labels.json')
        self.assertEqual(c['content']['charts'], 'units/u1/tables/charts-u1.json')
        self.assertEqual(c['content']['pages'], [8, 15])
        self.assertEqual(c['content']['expect'], {'topics': TOPICS})
        self.assertEqual(c['photos']['topics'], TOPICS)
        for k in ('topics', 'overrides', 'photos', 'coloringOut'):
            self.assertTrue(c['content'][k].startswith('content/atlas/u1/'), k)
        self.assertEqual(c['content']['pageDir'], 'docs/assets/atlas/u1/page')
        self.assertEqual(c['content']['photoDir'], 'docs/assets/atlas/u1/photo')
        self.assertEqual(c['charts']['out'], {'climate': 'units/u1/tables/climate-world.json', 'charts': 'units/u1/tables/charts-u1.json', 'sheets': 'units/u1/shots/c4'})
        self.assertEqual(len(c['charts']['items']), 7)   # U1-7 그래프 7(기후 6 + 작아지는 지구 표) — 자세한 값은 test_tables.ChartsU1
        self.assertEqual(c['charts']['climateTable']['notInTable'], {})
        self.assertEqual(c['places']['index']['out'], 'units/u1/tables/index.json')
        self.assertNotIn('tint', c); self.assertNotIn('natural', c)
        # 레이어는 U1-3·U1-4 가 채움(U1-3c·3d 대륙·대양 p10-continents 부터) — 있으면 지도 목록의 지도를 가리킴
        ids = {m['id'] for m in json.load(open(os.path.join(HERE, '..', 'maps_u1.json'), encoding='utf-8'))}
        for lid, L in c['layers'].items():
            if lid.startswith('_'): continue
            self.assertIn('type', L, lid)
            for mid in L.get('maps') or [L['map']]:
                self.assertIn(mid, ids, lid)
        self.assertEqual(c['insets'], [])
        # 도장(@unit/…) 자리
        st = c['content']['stamps']
        self.assertIn('@unit/text/p10-labels.json', st['coloring']['files'])
        self.assertIn('@work/geo/p10-continents.fit.json', st['coloring']['files'])
        self.assertIn('sims/atlas-u1-world/data/places.json', st['coloring']['files'])
        self.assertEqual(st['charts']['stamp'], '@unit/tables/charts-u1.stamp.json')
        self.assertIn('@unit/tables/charts-u1.json', st['charts']['files'])
        self.assertEqual(st['topics']['files'][0], 'content/atlas/u1/topics.json')
        col = c['content']['coloring']
        self.assertEqual((col['page'], col['map']), (10, 'p10-continents'))
        self.assertIn(col['map'], self.by)
        # 앞 단원 자리가 설명(_) 밖에 남지 않음
        def strip(x):
            if isinstance(x, dict): return {k: strip(v) for k, v in x.items() if not k.startswith('_')}
            if isinstance(x, list): return [strip(v) for v in x]
            return x
        text = json.dumps(strip(c), ensure_ascii=False)
        for bad in ('units/u6/', 'content/atlas/u6', 'atlas-u6-oceania-polar', 'docs/assets/atlas/u6', 'charts-u6', '"u6/"',
                    'p48-', 'p49-', 'p50-', 'p51-', 'p52-', 'p53-', 'p54-', 'p55-', 'units/u5/', 'atlas-u5-americas'):
            self.assertNotIn(bad, text)

    def test_no_oceania_keys(self):
        # 오세아니아 전용 값(계획 U1-1 Step 2)은 지움: unitBoxes 상자·10a·simplifyByIso·neBox 27 상자·overdraw 지도·addLabels·dropBoxes·extraNames·
        # relocate·indexExclude·지도별 양식(maps 키)(U1-5 가 지명 키를 다시 채움)·색칠하기 extraCountries·isoByLabel·layerTypeAs
        c = self.cfg; p = c['places']; bm = c['basemap']
        self.assertEqual(bm['out'], 'sims/atlas-u1-world/data/basemap.json')
        self.assertEqual(bm['unitBoxes'], [])                      # 세계 단원은 10a 없이 110m·50m(설계 §7) — 키는 build_basemap 이 읽음
        self.assertEqual([lv['id'] for lv in bm['levels']], ['110', '50'])
        for lv in bm['levels']: self.assertNotIn('simplifyByIso', lv)
        for k in ('cutIsos', 'names', 'mergeIsos'): self.assertNotIn(k, bm)
        self.assertEqual(p['neBox'], [-180, -90, 180, 90])
        self.assertEqual(p['maps'], ['p08-world', 'p09-world', 'p08-europe'])
        self.assertEqual(p['overview'], 'p08-world')
        self.assertEqual(p['index']['checkPages'], [8, 9])
        self.assertEqual(c['cityControls']['maps'], ['p08-world', 'p09-world', 'p08-europe'])
        for k in ('places', 'cityControls'):
            for mid in c[k]['maps']: self.assertIn(mid, self.by)
        self.assertEqual(p['overdraw'], {'maps': [], 'tolPt': 0.1})
        # U1-5 가 채운 지명 키(neAlias·extraNames·addLabels·dropBoxes·mergePriority·rankBySizeMaps·symbolFix·spellAs — 까닭은 u1.places 시험)
        for k in ('relocate', 'indexExclude', 'snapAlways', 'keepTextbookPosition'):
            self.assertEqual(p[k], {}, k)
        for k in ('mergeKmMaps', 'areaKmByName', 'hidden', 'spread'):
            self.assertNotIn(k, p)
        self.assertEqual(p['mergePriority'], ['p08-europe', 'p08-world', 'p09-world'])
        for k in ('addLabels', 'dropBoxes', 'symbolFix'):
            for mid, v in p[k].items():
                self.assertIn(mid, p['maps'], k)
                for e in (v if isinstance(v, list) else v.values()): self.assertTrue(e.get('why'), (k, mid, e))
        for r in p['styles'] + p['ignore']:
            self.assertNotIn('maps', r, r)
        col = c['content']['coloring']
        for k in ('extraCountries', 'isoByLabel', 'regions', 'noCapital', 'joinLabels', 'cutIsos', 'capitalAlias', 'splitLabels'):
            self.assertNotIn(k, col)
        self.assertNotIn('layerTypeAs', c['content'])
        # 공용 절은 u6 와 같은 값(복사): defaults·shapeControls 수치·글자 묶기 수치·기호 분류·사진 후보·그래프 기본값·바탕 지도 50m 층
        with open(os.path.join(HERE, '..', 'config', 'u6.json'), encoding='utf-8') as f: u6 = json.load(f)
        self.assertEqual(c['defaults'], u6['defaults'])
        self.assertEqual({k: v for k, v in c['shapeControls'].items() if not k.startswith('_') and k != 'note'},
                         {k: v for k, v in u6['shapeControls'].items() if not k.startswith('_') and k != 'note'})
        for k in ('chain', 'symbols', 'kinds', 'exclude', 'rankBySize', 'dedupKm', 'leakRe'):
            self.assertEqual(p[k], u6['places'][k], k)
        self.assertEqual(p['glue'][:len(u6['places']['glue'])], u6['places']['glue'])   # U1-5 가 고드윈오스턴산(K2) 하나 더함
        # 글자 양식 표(ignore·styles)는 U1-5 가 8·9쪽 글꼴 조사로 고침 — u6 와 같지 않음
        self.assertEqual(c['photos']['candidate']['minAreaEachPt2'], u6['photos']['candidate']['minAreaEachPt2'])
        self.assertEqual(c['charts']['defaults'], u6['charts']['defaults'])
        self.assertEqual(bm['levels'], [lv for lv in u6['basemap']['levels'] if lv['id'] != '10a'])
        self.assertEqual(c['content']['schema'], u6['content']['schema'])


if __name__ == '__main__': unittest.main()
