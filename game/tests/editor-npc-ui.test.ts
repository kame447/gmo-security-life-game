/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import raw from '../data/editor-prototype.json?raw';
import { createEditorBackend } from '../src/editor-ui/backend.ts';
import { EditorModel } from '../src/editor-ui/model.ts';
import { NpcDraft } from '../src/editor-ui/npc/draft.ts';

const setup = () => {
  const model = new EditorModel(createEditorBackend(JSON.parse(raw)));
  return { model, npc: new NpcDraft(model) };
};

describe('NPC panel and shared editor state', () => {
  it('starts with an empty user-supplied ID and protects an unfinished new NPC', () => {
    const { model, npc } = setup();
    expect(npc.begin()).toBe(true);
    expect(npc.value?.id).toBe('');
    expect(model.pending).toBe(true);
    expect(model.selectArea('demo-room')).toBe(false);
    expect(npc.apply()).toBe(false);
    expect(model.issues[0].path).toBe('interaction.lines');
    expect(model.backend.canUndo).toBe(false);
    npc.set('id', 'demo-visitor'); npc.set('name', 'サンプル'); npc.set('lines', ['こんにちは']);
    npc.setPosition('6', '4');
    expect(npc.apply()).toBe(true);
    expect(model.selection).toEqual({ table: 'interactions', id: 'demo-visitor' });
    expect(model.document.interactions.find(item => item.id === 'demo-visitor')).toMatchObject({ x: 6, y: 4, name: 'サンプル' });
    expect(model.history('undo')).toBe(true);
    expect(model.document.interactions.some(item => item.id === 'demo-visitor')).toBe(false);
    expect(model.history('redo')).toBe(true);
    expect(model.document.interactions.some(item => item.id === 'demo-visitor')).toBe(true);
  });

  it('applies placement and attributes atomically and retains invalid drafts for correction', () => {
    const { model, npc } = setup();
    expect(model.select({ table: 'interactions', id: 'demo-npc' })).toBe(true);
    npc.set('name', '変更した表示名');
    npc.setPosition('0', '4');
    expect(model.select({ table: 'objects', id: 'demo-tree' })).toBe(false);
    expect(npc.apply()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'overlap')).toBe(true);
    expect(npc.value?.name).toBe('変更した表示名');
    expect(model.draft?.x).toBe('0');
    expect(model.backend.canUndo).toBe(false);
    npc.setPosition('5', '4');
    expect(npc.apply()).toBe(true);
    expect(model.changes.operations).toMatchObject([{ type: 'update', id: 'demo-npc', after: { x: 5, name: '変更した表示名' } }]);
    expect(model.history('undo')).toBe(true);
    expect(model.document.interactions[0]).toMatchObject({ x: 4, name: '編集確認NPC' });
    expect(model.history('redo')).toBe(true);
    expect(model.document.interactions[0]).toMatchObject({ x: 5, name: '変更した表示名' });
  });

  it('does not replace another unfinished draft when starting NPC creation', () => {
    const { model, npc } = setup();
    model.select({ table: 'objects', id: 'demo-tree' });
    model.draft!.x = '3';
    expect(npc.begin()).toBe(false);
    expect(model.selection).toEqual({ table: 'objects', id: 'demo-tree' });
    expect(model.draft?.x).toBe('3');
    expect(model.notice).toContain('未反映');
  });

  it('does not silently reuse a generic template ID when converting it into a new NPC', () => {
    const { model, npc } = setup();
    model.startAdd('interactions');
    const generic = JSON.parse(model.draft!.text);
    model.draft!.text = JSON.stringify({ ...generic, kind: 'npc', sprite: 'friend', lines: ['例'] });
    npc.clearGeneratedIdOnConversion();
    expect(npc.value?.id).toBe('');
    expect(npc.apply()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'format')).toBe(true);
    npc.set('id', 'manual-npc');
    expect(npc.apply()).toBe(true);
  });
});
