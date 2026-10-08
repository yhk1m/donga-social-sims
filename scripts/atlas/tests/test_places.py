# © 2026 김용현
# scripts/atlas/tests/test_places.py — 일반도 지명 뽑기(places.py)·찾아보기 파싱 검사
import os, re, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import places as PL

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
