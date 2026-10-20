# © 2026 김용현
# scripts/atlas/tests/test_features.py — 주제도 내용 뽑기(atlas_common·legend) 검사
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import atlas_common as C
import legend as LG
from shapely.geometry import Polygon

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Colors(unittest.TestCase):
    def test_delta_e(self):
        self.assertAlmostEqual(C.delta_e('#ffffff', '#ffffff'), 0.0)
        self.assertGreater(C.delta_e('#d71920', '#0bb14b'), 50)

    def test_match_color_exact_then_nearest(self):
        leg = [{'cls': 'c1', 'color': '#f5eeba'}, {'cls': 'c2', 'color': '#78b6e4'}]
        self.assertEqual(C.match_color('#78b6e4', leg, 6)['cls'], 'c2')
        self.assertEqual(C.match_color('#f5eebb', leg, 6)['cls'], 'c1')
        self.assertIsNone(C.match_color('#ff0000', leg, 6))


class Geometry(unittest.TestCase):
    def test_polygonal_flattens_collections(self):
        bow = Polygon([(0, 0), (2, 2), (2, 0), (0, 2)])   # 자기 교차 → make_valid 가 다중 면으로
        g = C.polygonal(bow)
        self.assertIsNotNone(g)
        self.assertAlmostEqual(g.area, 2.0)


class Config(unittest.TestCase):
    def test_every_layer_has_map_and_mode(self):
        for lid in C.layer_ids():
            cfg = C.layer_config(lid)
            self.assertIn(cfg['map'], C.maps(), lid)
            self.assertTrue(cfg.get('mode') or cfg.get('source') == 'ne', lid)
            self.assertIn('expectLegend', cfg, lid)


@NEED_PDF
class Legends(unittest.TestCase):
    def test_growth_legend(self):
        leg = LG.legend(C.maps()['p23-growth'], C.layer_config('p23-growth'))
        self.assertEqual([e['label'] for e in leg],
                         ['1.5 이상', '1.0~1.5', '0.5~1.0', '0~0.5', '-0.5~0', '-1.0~-0.5', '-1.0 이하'])

    def test_climate_legend_columns_and_hatch(self):
        cfg = C.layer_config('p21-climate'); m = C.maps()['p21-climate']
        leg = LG.legend(m, cfg)
        self.assertEqual(len(leg), 13)
        self.assertEqual(leg[0]['label'], '열대 우림 기후')
        self.assertEqual(leg[5]['label'], '온난 습윤 기후')   # 범례 안 '80˚E' 눈금 글자는 빠진다
        h = LG.hatch_legend(m, cfg['hatch'])
        self.assertEqual(h['label'], '고산 기후')
        self.assertEqual(h['pattern'], 'hatch')

    def test_trade_legend_rows_and_flow_widths(self):
        cfg = C.layer_config('p24-trade'); m = C.maps()['p24-trade']
        self.assertEqual([e['label'] for e in LG.legend(m, cfg)], ['0~1', '1~3', '3~5', '5~10', '10~50', '50~100', '100 이상'])
        self.assertEqual(LG.flow_legend(m, '#ed0c6e'), [(0.6, '1~2'), (1.0, '2~5'), (1.5, '5~10'), (2.0, '10 이상')])
        self.assertEqual(LG.legend_unit(m, cfg['flows']['unitTextRe']), '백억 달러, 2022')


class RasterProtos(unittest.TestCase):
    """U3-4: 래스터 지도 화소색이 범례 견본색과 다른 분류(29쪽 사막 = 지도 #fed08f, 범례 #fff56d)는 rasterAliases 로 더한 견본색.
    legendOnly(교과서 지도에 면이 없는 범례 — 29쪽 온대·냉대 겨울 건조)는 화소 분류 후보에서 뺀다(가장자리 섞인 색이 그 분류로 잡히지 않게)."""
    FILLS = [{'cls': 'c1', 'color': '#fff56d', 'label': '사막 기후'}, {'cls': 'c2', 'color': '#ffdd00', 'label': '스텝 기후'},
             {'cls': 'c3', 'color': '#bed747', 'label': '온대 겨울 건조 기후'}]

    def test_aliases_add_color_owned_by_legend_class(self):
        import zones as Z
        colors, owner = Z.raster_protos(self.FILLS, {'#fed08f': '사막 기후', '_doc': 'x'})
        self.assertEqual(colors, ['#fff56d', '#ffdd00', '#bed747', '#fed08f'])
        self.assertEqual(owner, [0, 1, 2, 0])
        self.assertEqual(Z.raster_protos(self.FILLS, None), (['#fff56d', '#ffdd00', '#bed747'], [0, 1, 2]))
        with self.assertRaises(ValueError): Z.raster_protos(self.FILLS, {'#fed08f': '없는 이름'})

    def test_legend_only_marks_and_drops_from_fills(self):
        import features as F
        leg = [dict(e) for e in self.FILLS]
        fills = F.mark_legend_only(leg, {'온대 겨울 건조 기후': '교과서 지도에 면이 없음'})
        self.assertEqual([e['cls'] for e in fills], ['c1', 'c2'])
        self.assertIs(leg[2]['geometry'], False)
        with self.assertRaises(ValueError): F.mark_legend_only(leg, {'없는 이름': 'x'})


if __name__ == '__main__':
    unittest.main()
