// © 2026 김용현
// scripts/atlas/compare_known.mjs — 대조표 checks.known 맞춤(순수 함수, compare.mjs 에서 씀 — 시험 tests/atlas/compareKnown.test.mjs)
//   known 항목 {topic, map?, item, tb?, web?, webIncludes?, pct?, note}: 「다름」 줄 중 항목 이름과 tb·web(같음)·webIncludes(글 조각)가
//   모두 맞을 때만 「알려진 차이」로. pct(U4-10) = 그 줄의 글 일치율 % 를 고정 — webIncludes 바로 뒤(없으면 웹 글 처음)의 첫 「n%」가
//   pct 와 같아야 맞음. 글 조각만 맞추면 92% 가 80% 로 떨어져도 「알려진 차이」로 남던 구멍(유럽 U3-10 리뷰)을 막는다.

/** 웹 글에서 글 조각(at) 바로 뒤의 첫 퍼센트 수(없으면 null). at 이 없으면 글 처음부터. */
export function pctAfter(web, at) {
  const s = String(web ?? '');
  const i = at == null ? 0 : s.indexOf(at);
  if (i < 0) return null;
  const m = /(\d+(?:\.\d+)?)%/.exec(s.slice(i + (at ? at.length : 0)));
  return m ? Number(m[1]) : null;
}

/** 확인 줄 c 가 known 항목 k 에 맞는가 → {hit, pctNow?, pctMismatch?}. pct 는 나머지 조건이 모두 맞을 때만 본다. */
export function knownMatch(c, k) {
  const base = c.status === 'diff' && c.item === k.item
    && (k.tb == null || String(c.tb) === String(k.tb))
    && (k.web == null || String(c.web) === String(k.web))
    && (k.webIncludes == null || String(c.web).includes(k.webIncludes));
  if (!base) return { hit: false };
  if (k.pct == null) return { hit: true };
  const pctNow = pctAfter(c.web, k.webIncludes);
  if (pctNow === Number(k.pct)) return { hit: true, pctNow };
  return { hit: false, pctNow, pctMismatch: true };
}
