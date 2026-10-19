# © 2026 김용현
# scripts/atlas/tests/test_natural.py — 자연색 지형 화상(build_natural.py): 설정 확인, 입력 확인(RGB·경위도·전 지구), 만든 JPEG 가 설정 크기·용량 안이고
# 교과서 20쪽처럼 낮은 땅 초록·사막 황토·빙하 흰색·바다 파랑인지(몇 곳 색)
import os, sys, unittest
from types import SimpleNamespace
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build_natural
from atlas_common import unit_config, REPO


class Natural(unittest.TestCase):
    def setUp(self):
        self.n = unit_config()['natural']

    def test_validate_config(self):
        from PIL import Image
        relief = Image.open(os.path.join(REPO, build_natural.RELIEF)).size
        self.assertEqual(build_natural.validate(self.n, relief), [])
        msgs = build_natural.validate(dict(self.n, width=2048, quality=99, out='x.png'), relief)
        self.assertTrue(any('음영 화상' in m for m in msgs) and any('quality' in m for m in msgs) and any('.jpg' in m for m in msgs), msgs)

    def test_check_source(self):
        B = SimpleNamespace
        ok = B(count=3, dtypes=('uint8',) * 3, crs=None, bounds=B(left=-180, right=180, top=90, bottom=-90))
        self.assertEqual(build_natural.check_source(ok), [])
        bad = B(count=1, dtypes=('uint16',), crs=None, bounds=B(left=0, right=180, top=90, bottom=-90))
        msgs = build_natural.check_source(bad)
        self.assertTrue(any('RGB' in m for m in msgs) and any('uint8' in m for m in msgs) and any('전 지구' in m for m in msgs), msgs)

    def test_jpeg_size_budget_and_colours(self):
        from PIL import Image
        p = os.path.join(REPO, self.n['out'])
        self.assertTrue(os.path.exists(p), p)
        self.assertLessEqual(os.path.getsize(p), self.n['maxBytes'])
        im = Image.open(p)
        self.assertEqual(im.format, 'JPEG'); self.assertEqual(im.mode, 'RGB')
        self.assertEqual(im.size, (self.n['width'], self.n['height']))
        a = np.asarray(im).astype(int)
        H, W, _ = a.shape

        def at(lon, lat, r=6):
            y, x = int((90 - lat) / 180 * H), int((lon + 180) / 360 * W)
            return a[y - r:y + r, x - r:x + r].reshape(-1, 3).mean(0)
        r, g, b = at(105.0, 15.0)  # 태국 중부 낮은 땅
        self.assertTrue(g > r and g > b, f'동남아시아 초록 {r, g, b}')
        r, g, b = at(47.0, 20.0)  # 아라비아 반도 사막
        self.assertTrue(r > b + 30, f'아라비아 황토 {r, g, b}')
        r, g, b = at(-40.0, 75.0)  # 그린란드 빙상
        self.assertTrue(min(r, g, b) > 200, f'빙하 흰색 {r, g, b}')
        r, g, b = at(-140.0, 0.0)  # 태평양
        self.assertTrue(b > r + 40, f'바다 파랑 {r, g, b}')


if __name__ == '__main__':
    unittest.main()
