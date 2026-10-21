# © 2026 김용현
# scripts/atlas/tests/test_text_u5.py — U5-8 아메리카 주제 글(content/atlas/u5/topics.json)이 PDF 원문 그대로인지, 출처 목록·41쪽 글자 수 검사
# atlas_common 은 import 할 때 단원을 고르므로(u2 기본) u5 글 대조는 서브프로세스로 extract_text.py --unit u5 --check 를 돌린다.
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
HERE = os.path.dirname(os.path.abspath(__file__))
U5 = os.path.join(HERE, '..', 'config', 'u5.json')


def u5_content():
    with open(U5, encoding='utf-8') as f: return json.load(f)['content']


def run_u5(*args):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    env.pop('ATLAS_UNIT_CONFIG', None)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'extract_text.py'), '--unit', 'u5', *args],
                          cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', env=env, timeout=300)


class Files(unittest.TestCase):
    def test_dumps_matches_committed_files(self):
        # u5 원본 파일도 dumps 형식 그대로(--fill 로 다시 써도 바이트가 같음)
        c = u5_content()
        for k in ('topics', 'overrides'):
            p = ET.repo_path(c[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

    def test_no_handwritten_text(self):
        # 글 칸(text·title·label·credit·note·legendTitle…)은 모두 출처 상자에서 — 손으로 적은 것은 블록 제목 「학습 목표」와 주제 제목(목차)뿐.
        # 곡선 글(42쪽 윤곽 안내·46쪽 지구본 옆 본문)·잰 값 그래프 주석은 overrides.json(from + 까닭)에만.
        doc = ET.read_json(ET.repo_path(u5_content()['topics']))
        loose = []
        for path, o in ET.walk(doc):
            filled = {tk for _, tk in ET.src_fields(o)}
            for k in ('text', 'title', 'label', 'credit', 'note', 'legendTitle', 'lineLegendTitle'):
                if k not in o or k in filled: continue
                if k == 'title' and ('.' not in path or (o.get('role') == 'goal' and o[k] == '학습 목표')): continue
                loose.append(f'{path}.{k}')
        self.assertEqual(loose, [])

    def test_activity_and_page_blocks(self):
        # 활동하기 1·2·3(44·45·46쪽 — 제목 상자 + 문항 상자), 원본 쪽 부분 보기 = 46쪽 지구본·47쪽 만화·A사 그림(1단계 「편집 디자인」 기본값)
        doc = {t['id']: t for t in ET.read_json(ET.repo_path(u5_content()['topics']))}
        acts = {tid: [b for b in t['blocks'] if b['type'] == 'activity'] for tid, t in doc.items()}
        for tid in ('relief', 'climate', 'ethnicity'):
            self.assertEqual(len(acts[tid]), 1, tid)
            self.assertIn('titleSrc', acts[tid][0]); self.assertIn('src', acts[tid][0])
        parts = [(tid, b['page'], b['bbox']) for tid, t in doc.items() for b in t['blocks'] if b['type'] == 'page' and 'bbox' in b]
        self.assertEqual(parts, [('migration', 46, [30, 75, 265, 222]), ('tnc', 47, [44, 95, 389, 305]), ('tnc', 47, [44, 366, 391, 500])])
        self.assertEqual([t['title'] for t in doc.values()], ['일반도', '색칠하기', '북아메리카', '남아메리카', '지형', '기후', '인구 이동과 언어', '민족 구성과 문화 혼종성', '초국적 기업', '지역 변화'])


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        r = run_u5('--check')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('경고 없음', r.stdout)

    def test_expected_credits_match_pdf(self):
        exp = u5_content()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        not_printed = {''.join(c.split()) for c in exp.get('notPrinted', [])}
        for p in range(40, 48):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), []) if ''.join(c.split()) not in not_printed]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_p41_labels(self):
        # 41쪽 나라 글자 39(초성 12.8pt 10 + 8pt 29 — 이름 25·작은 나라 초성 4) = 나라 34 + 지역 2(그린란드(덴)·기아나(프)) + 알래스카(미) 1
        # + 두 줄 이름의 둘째 줄 2, 앤티가 바부다는 이름 칸 없음(교사 Q4 — extraCountries), 수도 손글씨 16조각(7.5pt) = 17 이름(「포르토프랭스 산토도밍고」 한 덩어리),
        # 같은 손글씨 글꼴의 활동 글(9pt)·글머리 ●(5pt)는 크기로 빠짐
        c = u5_content()['coloring']
        spans = pdfkit.page_spans(c['page'])
        countries = [s['text'] for s in spans if c['countryFont'] in s['font']]
        capitals = [s['text'] for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) < 0.2]
        self.assertEqual(len(countries), 39)
        self.assertEqual(sorted(round(s['size'], 1) for s in spans if c['countryFont'] in s['font']).count(12.8), 10)
        self.assertEqual(len(capitals), 16)
        self.assertIn('포르토프랭스 산토도밍고', capitals)
        for t in ('그린란드(덴)', '기아나(프)', '알래스카(미)', '도미니카', '도미니카 공화국'): self.assertIn(t, countries)
        self.assertFalse(any('앤티가' in t for t in countries))
        for pair in c['joinLabels']:
            i = next(k for k in range(len(countries)) if countries[k:k + len(pair)] == pair); self.assertEqual(countries[i:i + len(pair)], pair)
        hand = [s for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) >= 0.2]
        self.assertEqual(sorted(round(s['size']) for s in hand), [5, 9])


if __name__ == '__main__':
    unittest.main()
