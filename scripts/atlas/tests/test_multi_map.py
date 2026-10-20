# © 2026 김용현
# scripts/atlas/tests/test_multi_map.py — 여러 지도 한 레이어(설정 maps: [본 지도, 삽입]): 본 지도 면에서 삽입 틀 자리를 빼고 합친다
#   (clip_land.apply_covers + coverage). 29쪽 기후 구분 + 아이슬란드 삽입 꼴의 합성 자료.
import os, sys, unittest
from shapely.geometry import Point, box, mapping, shape

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, HERE)
import clip_land as CL

ICELAND = (-25, 63, -13, 67)           # 아이슬란드 경위도 상자
ISL_PT = Point(-19, 65)


def feat(cls, geom, src):
    return {'type': 'Feature', 'properties': {'type': 'area', 'cls': cls, 'src': src}, 'geometry': mapping(geom)}


class MultiMap(unittest.TestCase):
    def setUp(self):
        # 본 지도: 서안 해양성(c1)이 아이슬란드 자리까지 덮은 큰 면(본 지도에서 아이슬란드는 작게·대충), 지중해성(c2)
        # 삽입: 툰드라(c3)·서안 해양성(c1) — 아이슬란드를 큰 축척으로 자세히
        self.feats = [feat('c1', box(-30, 45, 10, 70), 'p29-climate'), feat('c2', box(-10, 35, 30, 45), 'p29-climate'),
                      feat('c3', box(-24, 64.5, -14, 66.6), 'p29-climate-iceland'), feat('c1', box(-24, 63.3, -14, 64.5), 'p29-climate-iceland')]
        self.covers = [{'src': 'p29-climate-iceland', 'ring': list(box(*ICELAND).exterior.coords)}]

    def test_iceland_class_comes_from_inset(self):
        geoms = CL.apply_covers(self.feats, self.covers)
        self.assertFalse(geoms[0].contains(ISL_PT), '본 지도 면에서 삽입 틀 자리가 빠짐')
        self.assertTrue(geoms[0].contains(Point(0, 50)), '틀 밖은 그대로')
        self.assertTrue(geoms[1].equals(shape(self.feats[1]['geometry'])))
        res = CL.coverage(geoms, 0.01, 0.0001, False)
        at = [f['properties'] for f, g in zip(self.feats, res) if g is not None and g.contains(ISL_PT)]
        self.assertEqual([(p['cls'], p['src']) for p in at], [('c3', 'p29-climate-iceland')])
        # 겹침 없음(덮개)
        for i in range(len(res)):
            for j in range(i + 1, len(res)):
                if res[i] is not None and res[j] is not None: self.assertLess(res[i].intersection(res[j]).area, 1e-6)

    def test_no_covers_unchanged(self):
        geoms = CL.apply_covers(self.feats, None)
        self.assertTrue(all(g.equals(shape(f['geometry'])) for g, f in zip(geoms, self.feats)))


if __name__ == '__main__': unittest.main()
