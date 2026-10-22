// tests/atlas/helpers/topicViewGuard.mjs — 주제 보기 레이어(topicView, polarExtra U6-3c)를 쓰는 topics.json 자료 검사(U6-8 이 u6 자료에 씀).
//   topicViewBundleProblems(topics) → 문제 글 목록(빈 목록 = 통과). 규칙(계획 「실행 중 결정」 U6-3c 「쓰는 쪽 주의」):
//   ① topicView 가 주제의 유일한 레이어이거나, 그 묶음(topic.js layerGroups — label 이 같으면 한 묶음, 없으면 ref)에 다른 레이어가 함께 있어야 함
//      (topicView 만 따로 된 label 이면 「지도 고르기」 단추가 하나 더 생김)
//   ② 바로가기(views)가 있는 주제에서 레이어가 topicView 뿐이면 안 됨(topic.js 「바로가기」 줄은 묶음이 없을 때만 그려져 그 줄이 사라짐)
const labelOf = (r) => r.label || r.ref;

export function topicViewBundleProblems(topics) {
  const out = [];
  for (const t of topics || []) {
    const layers = t.layers || [];
    const tvs = layers.filter((r) => r.type === 'topicView');
    if (!tvs.length) continue;
    if (layers.length > 1) {
      for (const tv of tvs) {
        const mates = layers.filter((r) => r !== tv && labelOf(r) === labelOf(tv));
        if (!mates.some((r) => r.type !== 'topicView')) out.push(`${t.id}: topicView ${tv.ref} 가 따로 된 묶음(label 「${labelOf(tv)}」) — 묶음 레이어와 같은 label 로`);
      }
    }
    if (t.views?.length && layers.every((r) => r.type === 'topicView')) out.push(`${t.id}: 바로가기(views ${t.views.length})가 있는데 레이어가 topicView 뿐 — 「바로가기」 줄이 사라짐`);
  }
  return out;
}
