# © 2026 김용현
# scripts/atlas/tests/test_pdfkit.py
import copy, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit

HAS_PDF = os.path.exists(pdfkit.pdf_path())
NEED_PDF = unittest.skipUnless(HAS_PDF, f'사회과부도 PDF 없음({pdfkit.pdf_path()}) — ATLAS_PDF 로 경로 지정')


class Dec(unittest.TestCase):
    """PDF 에서 그대로 떠 온 날 글자(CID 코드) → 기대 복원값."""
    FIXTURES = [
        ('ࡂ하', '빙하'),                                   # p16 육지 높이 범례
        ('ਭ지 ֫이', '육지 높이'),                  # p16, 사이 공백은 PyMuPDF 가 넣은 U+0020
        ('ਘ\x01ಣӐ\x01기온җ\x01강수량', '월 평균 기온과 강수량'),  # p21, CID 1 = 공백
        ('żżㅅŮŬ', 'ㅇㅇㅅㄹㄷ'),            # p4 초성 힌트: 같은 묶음의 ToUnicode 'ㅅ' 이 CID 378 → 자모는 358부터
        ('ਬ교hب교', '유교·도교'),                  # p22, CID 104 = ·
        ('ݺ\x10ɞ\r', '명/㎢,'),                            # p23, CID 606 = ㎢
        ('ݺ\x10LN͋', '명/km²'),                            # p23, CID 76·78 = k·m, CID 843 = ²
        ('|ా҅ ೩٘࠘}', '「통계 핸드북」'),       # p24, CID 124·125 = 「」
        ('%\x0f$\x0f', 'D.C.'),                                      # p5 워싱턴 D.C. (라틴 CID)
    ]

    def test_fixtures(self):
        for raw, want in self.FIXTURES:
            with self.subTest(want=want):
                self.assertEqual(pdfkit.dec(raw), want)

    def test_cid_table_known_symbols(self):
        self.assertEqual(pdfkit.cid_char(141), '℃')
        self.assertEqual(pdfkit.cid_char(138), '°')
        self.assertEqual(pdfkit.cid_char(1086), '가')
        self.assertEqual(pdfkit.cid_char(0), '?')


@NEED_PDF
class Spans(unittest.TestCase):
    def texts(self, p):
        return [s['text'] for s in pdfkit.merge_spans(pdfkit.page_spans(p))]

    def has(self, p, needle):
        return any(needle in t for t in self.texts(p))

    def test_page16_has_asia_names(self):
        for name in ['베이징', '도쿄', '뉴델리']:
            self.assertTrue(self.has(16, name), name)

    def test_symbols_decoded_per_glyph(self):
        self.assertTrue(self.has(22, '유교·도교'))
        self.assertTrue(self.has(24, '연료·전력'))
        self.assertTrue(self.has(23, '명/㎢'))
        self.assertTrue(self.has(24, '「통계 핸드북」'))
        self.assertTrue(self.has(21, '°C'))
        self.assertTrue(self.has(5, 'D.C.'))

    def test_real_unicode_kept(self):
        # (K2) 는 ToUnicode 가 있는 진짜 글자 — CID 로 다시 풀면 안 된다
        self.assertTrue(self.has(16, '(K2)'))
        self.assertTrue(self.has(23, '(%)'))
        self.assertTrue(self.has(16, '110˚E'))

    def test_span_shape(self):
        s = pdfkit.page_spans(16)[0]
        self.assertEqual(set(s) >= {'text', 'size', 'font', 'bbox'}, True)
        self.assertEqual(len(s['bbox']), 4)


def S(text, x0, y0, x1, size=9.0, y1=None):
    return {'text': text, 'bbox': [x0, y0, x1, y0 + size if y1 is None else y1], 'size': size}


