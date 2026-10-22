# © 2026 김용현
# scripts/atlas/tests/test_text_u6.py — U6-8 오세아니아·극지방 주제 글(content/atlas/u6/topics.json)이 PDF 원문 그대로인지, 출처 목록·49쪽 글자 수 검사
# atlas_common 은 import 할 때 단원을 고르므로(u2 기본) u6 글 대조는 서브프로세스로 extract_text.py --unit u6 --check 를 돌린다.
import json, os, subprocess, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import pdfkit
import extract_text as ET
import atlas_common as A

NEED_PDF = unittest.skipUnless(os.path.exists(pdfkit.pdf_path()), f'사회과부도 PDF 없음({pdfkit.pdf_path()})')
HERE = os.path.dirname(os.path.abspath(__file__))
U6 = os.path.join(HERE, '..', 'config', 'u6.json')


def u6_content():
    with open(U6, encoding='utf-8') as f: return json.load(f)['content']


def run_u6(*args):
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
    env.pop('ATLAS_UNIT_CONFIG', None)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'extract_text.py'), '--unit', 'u6', *args],
                          cwd=A.REPO, capture_output=True, text=True, encoding='utf-8', env=env, timeout=300)


class Files(unittest.TestCase):
    def test_dumps_matches_committed_files(self):
        # u6 원본 파일도 dumps 형식 그대로(--fill 로 다시 써도 바이트가 같음)
        c = u6_content()
        for k in ('topics', 'overrides'):
            p = ET.repo_path(c[k])
            with open(p, encoding='utf-8', newline='') as f: self.assertEqual(f.read(), ET.dumps(ET.read_json(p)) + '\n', k)

    def test_no_handwritten_text(self):
        # 글 칸(text·title·label·credit·note·legendTitle…)은 모두 출처 상자에서 — 손으로 적은 것은 블록 제목 「학습 목표」와 주제 제목(목차)뿐.
        # 깨진 곡선·두 줄 글(48쪽 윤곽 안내·55쪽 기지 제목·본문)·묶음 이름·잰 값 그래프 주석은 overrides.json(from + 까닭)에만.
        doc = ET.read_json(ET.repo_path(u6_content()['topics']))
        loose = []
        for path, o in ET.walk(doc):
            filled = {tk for _, tk in ET.src_fields(o)}
            for k in ('text', 'title', 'label', 'credit', 'note', 'legendTitle', 'lineLegendTitle'):
                if k not in o or k in filled: continue
                if k == 'title' and ('.' not in path or (o.get('role') == 'goal' and o[k] == '학습 목표')): continue
                loose.append(f'{path}.{k}')
        self.assertEqual(loose, [])

    def test_activity_and_page_blocks(self):
        # 활동하기 1~4(52·53·54·55쪽 — 제목 상자 + 문항 상자), 주제도 활동(55쪽 — role theme), 원본 쪽 부분 보기 = 54쪽 해양 쓰레기 삽화·해수면 그림 그래프,
        # 55쪽 아라온호 지구본·주제도 활동 상자(1단계 「편집 디자인」 기본값)
        doc = {t['id']: t for t in ET.read_json(ET.repo_path(u6_content()['topics']))}
        acts = {tid: [b for b in t['blocks'] if b['type'] == 'activity' and b.get('role') != 'theme'] for tid, t in doc.items()}
        for tid in ('relief', 'climate', 'environment', 'antarcticResearch'):
            self.assertEqual(len(acts[tid]), 1, tid)
            self.assertIn('titleSrc', acts[tid][0]); self.assertIn('src', acts[tid][0])
        theme = [b for b in doc['antarcticResearch']['blocks'] if b.get('role') == 'theme']
        self.assertEqual(len(theme), 1); self.assertIn('titleSrc', theme[0])
        parts = [(tid, b['page'], b['bbox']) for tid, t in doc.items() for b in t['blocks'] if b['type'] == 'page' and 'bbox' in b]
        self.assertEqual(parts, [('environment', 54, [30, 293, 382, 506]), ('environment', 54, [567, 424, 737, 531]),
                                 ('antarcticResearch', 55, [519, 284, 757, 408]), ('antarcticResearch', 55, [30, 487, 758, 693])])
        self.assertEqual([t['title'] for t in doc.values()], ['일반도', '색칠하기', '북극', '남극', '지형', '기후', '상호 교류', '환경 문제', '북극의 지리적 중요성', '남극의 지리적 중요성과 극지 연구'])

    def test_overrides_from_match_topics(self):
        # overrides 의 from 이 지금 topics.json 값과 같음(build_content 「낡은 고침」 검사와 같은 뜻 — 원문 추출이 바뀌면 여기서 먼저 멈춤)
        c = u6_content()
        doc = {t['id']: t for t in ET.read_json(ET.repo_path(c['topics']))}
        items = ET.read_json(ET.repo_path(c['overrides']))['items']
        for k, o in items.items():
            tid, kind, *rest = k.split('.')
            if kind == 'blocks': obj = next(b for b in doc[tid]['blocks'] if b['id'] == rest[0])
            elif kind == 'views': obj = next(v for v in doc[tid]['views'] if v['id'] == rest[0])
            elif kind == 'layers':
                ref = '.'.join(rest[:-1]); obj = next(l for l in doc[tid]['layers'] if l['ref'] == ref); rest = [ref, rest[-1]]
            else: self.fail(k)
            self.assertEqual(obj.get(rest[-1]), o['from'], k)


