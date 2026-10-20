# © 2026 김용현
# scripts/atlas/tests/test_images.py — C3 사진·원본 쪽·밀도 음영(extract_images.py · pins.py · density_overlay.py) 검사
import json, os, subprocess, sys, tempfile, unittest
from unittest import mock
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import numpy as np
from PIL import Image
import pdfkit
import extract_images as X
import pins as P
import density_overlay as D
from atlas_common import unit_config

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = unit_config()['photos']
A = lambda *p: os.path.join(ROOT, *p)
NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class PureFunctions(unittest.TestCase):
    def test_group_strips_not_overlaps(self):
        # 맞닿은 띠 두 장은 한 덩어리, 그 위에 크게 겹친 사진은 따로
        rects = [[0, 0, 100, 50], [0, 50, 100, 80], [10, 10, 60, 40]]
        groups = X.group_rects(rects, touch=1.0)
        self.assertEqual(sorted(len(g) for g in groups), [1, 2])

    def test_covered(self):
        self.assertTrue(X.covered([0, 0, 10, 10], [[0, 0, 10, 6]], 0.5))      # 60 % 안
        self.assertFalse(X.covered([0, 0, 10, 10], [[0, 6, 10, 20]], 0.5))   # 둘 다 40 %만 겹침
        # 잘려 보이는 사진: 후보(큰 배치) 안에 사진 상자가 다 들어가면 덮인 것(작은 쪽 기준)
        self.assertTrue(X.covered([0, -40, 200, 250], [[0, 175, 200, 242]], 0.5))

    def test_pick_dpi(self):
        infos = [{'bbox': [0, 0, 72, 72], 'width': 150, 'transform': [72, 0, 0, 72, 0, 0]}]
        self.assertEqual(X.native_dpi(infos, [0, 0, 72, 72], CFG), 150)
        self.assertEqual(X.native_dpi([], [0, 0, 72, 72], CFG), CFG['vectorDpi'])
        big = [{'bbox': [0, 0, 72, 72], 'width': 600, 'transform': [72, 0, 0, 72, 0, 0]}]
        self.assertEqual(X.native_dpi(big, [0, 0, 72, 72], CFG), CFG['maxDpi'])   # 올려 잡지 않음(상한)
        # 원 사진(150dpi) 옆으로 비껴 겹친 그림자(200dpi)가 아니라 가장 닮은 사진의 dpi
        shadow = {'bbox': [3, 3, 75, 75], 'width': 200, 'transform': [72, 0, 0, 72, 3, 3]}
        self.assertEqual(X.native_dpi(infos + [shadow], [0, 0, 72, 72], CFG), 150)
        # 사진을 통째로 덮는 큰 틀 그림자(72dpi)도 아니다
        frame = {'bbox': [-10, -10, 90, 100], 'width': 100, 'transform': [100, 0, 0, 110, -10, -10]}
        self.assertEqual(X.native_dpi(infos + [frame], [0, 0, 72, 72], CFG), 150)

    def test_circle_mask(self):
        im = X.apply_mask(Image.new('RGB', (40, 40), (255, 0, 0)), 'circle')
        self.assertEqual(im.getpixel((0, 0)), (255, 255, 255))
        self.assertEqual(im.getpixel((20, 20)), (255, 0, 0))
        self.assertIs(X.apply_mask(im, None), im)

    def test_unwrap_lon(self):
        # 날짜변경선을 넘는 지도: 중심 경도 기준으로 펴서 범위가 뒤집히지 않게
        self.assertEqual(D.lon_bounds([[170, 0], [-175, 0], [60, 0]], 100), [60, 185])

    def test_km(self):
        self.assertAlmostEqual(P.km([126.98, 37.57], [139.69, 35.69]), 1153, delta=10)

    def test_parse_flags(self):
        self.assertEqual(X.parse_flags([]), set(X.STEPS))
        self.assertEqual(X.parse_flags(['--pages']), {'pages'})
        with self.assertRaises(ValueError): X.parse_flags(['--overlay'])      # 옛 이름
        with self.assertRaises(ValueError): X.parse_flags(['photos'])
        self.assertEqual(X.main(['--nope']), 2)


