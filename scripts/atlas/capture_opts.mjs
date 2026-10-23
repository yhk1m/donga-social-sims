// © 2026 김용현
// scripts/atlas/capture_opts.mjs — 대조표 캡처(compare_shots.mjs)의 단원별 캡처 옵션(U1-G0). 순수 — 시험: tests/atlas/captureOpts.test.mjs
//   단원 대조표 설정 <uN>.compare.json 의 freshSvgLayout(없으면 false — u2~u5 는 지금 캡처 그대로).
//   freshSvgLayout: true = 장면마다 찍기 직전 지도 SVG 의 vector-effect(non-scaling-stroke) 요소를 none → 원래 값으로 바꿔 Chrome 이 그 도형의
//   non-scaling-stroke 경로를 새로 계산하게 함. 까닭(U1-G0 진단): Chrome(Blink)은 그 경로를 앞 화면들(지도 움직임 중간 프레임)에서 계산한 채로 두는 일이
//   있어, DOM·CSS·화면 CTM·캔버스 화소가 모두 같아도 큰 원 기호(남극 우리나라 기지 붉은 점, scale 5~6) 가장자리 6~8화소가 실행마다 ±1~3 달랐다.
//   다시 그리기(visibility)로는 안 바뀌고, 소프트웨어 래스터(--disable-gpu-rasterization)로도 그대로, 다시 계산(이 옵션·display 끄고 켜기)하면
//   네 번 모두 같은 화면(새로 연 쪽과 같음)이 됨 → 앱 자료가 아닌 브라우저 내부 캐시의 이력 의존, 캡처 쪽에서 이력을 지움(화소 허용치 아님).

/** 대조표 설정 → { freshSvgLayout } (잘못된 값이면 throw). */
export function captureOptsOf(cmp) {
  const v = cmp?.freshSvgLayout;
  if (v != null && typeof v !== 'boolean') throw new Error(`freshSvgLayout 은 true/false: ${JSON.stringify(v)}`);
  return { freshSvgLayout: v === true };
}

/** 찍기 직전 페이지에서 돌릴 식(root = 단원 루트 요소 식): non-scaling-stroke 요소의 vector-effect 를 껐다 켜고 두 프레임 기다림 → 바꾼 요소 수 */
export function freshSvgLayoutExpr(root) {
  return `(async()=>{const raf=()=>new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const ps=[...${root}.querySelectorAll('svg [vector-effect]')].map((e)=>[e,e.getAttribute('vector-effect')]).filter(([,v])=>v&&v!=='none');
    if(!ps.length) return 0;
    ps.forEach(([e])=>e.setAttribute('vector-effect','none')); ${root}.getBoundingClientRect(); await raf();
    ps.forEach(([e,v])=>e.setAttribute('vector-effect',v)); ${root}.getBoundingClientRect(); await raf();
    return ps.length;})()`;
}
