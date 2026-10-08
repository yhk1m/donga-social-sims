# © 2026 김용현
# scripts/atlas/tests/test_images.py — C3 사진·원본 쪽·밀도 음영(extract_images.py) 검사
import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import extract_images as X
from atlas_common import unit_config
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = unit_config()['photos']
A = lambda *p: os.path.join(ROOT, *p)


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
        # 원 사진(150dpi) 옆으로 비껴 겹친 그림자(200dpi)가 아니라 가장 많이 겹치는 사진의 dpi
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
        self.assertEqual(X.lon_bounds([[170, 0], [-175, 0], [60, 0]], 100), [60, 185])

    def test_km(self):
        self.assertAlmostEqual(X.km([126.98, 37.57], [139.69, 35.69]), 1153, delta=10)


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

    def test_page_images(self):
        pc = CFG['pageImage']
        for pno in range(CFG['pages'][0], CFG['pages'][1] + 1):
            f = A(CFG['assetDir'], 'page', f'p{pno:03d}.jpg')
            with self.subTest(pno):
                self.assertTrue(os.path.exists(f), f)
                self.assertLessEqual(os.path.getsize(f), pc['maxBytes'])
                with Image.open(f) as im:
                    self.assertAlmostEqual(im.width, 779.53 * pc['dpi'] / 72, delta=3)

    def test_overlay(self):
        oc = CFG['overlay']
        with open(A(oc['json']), encoding='utf-8') as f: meta = json.load(f)
        self.assertEqual(meta['fitId'], oc['map'])
        w, s_, e, n = meta['bounds']
        self.assertTrue(w < e <= w + 360 and -90 <= s_ < n <= 90, meta['bounds'])   # 북쪽 테두리가 극 가까이라 경도 폭은 넓다
        self.assertTrue(meta['url'].startswith(CFG['assetBase']) and meta['url'].endswith(oc['out']))
        with Image.open(A(CFG['assetDir'], oc['out'])) as im:
            self.assertEqual(im.mode, 'RGBA')
            self.assertEqual((im.width, im.height), (meta['width'], meta['height']))
            a = im.getchannel('A')
            lo, hi = a.getextrema()
            self.assertEqual((lo, hi), (0, 255))
            # 사람 아이콘(파랑)이 남아 있지 않다
            self.assertEqual(X.blue_pixels(im, oc['iconBlueOverRed']), 0)


if __name__ == '__main__': unittest.main()
