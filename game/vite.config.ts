import { defineConfig } from 'vitest/config';

// ローカル確認専用。ブラウザを自動で開かない（open: false）。
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, open: false },
  preview: { host: '127.0.0.1', port: 4173, open: false },
  build: {
    target: 'es2022', sourcemap: false,
    rollupOptions: { input: { game: 'index.html', editor: 'editor.html', editorPreview: 'editor-preview.html', openingPreview: 'opening-preview.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
