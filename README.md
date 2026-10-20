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

### 사회과부도 모음

- 보기 페이지 `/atlas/`(`docs/atlas/index.html`): 공개한 사회과부도 단원 카드 + 페이지 안 iframe 보기(`#<id>`). `release` 가 목록을 갱신할 때마다 `scripts/atlas/hub_page.mjs` 로 함께 다시 만들어지므로 손댈 것이 없습니다.
- 조각 `atlas-hub`: 같은 카드를 붙여 넣기용으로. 빌드 때의 registry·versions.json 이 들어가므로 새 단원을 공개한 뒤 `npm run release -- atlas-hub` 로 한 번 더 공개합니다.
- 주의(2026-10-20): 모음을 넣으며 `src/registry.js` 에 한 줄, `src/shared/dom.js` 에 아이콘 2개를 더해 모든 조각에 이 두 파일이 함께 실린다 — 동작은 그대로지만 조각 글이 수백 바이트(약 400~600 B) 바뀐다. 그래서 `npm run release -- --all` 은 바뀌지 않은 자료까지 새 버전을 만든다. **실제로 고친 자료만 id 를 적어 공개**한다.
- 새 단원 공개 뒤 썸네일: `node scripts/atlas/hub_thumbs.mjs <id>`(공개 Pages 를 찍음, 공개 전이면 `--local`) → `docs/assets/atlas/hub/<id>.webp`.

## 자료 출처

- 소멸위험지수: 행정안전부 주민등록 인구통계(2026년 9월 말), 경계 vuski/admdongkor(통계청 SGIS, CC BY 4.0)
- 도로 통행 속도: 서울시 교통정보센터(TOPIS) 서울시 차량통행속도(2026년 9월), 국토교통부 표준노드링크, OpenStreetMap(ODbL)
- 세계 지도: Natural Earth (public domain)
