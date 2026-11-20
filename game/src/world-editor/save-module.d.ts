declare module '*world-editor-save.mjs' {
  import type { Plugin } from 'vite';
  export function worldEditorSavePlugin(): Plugin;
  export function previewLayout(root: string, payload: unknown): Promise<{target:string;summary:unknown[]}>;
  export function applyLayout(root: string, payload: unknown): Promise<{target:string;summary:unknown[];saved:boolean}>;
}
