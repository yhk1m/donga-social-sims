// tests/atlas/helpers/cssHooks.mjs — Node 로더 훅: renderer.js 의 `import './atlas.css'`(Vite 가 처리하는 것)를 테스트에서 빈 모듈로.
export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  return next(url, context);
}
