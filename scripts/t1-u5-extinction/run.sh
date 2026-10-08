#!/bin/sh
# © 2026 김용현
# 지방 소멸 위험 카토그램 자료 다시 만들기 (app/scripts/t1-u5-extinction 에서 실행)
# 1) 인구: jumin.mois.go.kr 연령별 인구현황 → 전체 시군구현황(xlsStats=2), 5세 단위, 성별, 월간 CSV
YM=${1:-202609}; Y=${YM%??}; M=${YM#????}
mkdir -p raw out
curl -s -c raw/cj.txt https://jumin.mois.go.kr/ageStatMonth.do -o /dev/null
curl -s -b raw/cj.txt -X POST "https://jumin.mois.go.kr/downloadCsvAge.do?searchYearMonth=month&xlsStats=2" \
  --data "sltOrgType=1&sltOrgLvl1=A&sltOrgLvl2=&gender=gender&sum=sum&sltUndefType=&searchYearStart=$Y&searchMonthStart=$M&searchYearEnd=$Y&searchMonthEnd=$M&sltOrderType=1&sltOrderValue=ASC&sltArgTypes=5&sltArgTypeA=0&sltArgTypeB=100&category=month" \
  -o raw/jumin_age5_sgg_$YM.csv
python -I build_population.py raw/jumin_age5_sgg_$YM.csv pop_$YM.json
# 2) 경계: vuski/admdongkor 행정동(SGIS 기반) → 시군구·시도로 합치고 단순화
#    curl -o raw/HangJeongDong_ver20260701.geojson https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
python -I add_codes.py raw/HangJeongDong_ver20260701.geojson pop_$YM.json raw/dong_coded.geojson
npx -y mapshaper@0.6.102 -i raw/dong_coded.geojson name=dong -dissolve2 code + name=sgg -target dong -dissolve2 sido + name=sido \
  -target sgg,sido -simplify 4% weighted keep-shapes -filter-slivers min-area=0.15km2 \
  -o out/korea.topo.json format=topojson quantization=100000 target=sgg,sido
# 3) 투영·경로·육각 돌링 위치 미리 계산
node build_map.mjs out/korea.topo.json pop_$YM.json ../../sims/t1-u5-extinction/data/extinction.json
