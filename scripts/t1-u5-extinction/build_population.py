# © 2026 김용현
# 행정안전부 주민등록 연령별 인구현황(시군구, 5세, 성별) CSV → 시군구별 지방소멸위험지수
# 사용: python -I build_population.py raw/jumin_age5_sgg_YYYYMM.csv out.json
import csv, json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

def classify(v):
    if v >= 1.5: return 4
    if v >= 1.0: return 3
    if v >= 0.5: return 2
    if v >= 0.2: return 1
    return 0

def load(path):
    with open(path, encoding='cp949', newline='') as f:
        rows = list(csv.reader(f))
    head = rows[0]
    def col(sex, age):
        for i, h in enumerate(head):
            if h.endswith(f'_{sex}_{age}'): return i
        raise KeyError((sex, age))
    f20 = [col('여', a) for a in ('20~24세', '25~29세', '30~34세', '35~39세')]
    o65 = [col('계', a) for a in ('65~69세', '70~74세', '75~79세', '80~84세', '85~89세', '90~94세', '95~99세', '100세 이상')]
    tot = col('계', '총인구수')
    month = re.match(r'(\d{4})년(\d{2})월', head[1]).groups()
    recs = []
    for r in rows[1:]:
        m = re.match(r'(.*?)\s*\((\d{10})\)$', r[0].strip())
        name, code = m.group(1).strip(), m.group(2)
        num = lambda i: int(r[i].replace(',', ''))
        recs.append(dict(name=re.sub(r'\s+', ' ', name), code=code,
                         total=num(tot), f2039=sum(num(i) for i in f20), o65=sum(num(i) for i in o65)))
    return '-'.join(month), recs

def sigungu(recs):
    """소멸위험 보고서와 같은 228(+α) 시군구 단위: 자치구가 아닌 구는 시로 묶고, 출장소·시도 행은 뺀다."""
    out = []
    codes = {r['code'][:5] for r in recs}
    for r in recs:
        c5 = r['code'][:5]
        if r['code'][2:] == '00000000': continue          # 시도
        if r['total'] == 0: continue                       # 출장소(인구 0)
        if c5[4] != '0' and (c5[:4] + '0') in codes and c5 != '11215' : continue  # 일반구 → 상위 시 행 사용
        out.append(r)
    return out

def sido_index(recs):
    return {r['name']: r['f2039'] / r['o65'] for r in recs if r['code'][2:] == '00000000' and r['total'] > 0}

if __name__ == '__main__':
    month, recs = load(sys.argv[1])
    sgg = sigungu(recs)
    sido = sido_index(recs)
    data = []
    for r in sgg:
        parts = r['name'].split(' ')
        sidonm = parts[0]
        sggnm = ' '.join(parts[1:]) or sidonm   # 세종
        idx = r['f2039'] / r['o65']
        data.append(dict(code=r['code'][:5], sido=sidonm, name=sggnm, pop=r['total'],
                         f2039=r['f2039'], o65=r['o65'], index=round(idx, 4), cls=classify(idx)))
    json.dump(dict(month=month, items=data, sido={k: round(v, 4) for k, v in sido.items()}),
              open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(month, len(data), 'sigungu')
    from collections import Counter
    print(Counter(d['cls'] for d in data))
    print('risk(<0.5):', sum(d['index'] < 0.5 for d in data), ' high(<0.2):', sum(d['index'] < 0.2 for d in data))
    for d in sorted(data, key=lambda d: d['index'])[:12]: print(d['sido'], d['name'], d['index'])
    for k, v in sido.items(): print(k, round(v, 3))
