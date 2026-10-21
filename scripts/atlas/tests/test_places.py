# © 2026 김용현
# scripts/atlas/tests/test_places.py — 일반도 지명 뽑기(places.py)·찾아보기 파싱 검사
import os, re, sys, unittest
from unittest import mock
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import places as PL
import assign

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')


class Names(unittest.TestCase):
    def test_letter_spaced_hangul_is_joined(self):
        self.assertEqual(PL.clean_name('카 자 흐 초 원'), '카자흐초원')
        self.assertEqual(PL.clean_name('인   도   양'), '인도양')
        self.assertEqual(PL.clean_name('대 순 다   열 도'), '대순다열도')

    def test_real_spaces_are_kept(self):
        self.assertEqual(PL.clean_name('포크 해협'), '포크 해협')
        self.assertEqual(PL.clean_name('말레이  제도'), '말레이 제도')

    def test_key_ignores_spaces(self):
        self.assertEqual(PL.key('고비 사막'), PL.key('고비사막'))

    def test_kind_by_suffix(self):
        cfg = PL.places_config()
        self.assertEqual(PL.kind_of('landform', '우랄산맥', None, cfg), 'mountain')
        self.assertEqual(PL.kind_of('landform', '고비사막', None, cfg), 'desert')
        self.assertEqual(PL.kind_of('water', '양쯔강', None, cfg), 'river')
        self.assertEqual(PL.kind_of('water', '남중국해', None, cfg), 'sea')
        self.assertEqual(PL.kind_of('land', '수마트라섬', None, cfg), 'island')
        self.assertEqual(PL.kind_of('city', '서울', 'capital', cfg), 'capital')
        self.assertEqual(PL.kind_of('city', '백두산', 'mountain', cfg), 'mountain')
        self.assertEqual(PL.kind_of('city', '부산', 'city', cfg), 'city')
        self.assertEqual(PL.kind_of('country', '중국', None, cfg), 'country')

    def test_style_maps_condition(self):
        """U5-3b: 양식 표 항목의 maps(지도 id 목록)는 그 지도에서만 맞는다 — 없으면 모든 지도(옛 동작)."""
        cfg = {'ignore': [{'font': '^X$', 'maps': ['p42-north'], 'why': 'w'}],
               'styles': [{'role': 'city', 'font': '^F$', 'size': [5, 6], 'maps': ['p42-north']}, {'role': 'landform', 'font': '^F$'}]}
        s = {'text': '덴버', 'font': 'F', 'size': 5.8, 'color': '#000000'}
        self.assertEqual(PL.style_of(s, cfg, 'p42-north')[1]['role'], 'city')
        self.assertEqual(PL.style_of(s, cfg, 'p40-americas')[1]['role'], 'landform')
        self.assertEqual(PL.style_of(s, cfg)[1]['role'], 'landform')
        x = {'text': '1', 'font': 'X', 'size': 5.8, 'color': '#000000'}
        self.assertEqual(PL.style_of(x, cfg, 'p42-north')[0], 'ignore')
        self.assertEqual(PL.style_of(x, cfg, 'p43-south'), (None, None))


def _sp(text, x, y, size=6.0, d=(1.0, 0.0), role='landform', joinEm=2.6, w=None):
    w = w if w is not None else size * len(text.replace(' ', ''))
    return {'text': text, 'size': size, 'font': 'F', 'color': '#000000', 'dir': list(d),
            'bbox': [x, y, x + w, y + size], 'rule': RULES[role]}


RULES = {'landform': {'role': 'landform', 'joinEm': 2.6}, 'city': {'role': 'city', 'joinEm': 0.4, 'point': True}}