@NEED_PDF
class ContentMatchesPdf(unittest.TestCase):
    def test_topics_text_is_verbatim(self):
        r = run_u6('--check')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('경고 없음', r.stdout)

    def test_expected_credits_match_pdf(self):
        exp = u6_content()['expectCredits']
        skip = {''.join(c.split()) for c in exp['notCredits']}
        not_printed = {''.join(c.split()) for c in exp.get('notPrinted', [])}
        for p in range(48, 56):
            found = [c for c in ET.printed_credits(p) if c not in skip]
            want = [''.join(c.split()) for c in exp.get(str(p), []) if ''.join(c.split()) not in not_printed]
            self.assertEqual(sorted(found), sorted(want), f'{p}쪽')

    def test_p49_labels(self):
        # 49쪽 보이는 나라 글자 11(KCCChassam 8.8pt — 이름 「미크로네시아」 1 + 초성 10) · 손글씨 수도 11(7.5pt — 캔버라·웰링턴·포트모르즈비는 이름 칸 빔).
        # 큰 초성 셋(ㅇㅅㅌㄹㅇㄹㅇ·ㅍㅍㅇ ㄴㄱ·ㄴㅈㄹㄷ, 12.8pt)은 윤곽 도형 + 투명 글자(alpha 0)라 page_spans 에 없음 → 설정 extraCountries(AUS·PNG·NZL).
        # 같은 손글씨 글꼴의 활동 글(9pt)·글머리 ●(5pt)는 크기로 빠짐
        c = u6_content()['coloring']
        spans = pdfkit.page_spans(c['page'])
        countries = [s['text'] for s in spans if c['countryFont'] in s['font']]
        capitals = [s['text'] for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) < 0.2]
        self.assertEqual(len(countries), 11)
        self.assertEqual(sorted({round(s['size'], 1) for s in spans if c['countryFont'] in s['font']}), [8.8])
        self.assertEqual(len(capitals), 11)
        self.assertIn('미크로네시아', countries)
        self.assertFalse(any(t in capitals for t in ('캔버라', '웰링턴', '포트모르즈비')))
        hand = [s for s in spans if c['capitalFont'] in s['font'] and abs(s['size'] - c['capitalSize']) >= 0.2]
        self.assertEqual(sorted(round(s['size']) for s in hand), [5, 9])
        # 투명 큰 초성: get_text 에는 있고(alpha 0) page_spans 에는 없음
        d = pdfkit.doc()[c['page'] - 1].get_text('dict')
        big = [s for b in d['blocks'] for l in b.get('lines', []) for s in l['spans'] if c['countryFont'] in s['font'] and s['size'] > 12]
        self.assertTrue(big); self.assertTrue(all(s.get('alpha', 255) == 0 for s in big))
        self.assertEqual(sorted(u6_content()['coloring']['extraCountries']), ['AUS', 'NZL', 'PNG'])


if __name__ == '__main__':
    unittest.main()
