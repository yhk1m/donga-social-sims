# scripts/atlas/tests/test_tint.py — 고도 색 분류(build_tint.classify)가 앱(src/atlas/tint.js tintClassOf)과 같은 표(tests/atlas/fixtures/tint-cases.json)를 따르는지,
# 분류 표가 교과서 16쪽 범례 단계·색과 같은지, 만든 PNG 가 설정 크기·회색 간격·용량 안인지
import json, os, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build_tint
from atlas_common import unit_config, REPO

CASES = json.load(open(os.path.join(REPO, 'tests', 'atlas', 'fixtures', 'tint-cases.json'), encoding='utf-8'))['cases']


class Tint(unittest.TestCase):
    def setUp(self):
        self.t = unit_config()['tint']

    def test_classify_matches_shared_table(self):
        elev = np.array([c[0] for c in CASES], float)
        land = np.array([c[1] for c in CASES]); glac = np.array([c[2] for c in CASES])
        got = build_tint.classify(elev, land, glac, self.t)
        self.assertEqual(got.tolist(), [c[3] for c in CASES])

    def test_classes_follow_textbook_legend(self):
        cls = build_tint.classes(self.t)
        self.assertEqual(len(cls), 18)
        self.assertEqual(self.t['landBreaks'], [0, 100, 200, 500, 1000, 2000, 3000, 4000, 5000])
        self.assertEqual(self.t['seaBreaks'], [200, 1000, 2000, 4000, 6000, 8000])
        self.assertEqual([c['kind'] for c in cls], ['sea'] * 7 + ['below'] + ['land'] * 9 + ['glacier'])
        self.assertLessEqual((len(cls) - 1) * self.t['codeStep'], 255)

    def test_png_size_codes_and_budget(self):
        from PIL import Image
        p = os.path.join(REPO, self.t['out'])
        self.assertTrue(os.path.exists(p), p)
        self.assertLessEqual(os.path.getsize(p), self.t['maxBytes'])
        im = Image.open(p)
        self.assertEqual(im.mode, 'L'); self.assertEqual(im.size, (self.t['width'], self.t['height']))
        a = np.asarray(im)
        self.assertTrue(np.all(a % self.t['codeStep'] == 0), '회색은 번호 × codeStep')
        self.assertLessEqual(int(a.max()) // self.t['codeStep'], 17)
        H, W = a.shape
        at = lambda lon, lat: int(a[int((90 - lat) / 180 * H), int((lon + 180) / 360 * W)]) // self.t['codeStep']
        self.assertGreaterEqual(at(88.0, 32.0), 15, '티베트 고원 4,000 m 이상(또는 빙하)')
        self.assertIn(at(125.0, 37.0), (0, 1), '황해 = 얕은 바다')
        self.assertEqual(at(-140.0, 10.0), 4, '동태평양 4,000~6,000 m')
        self.assertEqual(at(48.0, 46.0), 7, '카스피해 북서 연안 해수면 아래 땅')


if __name__ == '__main__':
    unittest.main()
