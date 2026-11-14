import { defineConfig } from 'vitest/config';
import { worldEditorSavePlugin } from './scripts/world-editor-save.mjs';

// ローカル確認専用。ブラウザを自動で開かない（open: false）。
export default defineConfig({
  plugins: [worldEditorSavePlugin()],
  base: './',
  server: { host: '127.0.0.1', port: 5173, open: false },
  preview: { host: '127.0.0.1', port: 4173, open: false },
  build: {
    target: 'es2022', sourcemap: false,
    rollupOptions: { input: { game: 'index.html', editor: 'editor.html', editorPreview: 'editor-preview.html', worldEditor: 'world-editor.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
