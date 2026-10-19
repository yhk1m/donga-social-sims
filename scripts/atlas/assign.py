# © 2026 김용현
# scripts/atlas/assign.py — 일대일 짝 맞추기(헝가리안 최소 비용 배정). 아틀라스 Python 단계 공용(places 지명↔기호, 사진↔지도 핀).
#   pair(items, targets, cost, ok, miss) → {item 번호: target 번호}
#   hungarian(C)                         직사각 비용 행렬(행 ≤ 열) → 행마다 고른 열
import math

BIG = 1e9        # 안 되는 쌍의 비용(헝가리안 행렬)


def hungarian(C):
    """직사각 비용 행렬(행 n ≤ 열 m) 최소 비용 배정(헝가리안, 퍼텐셜 방식 O(n²m)). → 행마다 고른 열 번호."""
    n, m = len(C), len(C[0])
    u, v, p, way = [0.0] * (n + 1), [0.0] * (m + 1), [0] * (m + 1), [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i; j0 = 0
        minv, used = [math.inf] * (m + 1), [False] * (m + 1)
        while True:
            used[j0] = True; i0 = p[j0]; delta = math.inf; j1 = 0
            for j in range(1, m + 1):
                if used[j]: continue
                cur = C[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]: minv[j] = cur; way[j] = j0
                if minv[j] < delta: delta = minv[j]; j1 = j
            for j in range(m + 1):
                if used[j]: u[p[j]] += delta; v[j] -= delta
                else: minv[j] -= delta
            j0 = j1
            if p[j0] == 0: break
        while j0:
            j1 = way[j0]; p[j0] = p[j1]; j0 = j1
    out = [None] * n
    for j in range(1, m + 1):
        if p[j]: out[p[j] - 1] = j - 1
    return out


def pair(items, targets, cost, ok, miss=None):
    """일대일 짝 맞추기: 짝지을 수 있는 쌍(ok)으로 이어진 덩어리마다 비용 합이 가장 작은 배정(헝가리안).
    행 = item, 열 = target + item 마다 「짝 없음」 열(그 item 만 miss(item) 비용), 안 되는 쌍은 BIG.
    가까운 순 탐욕은 남의 기호가 글자에 스칠 때 맞바꿔 짝짓는다(선전·홍콩). → {item 번호: target 번호}"""
    miss = miss or (lambda a: 1e3)
    edges = {i: {j: cost(a, b) for j, b in enumerate(targets) if ok(a, b)} for i, a in enumerate(items)}
    by_t = {}
    for i, e in edges.items():
        for j in e: by_t.setdefault(j, []).append(i)
    seen, out = set(), {}
    for i0 in edges:
        if i0 in seen or not edges[i0]: continue
        rows, st = [], [i0]                                          # 덩어리: 쌍으로 이어진 item 들
        while st:
            i = st.pop()
            if i in seen: continue
            seen.add(i); rows.append(i)
            for j in edges[i]: st.extend(k for k in by_t[j] if k not in seen)
        cols = sorted({j for i in rows for j in edges[i]})
        n, m = len(rows), len(cols)
        C = [[edges[i].get(j, BIG) for j in cols] + [miss(items[i]) if k == r else BIG for k in range(n)] for r, i in enumerate(rows)]
        for r, c in enumerate(hungarian(C)):
            if c is not None and c < m and C[r][c] < BIG: out[rows[r]] = cols[c]
    return out
