# 사회과 인터랙티브 자료

동아출판 2022 개정 사회과 교과서의 쪽별 인터랙티브 자료입니다.

- 전체 목록: https://yhk1m.github.io/donga-social-sims/
- 최신 버전: `/<자료이름>/` (예: `/s1-u1-sunlight/`)
- 버전 고정: `/<자료이름>/<번호>/` (예: `/s1-u1-sunlight/1/`). 한 번 공개한 버전은 바뀌지 않습니다.
- 붙여 넣기용 HTML 조각: `/<자료이름>/<번호>/fragment.html`. 모든 조각은 [EMBED_RULES.md](EMBED_RULES.md)를 지킵니다.

## 작업 흐름

```bash
npm install
npm run dev                                  # 개발 미리보기 (sims/<id>/)
npm run embed -- <id>                        # 조각 빌드 + 규칙 검사 → embed/<id>.html
npm run release -- <id> --note "바뀐 점"     # 새 버전을 docs/<id>/<n>/ 에 고정
git add docs sims src scripts && git commit && git push   # GitHub Pages(main /docs)로 공개
```

새 자료: `src/registry.js`에 한 줄을 추가하고 `sims/_template/`를 `sims/<id>/`로 복사합니다.

## 자료 출처

- 소멸위험지수: 행정안전부 주민등록 인구통계(2026년 9월 말), 경계 vuski/admdongkor(통계청 SGIS, CC BY 4.0)
- 도로 통행 속도: 서울시 교통정보센터(TOPIS) 서울시 차량통행속도(2026년 9월), 국토교통부 표준노드링크, OpenStreetMap(ODbL)
- 세계 지도: Natural Earth (public domain)