class Group(unittest.TestCase):
    def test_curved_chain_is_read_along_glyph_direction(self):
        # 위로 거슬러 오르는 강 이름: 흐름 순서가 거꾸로(강, 나, 레)여도 글자 방향을 따라 레→나→강
        d = (-0.5, -0.866)
        spans = [_sp('강', 100, 80, d=d, joinEm=2.8), _sp('나', 104, 87, d=d), _sp('레', 108, 94, d=d)]
        self.assertEqual([L['name'] for L in PL.group(spans)], ['레나강'])

    def test_stacked_different_labels_stay_apart(self):
        spans = [_sp('울릉도', 100, 100, role='landform'), _sp('독도', 100, 107, role='landform')]
        self.assertEqual(sorted(L['name'] for L in PL.group(spans, frozenset({'울릉도', '독도'}))), ['독도', '울릉도'])

    def test_two_line_label_joined_only_when_in_index(self):
        spans = [_sp('아나톨리아', 100, 100), _sp('고원', 109, 107)]
        self.assertEqual(sorted(L['name'] for L in PL.group(spans)), ['고원', '아나톨리아'])
        self.assertEqual([L['name'] for L in PL.group(spans, frozenset({'아나톨리아고원'}))], ['아나톨리아 고원'])

    def test_touching_neighbours_split_by_index(self):
        spans = [_sp('벨', 100, 100), _sp('기', 107, 100), _sp('에', 114, 100), _sp('독', 122, 100), _sp('일', 129, 100)]
        self.assertEqual([L['name'] for L in PL.group(spans, frozenset({'벨기에', '독일'}))], ['벨기에', '독일'])

    def test_single_char_line_joins_without_space(self):
        # 세로로 쌓인 강 이름(엘 / 베강, 26쪽): 한 글자 줄이 낀 여러 줄 지명은 공백 없이 — 「엘 베강」이 아니라 「엘베강」
        d = (0.846, 0.533)
        spans = [_sp('엘', 330, 352, d=d), _sp('베', 330.6, 360, d=d), _sp('강', 333.5, 366.6, d=d)]
        names = [L['name'] for L in PL.group(spans, frozenset({'엘베강'}))]
        self.assertEqual(names, ['엘베강'])

    def test_multi_char_lines_keep_space(self):
        # 한 글자 줄 잇기의 회귀 시험: 두 줄이 모두 여러 글자면 줄 사이 공백을 지킨다(26쪽 보스니아 / 헤르체고비나)
        spans = [_sp('보스니아', 100, 100), _sp('헤르체고비나', 96, 107)]
        names = [L['name'] for L in PL.group(spans, frozenset({'보스니아헤르체고비나'}))]
        self.assertEqual(names, ['보스니아 헤르체고비나'])

    def test_opposite_glyph_directions_break_chain_only_with_min_dir_cos(self):
        # 34쪽 하르툼: 백나일강(아래→위)·청나일강(위→아래) 끝 「강」끼리 맞닿음 — chain.minDirCos(u4 설정)가 있을 때만 끊는다
        up, down = (0.3, -0.95), (0.35, 0.94)
        spans = [_sp('백', 537.4, 281.7, 6.4, up), _sp('나', 538.8, 275.2, 6.4, up), _sp('일', 539.9, 268.7, 6.4, up),
                 _sp('강', 541.5, 261.8, 6.4, up), _sp('청', 547.3, 243.5, 6.4, down), _sp('나', 549.5, 249.5, 6.4, down),
                 _sp('일', 551.7, 254.5, 6.4, down), _sp('강', 554.5, 260.8, 6.4, down)]
        base = dict(PL.places_config()['chain'])
        base.pop('minDirCos', None)
        with mock.patch.object(PL, '_chain', return_value=base):
            self.assertEqual(len(PL.group(spans)), 1)                 # 옛 동작(u2·u3): 한 지명으로 이어짐
        with mock.patch.object(PL, '_chain', return_value={**base, 'minDirCos': 0}):
            self.assertEqual(sorted(L['name'] for L in PL.group(spans)), ['백나일강', '청나일강'])


def _gs(text, x, y, font='HelveticaNeue-Roman', size=5.0, w=None, d=(1.0, 0.0), color='#231f20'):
    w = w if w is not None else 0.5 * size * len(text)
    return {'text': text, 'size': size, 'font': font, 'color': color, 'dir': list(d), 'bbox': [x, y, x + w, y + size]}