class Merge(unittest.TestCase):
    def test_merge_split_label(self):
        parts = [S('히', 0, 0, 10), S('말라야', 10.5, 0, 40)]
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], '히말라야')

    def test_letter_spaced_hangul(self):
        parts = [S('고', 0, 0, 9), S('비', 13, 0, 22), S('사', 26, 0, 35), S('막', 39, 0, 48)]  # 4pt < 0.6em
        self.assertEqual([s['text'] for s in pdfkit.merge_spans(parts)], ['고비사막'])

    def test_too_wide_gap_no_merge(self):
        parts = [S('서울', 0, 0, 18), S('부산', 18 + 9 * 0.6 + 0.5, 0, 60)]
        self.assertEqual(len(pdfkit.merge_spans(parts)), 2)

    def test_gap_em_parameter(self):
        parts = [S('서울', 0, 0, 18), S('부산', 18 + 9 * 0.6 + 0.5, 0, 60)]
        self.assertEqual(len(pdfkit.merge_spans(parts, gap_em=1.0)), 1)

    def test_different_sizes_no_merge(self):
        parts = [S('중', 0, 0, 9, size=9), S('국', 9.5, 0, 21, size=12)]
        self.assertEqual(len(pdfkit.merge_spans(parts)), 2)

    def test_different_lines_no_merge(self):
        parts = [S('베이', 0, 0, 18), S('징', 18.5, 9, 27)]  # 한 줄 아래(y 차 = 1em)
        self.assertEqual(len(pdfkit.merge_spans(parts)), 2)

    def test_slight_baseline_jitter_merges(self):
        parts = [S('도', 0, 0, 9), S('쿄', 9.5, 1.5, 18.5)]  # 0.17em 어긋남
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], '도쿄')

    def test_overlapping_merges(self):
        parts = [S('타이', 0, 0, 18), S('베이', 16, 0, 34)]  # dx = -2 > -0.3em
        out = pdfkit.merge_spans(parts)
        self.assertEqual(out[0]['text'], '타이베이')
        self.assertEqual(out[0]['bbox'], [0, 0, 34, 9])

    def test_too_much_overlap_no_merge(self):
        parts = [S('가', 0, 0, 18), S('나', 12, 0, 30)]  # dx = -6 < -0.3em
        self.assertEqual(len(pdfkit.merge_spans(parts)), 2)

    def test_unsorted_input(self):
        parts = [S('라야', 20.5, 0, 38), S('히', 0, 0, 10), S('말', 10.5, 0, 20)]
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], '히말라야')

    def test_lines_sorted_with_unrounded_y(self):
        # 위 줄 조각들이 y=99.6/100.4 로 갈려도 한 줄로 묶이고, 아래 줄은 따로
        parts = [S('아래', 0, 120, 18), S('위', 10, 100.4, 19), S('윗', 0, 99.6, 9.5)]
        self.assertEqual([s['text'] for s in pdfkit.merge_spans(parts)], ['윗위', '아래'])

    def test_input_not_mutated(self):
        parts = [S('히', 0, 0, 10), S('말라야', 10.5, 0, 40)]
        before = copy.deepcopy(parts)
        pdfkit.merge_spans(parts)
        self.assertEqual(parts, before)

    def test_latin_join_with_space(self):
        parts = [S('New', 0, 0, 16), S('Delhi', 18.5, 0, 38)]  # 2.5pt = 0.28em
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], 'New Delhi')

    def test_latin_kerning_no_space(self):
        parts = [S('Bei', 0, 0, 14), S('jing', 14.3, 0, 32)]
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], 'Beijing')


@NEED_PDF
class Render(unittest.TestCase):
    def test_size_and_dpi(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, 'a.png')
            w, h, dpi = pdfkit.render_clip(16, [100, 100, 244, 172], 144, out)
            self.assertEqual(dpi, 144)
            self.assertAlmostEqual(w, 288, delta=2)
            self.assertAlmostEqual(h, 144, delta=2)
            self.assertTrue(os.path.getsize(out) > 0)

    def test_fractional_dpi(self):
        with tempfile.TemporaryDirectory() as d:
            w, h, dpi = pdfkit.render_clip(16, [0, 0, 72, 72], 100.4, os.path.join(d, 'b.png'))
            self.assertEqual(dpi, 100)
            self.assertAlmostEqual(w, 100, delta=1)

    def test_images_only_runs(self):
        with tempfile.TemporaryDirectory() as d:
            w, h, dpi = pdfkit.render_clip(23, [36, 90, 245, 288], 50, os.path.join(d, 'c.png'), images_only=True)
            self.assertAlmostEqual(w, 209 * 50 / 72, delta=2)


