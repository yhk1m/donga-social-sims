# © 2026 김용현
# scripts/atlas/tests/test_regress_png.py — 회귀 화소 비교 도우미(regress_png.py) 자체 검사: 불투명 그림의 RGB 한 화소 차이도 잡는다.
import os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from PIL import Image
import regress_png


class RegressPng(unittest.TestCase):
    def test_one_rgb_pixel(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = os.path.join(d, 'a.png'), os.path.join(d, 'b.png')
            im = Image.new('RGB', (4, 4), (255, 255, 255)); im.save(a)
            im.putpixel((2, 1), (254, 255, 255)); im.save(b)
            r = regress_png.compare(a, b)
            self.assertEqual(r['diff'], 1)
            self.assertEqual(r['bbox'], [2, 1, 3, 2])
            self.assertEqual(regress_png.compare(a, a)['diff'], 0)

    def test_size_and_missing(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = os.path.join(d, 'a.png'), os.path.join(d, 'b.png')
            Image.new('RGB', (4, 4)).save(a); Image.new('RGB', (5, 4)).save(b)
            self.assertEqual(regress_png.compare(a, b)['error'], '크기 다름')
            self.assertIn('없음', regress_png.compare(a, os.path.join(d, 'x.png'))['error'])


if __name__ == '__main__':
    unittest.main()