class Glue(unittest.TestCase):
    """places.glue_spans: 흐름 순서로 맞닿은 조각을 하나로(글꼴이 바뀐 낱자 ş·ă, 한 글자씩 기울여 놓은 산 높이)."""
    PATCH = {'font': '^(HelveticaNeue-Roman|MicrosoftSansSerif)$', 'color': '#231f20', 'require': '^MicrosoftSansSerif$',
             'map': {'㏇': 'ă'}, 'maxGapEm': 0.5}
    DIGITS = {'font': '^DINPro-Regular$', 'color': '#231f20', 'textRe': '^[0-9]$', 'maxGapEm': 0.5}

    def test_patch_glyphs_are_glued_and_mapped(self):
        spans = [_gs('Chi', 517.1, 452, w=8.1), _gs('ş', 524.1, 452, font='MicrosoftSansSerif', w=3.5),
                 _gs('in', 526.4, 452, w=4.7), _gs('㏇', 530.0, 452, font='MicrosoftSansSerif', w=3.7), _gs('u', 532.6, 452, w=3.7)]
        out = PL.glue_spans(spans, [self.PATCH])
        self.assertEqual([(s['text'], s['font']) for s in out], [('Chişinău', 'HelveticaNeue-Roman')])
        self.assertEqual(out[0]['bbox'], [517.1, 452, 536.3, 457.0])

    def test_run_without_required_font_is_left_alone(self):
        # 맞닿은 영문 두 조각이라도 바꿀 낱자(require)가 없으면 그대로 — 남의 이름을 잇지 않는다
        spans = [_gs('Bucure', 486.8, 483, w=15.9), _gs('Sofia', 503.0, 483, w=11)]
        self.assertEqual([s['text'] for s in PL.glue_spans(spans, [self.PATCH])], ['Bucure', 'Sofia'])

    def test_far_or_other_style_breaks_run(self):
        spans = [_gs('Chi', 0, 0, w=8), _gs('ş', 30, 0, font='MicrosoftSansSerif', w=3.5), _gs('x', 33.6, 0, color='#ed1064', w=2)]
        self.assertEqual([s['text'] for s in PL.glue_spans(spans, [self.PATCH])], ['Chi', 'ş', 'x'])

    def test_rotated_digits_become_one_elevation(self):
        d = (0.77, -0.63)
        spans = [_gs(c, 675.2 + 2.33 * i, 41.3 - 1.9 * i, font='DINPro-Regular', size=6.0, w=6.2, d=d) for i, c in enumerate('1895')]
        spans.append(_gs('˚E', 652.1, 13.1, font='DINPro-Regular', size=6.0, w=9.3))
        out = PL.glue_spans(spans, [self.DIGITS])
        self.assertEqual([s['text'] for s in out], ['1895', '˚E'])

    def test_no_rules_is_identity(self):
        spans = [_gs('a', 0, 0), _gs('b', 2.5, 0)]
        self.assertIs(PL.glue_spans(spans, []), spans)


class Pair(unittest.TestCase):
    """assign.pair: 덩어리마다 최적 짝(헝가리안). 짝 없음 = miss(item) 비용, 안 되는 쌍은 아주 큰 비용."""
    def test_optimal_beats_greedy(self):
        # 선전·홍콩: 탐욕(가까운 것부터)이면 선전–2(2.3) 다음 홍콩–1(8.9) = 11.2, 최적은 선전–1 + 홍콩–2 = 6.3
        C = {('선전', 1): 2.6, ('선전', 2): 2.3, ('홍콩', 1): 8.9, ('홍콩', 2): 3.7}
        items, targets = ['선전', '홍콩'], [1, 2]
        pr = assign.pair(items, targets, lambda a, b: C[a, b], lambda a, b: True)
        self.assertEqual({items[i]: targets[j] for i, j in pr.items()}, {'선전': 1, '홍콩': 2})

    def test_large_component_is_optimal(self):
        # 12개가 사슬로 이어진 덩어리: i → i+1(0.9) 를 탐욕으로 고르면 마지막 하나가 짝을 잃는다. 최적은 모두 i → i(1.0)
        n = 12
        cost = lambda a, b: 1.0 if b == a else 0.9 if b == a + 1 else None
        pr = assign.pair(list(range(n)), list(range(n)), lambda a, b: cost(a, b), lambda a, b: cost(a, b) is not None,
                      miss=lambda a: 5.0)
        self.assertEqual(pr, {i: i for i in range(n)})

    def test_miss_cheaper_than_pairing(self):
        pr = assign.pair(['a', 'b'], ['x'], lambda a, b: {'a': 10.0, 'b': 1.0}[a], lambda a, b: True, miss=lambda a: 5.0)
        self.assertEqual(pr, {1: 0})
        pr = assign.pair(['a'], ['x'], lambda a, b: 10.0, lambda a, b: True, miss=lambda a: 5.0)
        self.assertEqual(pr, {})

    def test_infeasible_pairs_never_used(self):
        pr = assign.pair(['a', 'b'], ['x'], lambda a, b: 0.0, lambda a, b: a == 'b')
        self.assertEqual(pr, {1: 0})


