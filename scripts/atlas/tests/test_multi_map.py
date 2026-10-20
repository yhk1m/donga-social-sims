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

    def test_self_intersecting_cover_ring_made_valid(self):
        # U3-3 리뷰(중요 2): 되돌린 틀 고리가 꼬여 있어도(나비 넥타이) 유효하게(polygonal = make_valid) 만든 뒤 뺀다 — 그냥 Polygon 이면
        # difference 가 예외를 내거나 엉뚱한 곳을 지운다. 꼬인 고리의 두 삼각형 자리만 빠지고 나머지 본 지도 면은 그대로
        bow = [(-25, 63), (-13, 67), (-13, 63), (-25, 67), (-25, 63)]
        geoms = CL.apply_covers(self.feats, [{'src': 'p29-climate-iceland', 'ring': bow}])
        g = geoms[0]
        self.assertTrue(g.is_valid)
        self.assertFalse(g.contains(Point(-14, 65)))          # 오른쪽 삼각형 안
        self.assertFalse(g.contains(Point(-24, 65)))          # 왼쪽 삼각형 안(buffer(0) 이면 한쪽만 남을 수 있음 — make_valid 는 둘 다)
        self.assertTrue(g.contains(Point(0, 50)))
        lost = shape(self.feats[0]['geometry']).area - g.area
        self.assertLess(lost, 12 * 4 / 2 + 1e-6)               # 두 삼각형 넓이(합 24°²) 넘게 지우지 않음

    def test_no_covers_unchanged(self):
        geoms = CL.apply_covers(self.feats, None)
        self.assertTrue(all(g.equals(shape(f['geometry'])) for g, f in zip(geoms, self.feats)))


if __name__ == '__main__': unittest.main()
