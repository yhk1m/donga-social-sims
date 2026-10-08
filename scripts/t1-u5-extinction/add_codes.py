# © 2026 김용현
# 행정동 경계에 시군구 코드(일반구 → 시로 묶음)와 시도 코드를 붙인다.
# 사용: python -I add_codes.py raw/HangJeongDong.geojson pop.json raw/dong_coded.geojson
import json, sys
g = json.load(open(sys.argv[1], encoding='utf-8'))
pc = {x['code'] for x in json.load(open(sys.argv[2], encoding='utf-8'))['items']}
for f in g['features']:
    p = f['properties']; c = p['sgg']
    c = c if c in pc else c[:4] + '0'
    assert c in pc, c
    f['properties'] = {'code': c, 'sido': p['sido']}
json.dump(g, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