class RenderItem(unittest.TestCase):
    def test_images_only_only_with_key(self):
        calls = []
        rec = lambda *a, **k: calls.append((a, k)) or (1, 1, a[2])
        X.render_item({'page': 38, 'bbox': [0, 0, 10, 10]}, 150, 't.png', rec)
        X.render_item({'page': 38, 'bbox': [0, 0, 10, 10], 'imagesOnly': True}, 150, 't.png', rec)
        self.assertEqual(calls[0], ((38, [0, 0, 10, 10], 150, 't.png'), {}))          # 키 없음 = 옛 호출 그대로
        self.assertEqual(calls[1], ((38, [0, 0, 10, 10], 150, 't.png'), {'images_only': True}))


class PagesQuality(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        self.im = Image.fromarray(rng.integers(0, 255, (300, 300, 3), dtype=np.uint8))   # 잡음 = 잘 안 줄어듦
        self.d = tempfile.mkdtemp(); self.f = os.path.join(self.d, 'p.jpg')

    def test_first_quality_when_fits(self):
        self.assertEqual(X.save_under(self.im, self.f, [80, 50], 10 ** 9), (80, os.path.getsize(self.f), True))

    def test_lowers_until_fits(self):
        n80 = X.save_under(self.im, self.f, [80], 10 ** 9)[1]
        q, n, ok = X.save_under(self.im, self.f, [80, 60, 30], n80 - 1)
        self.assertTrue(ok); self.assertLess(q, 80); self.assertLess(n, n80)

    def test_reports_when_never_fits(self):
        q, n, ok = X.save_under(self.im, self.f, [80, 50], 100)
        self.assertEqual((q, ok), (50, False)); self.assertGreater(n, 100)

    def test_empty_qualities(self):
        with self.assertRaises(ValueError): X.save_under(self.im, self.f, [], 100)


class MatchPins(unittest.TestCase):
    PLACES = [{'name': '고비 사막', 'lon': 103.7, 'lat': 42.0, 'kind': 'desert'}, {'name': '다카', 'lon': 90.4, 'lat': 23.8, 'kind': 'capital'},
              {'name': '같은', 'lon': 0, 'lat': 0, 'kind': 'city'}, {'name': '같은', 'lon': 1, 'lat': 1, 'kind': 'river'}]

    def it(self, i, **k): return {'id': f'x-{i}', 'map': 'm', 'pin': i, **k}

    def test_numbered(self):
        pins = [{'xy': [1, 1], 'label': 2, 'lonlat': [10, 10]}, {'xy': [2, 2], 'label': 1, 'lonlat': [20, 20]}]
        out, w, _ = P.match_pins([self.it(1), self.it(2)], pins, [], 600)
        self.assertEqual(w, []); self.assertEqual(out['x-1']['lonlat'], [20, 20])

    def test_numbered_missing_says_what_was_found(self):
        out, w, _ = P.match_pins([self.it(3)], [{'xy': [0, 0], 'label': 1, 'lonlat': [0, 0]}], [], 600)
        self.assertIn('번호 3', w[0]); self.assertIn('[1]', w[0])

    def test_named_optimal_and_item_limit(self):
        pins = [{'xy': [0, 0], 'lonlat': [90.0, 23.0]}, {'xy': [5, 5], 'lonlat': [103.0, 43.0]}]
        items = [self.it(1, pinNear='고비 사막', pinNearMaxKm=200), self.it(2, pinNear='다카', pinNearMaxKm=40)]
        out, w, rep = P.match_pins(items, pins, self.PLACES, 600)
        self.assertEqual(out['x-1']['lonlat'], [103.0, 43.0]); self.assertEqual(out['x-2']['lonlat'], [90.0, 23.0])
        self.assertEqual(len(w), 1); self.assertIn('x-2', w[0]); self.assertIn('상한 40km', w[0])   # 다카 핀 약 95km > 40

    def test_ambiguous_radius(self):
        pins = [{'xy': [0, 0], 'lonlat': [103.0, 42.0]}, {'xy': [5, 5], 'lonlat': [104.5, 42.0]}]
        out, w, _ = P.match_pins([self.it(1, pinNear='고비 사막'), self.it(2, pinNear='다카', pinNearMaxKm=5000)], pins, self.PLACES, 600)
        self.assertTrue(any('모호' in x and 'x-1' in x for x in w), w)

    def test_place_lookup_messages(self):
        self.assertIn('없음', P.place_lonlat('브로모 화산', self.PLACES)[1])
        self.assertIn('2개', P.place_lonlat('같은', self.PLACES)[1])
        self.assertEqual(P.place_lonlat('고비사막', self.PLACES), ([103.7, 42.0], None))

    def test_duplicate_number_paired_by_place(self):
        # 33쪽 위치도: 07 이 둘(독일·이탈리아 동전) — pinNear 항목은 그 번호 핀들 안에서 지명과 짝, 다른 번호는 번호로
        places = [{'name': '베를린', 'lon': 13.4, 'lat': 52.5, 'kind': 'capital'}, {'name': '로마', 'lon': 12.5, 'lat': 41.9, 'kind': 'capital'}]
        pins = [{'xy': [1, 1], 'label': 7, 'lonlat': [13.2, 42.4]}, {'xy': [2, 2], 'label': 7, 'lonlat': [11.0, 52.7]},
                {'xy': [3, 3], 'label': 1, 'lonlat': [-1.3, 53.2]}]
        items = [self.it('a', pin=7, pinNear='베를린', pinNearMaxKm=220), self.it('b', pin=7, pinNear='로마', pinNearMaxKm=100), self.it(1)]
        for it in items[:2]: it['pin'] = 7
        out, w, rep = P.match_pins(items, pins, places, 600)
        self.assertEqual(w, [])
        self.assertEqual(out['x-a']['lonlat'], [11.0, 52.7]); self.assertEqual(out['x-b']['lonlat'], [13.2, 42.4])
        self.assertEqual(out['x-1']['lonlat'], [-1.3, 53.2]); self.assertEqual(len(rep), 2)

    def test_unlabelled_map_keeps_old_pairing(self):
        # 번호 글자가 없는 지도(물방울 핀)는 pin 번호가 있어도 번호 없는 핀 전체에서 짝(u2 20·21쪽 그대로)
        pins = [{'xy': [0, 0], 'lonlat': [103.0, 43.0]}]
        out, w, _ = P.match_pins([self.it(1, pinNear='고비 사막', pinNearMaxKm=200)], pins, self.PLACES, 600)
        self.assertEqual(w, []); self.assertEqual(out['x-1']['lonlat'], [103.0, 43.0])

    def test_unconvertible_pin_warns(self):
        out, w, _ = P.match_pins([self.it(1)], [{'xy': [0, 0], 'label': 1, 'lonlat': None}], [], 600)
        self.assertTrue(any('못 되돌린' in x for x in w))


class NodeCalls(unittest.TestCase):
    def fake(self, stdout, code=0):
        return lambda *a, **k: subprocess.CompletedProcess(a, code, stdout=stdout, stderr='boom')

    def test_length_mismatch(self):
        with self.assertRaises(RuntimeError) as cm:
            P.node_lonlat({'m': [[0, 0], [1, 1]]}, run=self.fake(json.dumps({'m': [[1, 2]]})))
        self.assertIn('2개를 보냈는데 1개', str(cm.exception))

    def test_failure_and_timeout(self):
        with self.assertRaises(RuntimeError): P.node_lonlat({'m': [[0, 0]]}, run=self.fake('', 1))
        def slow(*a, **k): raise subprocess.TimeoutExpired('node', 1)
        with self.assertRaises(RuntimeError) as cm: P.node_lonlat({'m': [[0, 0]]}, run=slow)
        self.assertIn('초 안에', str(cm.exception))

    def test_node_missing(self):
        with mock.patch.object(P.shutil, 'which', return_value=None):
            with self.assertRaises(RuntimeError) as cm: P.node_lonlat({'m': [[0, 0]]})
        self.assertIn('node 를 찾을 수 없음', str(cm.exception))

    def test_null_passthrough(self):
        out = P.node_lonlat({'m': [[0, 0]]}, run=self.fake(json.dumps({'m': [None]})))
        self.assertEqual(out, {'m': [None]})

    def test_center_missing_fit(self):
        with self.assertRaises(RuntimeError) as cm: P.node_center('no-such-map-id')
        self.assertIn('georef-cli', str(cm.exception))

    def test_fit_missing_fit(self):
        with self.assertRaises(RuntimeError) as cm: P.node_fit('no-such-map-id')
        self.assertIn('--fit', str(cm.exception))

    def test_fit_passthrough(self):
        fit = {'family': 'miller', 'params': [100], 'sim': {'a': 1, 'b': 0, 'tx': 0, 'ty': 0}}
        self.assertEqual(P.node_fit('m', run=self.fake(json.dumps(fit))), fit)


class Density(unittest.TestCase):
    """합성 배열: 왼쪽 음영(200,80,60) | 가운데 50% 섞인 해안 한 줄 | 오른쪽 흰 바다, 음영 위 아이콘·바다 위 아이콘."""
    OC = dict(whiteMin=248, iconBlueOverRed=40, iconDilatePx=1, inpaintMinOpaqueFrac=0.5, edgePx=2, noiseD=20)
    SHADE = np.array([200, 80, 60]); BLUE = np.array([20, 80, 160])

    def setUp(self):
        a = np.full((30, 40, 3), 255, np.uint8)
        a[:, :20] = self.SHADE
        a[:, 20] = ((self.SHADE + 255) / 2).round()       # 해안 섞임 화소
        a[5:9, 5:9] = self.BLUE                             # 음영 위 아이콘
        a[20:24, 30:34] = self.BLUE                         # 바다 위 아이콘
        a[10, 32] = (246, 250, 251)                         # 바다 잡티(거의 흰색, 푸르스름)
        self.out, self.info = D.density_rgba(a, self.OC)

    def test_white_transparent_shade_opaque(self):
        self.assertEqual(self.out[15, 38, 3], 0)
        self.assertEqual(self.out[15, 10, 3], 255)
        self.assertEqual(tuple(self.out[15, 10, :3]), tuple(self.SHADE))

    def test_icon_on_shade_filled(self):
        self.assertEqual(self.out[6, 6, 3], 255)
        self.assertLess(np.abs(self.out[6, 6, :3].astype(int) - self.SHADE).max(), 2)

    def test_icon_on_sea_transparent(self):
        self.assertEqual(self.out[21, 31, 3], 0)
        self.assertEqual(self.info, {'icons': 2, 'inpainted': 1, 'soft': self.info['soft']})

    def test_sea_speckle_transparent(self):
        self.assertEqual(self.out[10, 32, 3], 0)

    def test_soft_edge_unpremultiplied(self):
        al = self.out[15, 20, 3]
        self.assertTrue(110 <= al <= 145, al)                                  # 약 50 %
        self.assertLess(np.abs(self.out[15, 20, :3].astype(int) - self.SHADE).max(), 4)   # 흰빛을 걷어 낸 색
        self.assertEqual(D.blue_pixels(Image.fromarray(self.out, 'RGBA'), 40), 0)


@NEED_PDF
class FindPins(unittest.TestCase):
    def test_shape_pins_p20(self):
        ps = P.find_pins('p20-relief', CFG['pins']['p20-relief'])
        self.assertEqual(len(ps), 7); self.assertTrue(all('label' not in p for p in ps))

    def test_numbered_pins(self):
        self.assertEqual(sorted(p['label'] for p in P.find_pins('p25-heritage', CFG['pins']['p25-heritage'])), list(range(1, 12)))
        self.assertEqual(sorted(p['label'] for p in P.find_pins('p22-religion', CFG['pins']['p22-religion'])), [1, 2, 3, 4])

    def test_exclude_boxes(self):
        # excludeBoxes 안의 핀은 뺀다(29쪽 기후 지도 틀 안의 아이슬란드 삽입 지도 핀)
        class R:
            def __init__(s, x0, y0, x1, y1): s.x0, s.y0, s.x1, s.y1, s.width, s.height = x0, y0, x1, y1, x1 - x0, y1 - y0
        ds = [{'fill': (0x72 / 255, 0x51 / 255, 0xa1 / 255), 'rect': R(10, 10, 27, 29.5)}, {'fill': (0x72 / 255, 0x51 / 255, 0xa1 / 255), 'rect': R(100, 100, 117, 119.5)}]
        pc = {'by': 'shape', 'fill': '#7251a1', 'w': [15, 19], 'h': [18, 22], 'anchor': 'bottom'}
        with mock.patch.object(P, 'maps', return_value={'m': {'page': 1, 'bbox': [0, 0, 200, 200]}}), mock.patch.object(P, 'drawings', return_value=ds):
            self.assertEqual(len(P.find_pins('m', pc)), 2)
            self.assertEqual(P.find_pins('m', {**pc, 'excludeBoxes': [[0, 0, 50, 50]]}), [{'xy': [108.5, 119.5]}])

    def test_unknown_method(self):
        with self.assertRaises(ValueError): P.find_pins('p20-relief', {'by': 'magic'})

    def test_candidates_all_covered(self):
        w = []; X.check_candidates(w)
        self.assertEqual(w, [])


class Config(unittest.TestCase):
    def test_items_well_formed(self):
        ids = [it['id'] for it in CFG['items']]
        self.assertEqual(len(ids), len(set(ids)))
        for it in CFG['items']:
            with self.subTest(it['id']):
                self.assertIn(it['topic'], CFG['topics'])
                self.assertEqual(len(it['bbox']), 4)
                self.assertTrue(it.get('captionBox') or it.get('captionOverride'))
                if 'pin' in it: self.assertIn(it.get('map'), CFG['pins'])

    def test_counts_per_topic(self):
        counts = X.topic_counts(CFG['items'])
        for t, n in CFG['expect'].items():
            self.assertEqual(counts.get(t, 0), n, t)

    def test_page_image_qualities(self):
        self.assertTrue(CFG['pageImage']['qualities'])


class Outputs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(A(CFG['outJson']), encoding='utf-8') as f: cls.photos = json.load(f)
        cls.by = {p['id']: p for p in cls.photos}

    def test_matches_config(self):
        # 설정을 고치고 다시 뽑지 않으면 실패(낡은 산출물)
        self.assertEqual([p['id'] for p in self.photos], [it['id'] for it in CFG['items']])
        for it in CFG['items']:
            p = self.by[it['id']]
            with self.subTest(it['id']):
                self.assertEqual(p['bbox'], it['bbox']); self.assertEqual(p['topic'], it['topic']); self.assertEqual(p['page'], it['page'])
                if 'pin' in it: self.assertEqual(p['pin'], it['pin'])
                if 'captionOverride' in it: self.assertEqual(p['caption'], it['captionOverride'])

    def test_captions(self):
        for p in self.photos:
            with self.subTest(p['id']):
                self.assertTrue(p['caption'].strip())
                for k in ('caption', 'title', 'credit'):
                    self.assertNotIn('�', p.get(k, ''))
                    self.assertNotIn('  ', p.get(k, ''))

    def test_pins_have_lonlat(self):
        for p in self.photos:
            if 'pin' not in p: continue
            with self.subTest(p['id']):
                lon, lat = p['lonlat']
                self.assertTrue(20 <= lon <= 160 and -15 <= lat <= 80, p['lonlat'])

    def test_files_and_dimensions(self):
        total = 0
        for p in self.photos:
            with self.subTest(p['id']):
                b = p['bbox']
                for ext in ('jpg', 'webp'):
                    f = A(CFG['assetDir'], 'photo', f"{p['id']}.{ext}")
                    self.assertTrue(os.path.exists(f), f)
                    total += os.path.getsize(f)
                    with Image.open(f) as im:
                        self.assertAlmostEqual(im.width, (b[2] - b[0]) * p['dpi'] / 72, delta=2)
                        self.assertAlmostEqual(im.height, (b[3] - b[1]) * p['dpi'] / 72, delta=2)
                        self.assertEqual((im.width, im.height), (p['width'], p['height']))
                self.assertLessEqual(p['dpi'], CFG['maxDpi'])
        self.assertLessEqual(total, CFG['maxTotalBytes'])

    def test_page_images_exist_and_fit(self):
        pc = CFG['pageImage']
        for pno in range(CFG['pages'][0], CFG['pages'][1] + 1):
            f = A(CFG['assetDir'], 'page', f'p{pno:03d}.jpg')
            with self.subTest(pno):
                self.assertTrue(os.path.exists(f), f)
                self.assertLessEqual(os.path.getsize(f), pc['maxBytes'])

    @NEED_PDF
    def test_page_image_size_matches_pdf(self):
        pc = CFG['pageImage']
        for pno in range(CFG['pages'][0], CFG['pages'][1] + 1):
            r = pdfkit.doc()[pno - 1].rect
            with self.subTest(pno), Image.open(A(CFG['assetDir'], 'page', f'p{pno:03d}.jpg')) as im:
                self.assertAlmostEqual(im.width, r.width * pc['dpi'] / 72, delta=2)
                self.assertAlmostEqual(im.height, r.height * pc['dpi'] / 72, delta=2)

    def test_overlays(self):
        self.assertTrue(CFG['overlays'])
        for oc in CFG['overlays']:
            with self.subTest(oc['id']):
                with open(A(oc['json']), encoding='utf-8') as f: meta = json.load(f)
                self.assertEqual(meta['fitId'], oc['map'])
                # 앱 역투영용 fit(pt2lonlat.mjs --fit): 도법·매개변수·닮음 변환만, 통계·기준점은 없음
                self.assertTrue({'family', 'params', 'sim'} <= set(meta['fit']) <= {'family', 'params', 'sim', 'tps'}, meta.get('fit'))
                self.assertTrue(meta['url'].startswith(CFG['assetBase']) and meta['url'].endswith(oc['out']))
                w, s_, e, n = meta['bounds']
                self.assertTrue(w < e <= w + 360 and -90 <= s_ < n <= 90, meta['bounds'])   # 북쪽 테두리가 극 가까이라 경도 폭은 넓다
                with Image.open(A(CFG['assetDir'], oc['out'])) as im:
                    self.assertEqual(im.mode, 'RGBA')
                    self.assertEqual((im.width, im.height), (meta['width'], meta['height']))
                    self.assertEqual(im.getchannel('A').getextrema(), (0, 255))
                    alpha = np.asarray(im.getchannel('A'))
                    self.assertTrue(((alpha > 0) & (alpha < 255)).any())      # 부드러운 테두리
                    self.assertEqual(D.blue_pixels(im, oc['iconBlueOverRed']), 0)   # 사람 아이콘(파랑)이 없다


@NEED_PDF
class OverlayLegend(unittest.TestCase):
    """23쪽 인구 밀도 음영의 범례 단계: 지면 범례 견본 수 = 설정 expectLegend = JSON legend."""
    def test_legend_matches_printed(self):
        for oc in unit_config()['photos']['overlays']:
            leg = D.overlay_legend(oc)
            self.assertEqual(len(leg), oc['expectLegend'], oc['id'])
            self.assertTrue(all(e['label'] and e['color'].startswith('#') for e in leg))
            self.assertNotIn('#0072bc', [e['color'] for e in leg])      # 같은 상자의 인구 막대 견본은 빠짐
            root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
            with open(os.path.join(root, oc['json']), encoding='utf-8') as f:
                self.assertEqual(json.load(f)['legend'], leg)
        self.assertEqual([e['label'] for e in D.overlay_legend(unit_config()['photos']['overlays'][0])],
                         ['200 이상', '100~200', '50~100', '5~50', '5 미만'])


if __name__ == '__main__': unittest.main()
