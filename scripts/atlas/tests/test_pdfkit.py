# scripts/atlas/tests/test_pdfkit.py
import unittest, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit

class T(unittest.TestCase):
    def test_decode_known_label(self):
        # 조사에서 확인: 깨진 '광주광역시' 와 같은 코드 → 복원
        self.assertEqual(pdfkit.dec(pdfkit.enc('광주광역시')), '광주광역시')
    def test_page16_has_asia_names(self):
        spans = pdfkit.page_spans(16)
        texts = {s['text'] for s in spans}
        for name in ['베이징', '도쿄', '뉴델리']:
            self.assertTrue(any(name in t for t in texts), name)
    def test_merge_split_label(self):
        parts = [{'text':'히','bbox':[0,0,10,10],'size':9},{'text':'말라야','bbox':[10.5,0,40,10],'size':9}]
        self.assertEqual(pdfkit.merge_spans(parts)[0]['text'], '히말라야')

if __name__ == '__main__': unittest.main()