@NEED_PDF
class BoxText(unittest.TestCase):
    """box_text: 영역 안 글자를 쪽 흐름 그대로(원문 공백 유지, 줄바꿈에 공백을 지어내지 않음) 잇는다."""
    def test_wrapped_paragraph_verbatim(self):
        # 20쪽 사진 1 설명: '이 / 르는' 처럼 낱말 가운데서 줄이 바뀌어도 원문대로 '이르는'
        t = pdfkit.box_text(20, [565, 204, 745, 238])
        self.assertEqual(t, '시베리아는 러시아의 우랄산맥에서 태평양 연안에 이르는 지역으로, 석유와 천연가스, 철, 금 등의 지하자원이 풍부하다.')

    def test_run_split_across_line_glued(self):
        # 20쪽 사진 3: 글자 묶음이 '…조' / '산대가…' 로 갈려 줄이 바뀐다 → '조산대'
        t = pdfkit.box_text(20, [565, 506, 745, 536])
        self.assertIn('알프스-히말라야 조산대가 만나는 곳', t)

    def test_number_runs_inline(self):
        # 20쪽 사진 5·6: 숫자는 다른 글꼴 묶음 — 원문 공백만 남는다
        self.assertIn('총 26개의 고리 모양', pdfkit.box_text(20, [208, 654, 385, 685]))
        self.assertIn('약 6,100m로', pdfkit.box_text(20, [388, 654, 562, 685]))

    def test_forced_break_in_centered_label(self):
        # 22쪽 싱가포르 공휴일 꼬리표(가운데 정렬): 다른 줄의 묶음 사이는 공백. 단 '(라마단의' / '끝을 기념)' 처럼
        # 한 묶음 안에서 두 줄 너비가 거의 같으면 기하로는 가를 수 없다 → 사진 설정의 captionOverride 로 바로잡는다
        self.assertTrue(pdfkit.box_text(22, [272, 510, 316, 531]).startswith('하리 라야 푸아사 (라마단의'))

    def test_space_between_number_runs(self):
        # 22쪽 공휴일 날짜: '5' '월' '12' '일' 이 따로 묶음 — 월 뒤 낱말 사이(약 0.22em)는 공백
        self.assertEqual(pdfkit.box_text(22, [388, 499, 432, 511]), '5월 12일')

    def test_title_stripped(self):
        self.assertEqual(pdfkit.box_text(20, [576, 195, 700, 205]), '서시베리아 평원')

    def test_empty_box(self):
        self.assertEqual(pdfkit.box_text(20, [0, 0, 1, 1]), '')

    def test_runs_have_style(self):
        r = pdfkit.text_runs(20, [565, 194, 745, 238])
        self.assertTrue(all({'text', 'font', 'size', 'color', 'bbox'} <= set(x) for x in r))
        self.assertGreaterEqual(len(r), 2)


class PdfPath(unittest.TestCase):
    def test_env_override_missing_file(self):
        old = os.environ.get('ATLAS_PDF')
        os.environ['ATLAS_PDF'] = os.path.join(tempfile.gettempdir(), 'no-such-atlas.pdf')
        try:
            with self.assertRaises(FileNotFoundError) as cm:
                pdfkit.doc()
            self.assertIn('ATLAS_PDF', str(cm.exception))
        finally:
            if old is None: os.environ.pop('ATLAS_PDF')
            else: os.environ['ATLAS_PDF'] = old


if __name__ == '__main__': unittest.main()