class IndexRows(unittest.TestCase):
    def test_rows_from_spans(self):
        S = lambda t, f, x0: {'text': t, 'font': f, 'size': 6.7, 'bbox': [x0, 100, x0 + 10, 107]}
        spans = [S('가오슝', 'YDVYGOStd33', 45), S('16K7, 18C3', 'DINPro-Regular', 63),
                 S('고비', 'YDVYGOStd33', 45), S('사막', 'YDVYGOStd33', 58), S('08G3, 18B1', 'DINPro-Regular', 70),
                 S('서울', 'YDVYGOStd33', 45), S('(', 'YDVYGOStd32', 57), S('Seoul', 'DINPro-Regular', 59),
                 S(')', 'YDVYGOStd32', 76), S('08I4, 18D2, 16K6', 'DINPro-Regular', 85)]
        rows = PL.index_rows(spans)
        self.assertEqual([(r['name'], r['page'], r['grid']) for r in rows if r['name'] == '가오슝'], [('가오슝', 16, 'K7'), ('가오슝', 18, 'C3')])
        self.assertIn(('고비 사막', 8, 'G3'), [(r['name'], r['page'], r['grid']) for r in rows])
        seoul = [r for r in rows if r['name'] == '서울']
        self.assertEqual(len(seoul), 3)
        self.assertEqual(seoul[0]['en'], 'Seoul')


@NEED_PDF
class Pdf(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = PL.parse_index()
        cls.p16 = PL.extract('p16-asia')
        cls.by = {}
        for L in cls.p16['labels']: cls.by.setdefault(L['name'], L)

    def test_index_parsed(self):
        self.assertGreater(len(self.index), 1500)
        refs = {(r['page'], r['grid']) for r in self.index if r['name'] == '가오슝'}
        self.assertEqual(refs, {(16, 'K7'), (18, 'C3')})
        for r in self.index:
            self.assertRegex(r['grid'], r'^[A-Z]\d{1,2}$', r)
            self.assertTrue(r['name'] and not r['name'].startswith('('), r)

    def test_curved_and_letter_spaced_labels(self):
        for name, kind in [('우랄산맥', 'mountain'), ('카자흐초원', 'plain'), ('인도양', 'sea'), ('고비사막', 'desert'),
                           ('수마트라섬', 'island'), ('중국', 'country')]:
            with self.subTest(name=name):
                self.assertIn(name, self.by)
                self.assertEqual(self.by[name]['kind'], kind)

    def test_point_flag(self):
        self.assertTrue(self.by['서울']['point'])
        self.assertFalse(self.by['우랄산맥']['point'])

    def test_capital_has_symbol_and_latin_name(self):
        s = self.by['서울']
        self.assertEqual(s['kind'], 'capital')
        self.assertEqual(s['en'], 'Seoul')
        self.assertEqual(s['symbol']['cls'], 'capital')
        self.assertEqual(self.by['중국'].get('en'), 'CHINA')
        self.assertEqual(self.by['인도양'].get('en'), 'INDIAN OCEAN')

    def test_mountain_symbol(self):
        self.assertEqual(self.by['백두산']['kind'], 'mountain')
        self.assertEqual(self.by['백두산']['symbol']['cls'], 'mountain')
        self.assertEqual(self.by['백두산']['elev'], 2744)
        self.assertEqual(self.by['고드윈 오스턴산']['elev'], 8611)       # 두 줄 지명 + (K2) 병기

    def test_rivers_and_multiline_countries(self):
        for name, kind in [('유프라테스강', 'river'), ('예니세이강', 'river'), ('보스니아 헤르체고비나', 'country'),
                           ('벨기에', 'country'), ('독일', 'country'), ('만리장성', 'other')]:
            with self.subTest(name=name):
                self.assertEqual(self.by[name]['kind'], kind)

    def test_no_furniture(self):
        bad = re.compile(PL.places_config()['leakRe'])
        for L in self.p16['labels']:
            self.assertNotRegex(L['name'], bad)
        self.assertNotIn('아시아', self.by)       # 제목 상자
        self.assertNotIn('육지높이', self.by)


if __name__ == '__main__':
    unittest.main()
