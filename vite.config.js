// © 2026 김용현
import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// sims/<id>/index.html 을 모두 빌드 입력으로 자동 등록
const simsDir = resolve(import.meta.dirname, 'sims');
const input = { main: resolve(import.meta.dirname, 'index.html') };
for (const id of readdirSync(simsDir)) {
  const html = resolve(simsDir, id, 'index.html');
  if (!id.startsWith('_') && existsSync(html)) input[id] = html;
}

export default defineConfig({
  build: { rollupOptions: { input } },
});
