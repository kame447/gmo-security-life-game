/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import sampleJSON from '../data/editor-prototype.json?raw';
import { feetAtTile } from '../src/core/coords';
import type { MapEvent } from '../src/core/types';
import { applyChangeSet, buildEditorWorld, EditorSession, EditorValidationError, loadChangeSet, loadDocument,
  serializeChangeSet, serializeDocument, type EditorDocument, type EditorInteraction } from '../src/editor';
import { availableNpcSprites, NpcEditor } from '../src/editor-npc';
import { Game } from '../src/session/game';

const fixture = (): EditorDocument => JSON.parse(sampleJSON) as EditorDocument;
const newNpc = (changes: Partial<EditorInteraction> = {}): EditorInteraction => ({
  id: 'second-npc', areaId: 'demo-outdoor', kind: 'npc', name: 'サンプル', x: 5, y: 4,
  w: 1, h: 1, solid: true, sprite: 'friend', facing: 'down', eventKey: 'demo.greeting', lines: ['サンプルです。'],
  ...changes,
});

describe('NPC editing on the shared editor session', () => {
  it('lists and selects NPCs by ID and area without exposing mutable session data', () => {
    const session = new EditorSession(fixture());
    session.commit([{ type: 'add', table: 'interactions', id: 'sample-sign', after: {
      id: 'sample-sign', areaId: 'demo-outdoor', kind: 'sign', name: '看板', x: 3, y: 3,
      solid: false, eventKey: 'demo.greeting', lines: ['サンプル'],
    } }]);
    const editor = new NpcEditor(session);
    expect(editor.list().map(npc => npc.id)).toEqual(['demo-npc']);
    expect(editor.list('demo-room')).toEqual([]);
    expect(editor.select('sample-sign')).toBeNull();
    expect(editor.select('unknown')).toBeNull();
    const selected = editor.select('demo-npc')!;
    selected.name = 'changed outside'; selected.lines.push('changed outside');
    expect(editor.select('demo-npc')!.name).not.toBe(selected.name);
    expect(editor.select('demo-npc')!.lines).not.toContain('changed outside');
  });

  it('adds, moves, changes attributes and deletes through the same undo/redo history', () => {
    const session = new EditorSession(fixture()), editor = new NpcEditor(session);
    editor.add(newNpc());
    editor.move('second-npc', { areaId: 'demo-outdoor', x: 6, y: 4 });
    expect(editor.select('second-npc')).toMatchObject({ x: 6, y: 4 });
    expect(session.exportChanges().operations.find(op => op.id === 'second-npc')?.type).toBe('add');
    editor.update('second-npc', { name: '別の表示名', facing: 'left', solid: false, w: 2, h: 1, lines: ['別の会話'] });
    expect(editor.select('second-npc')).toMatchObject({ name: '別の表示名', facing: 'left', solid: false, w: 2 });
    session.undo();
    expect(editor.select('second-npc')).toMatchObject({ name: 'サンプル', x: 6, solid: true, w: 1 });
    session.redo();
    expect(editor.select('second-npc')?.name).toBe('別の表示名');
    editor.remove('second-npc');
    expect(editor.select('second-npc')).toBeNull();
    session.undo();
    expect(editor.select('second-npc')?.name).toBe('別の表示名');
    session.redo();
    expect(editor.select('second-npc')).toBeNull();
  });

  it('uses move for a location-only change and preserves other interaction fields', () => {
    const session = new EditorSession(fixture()), editor = new NpcEditor(session);
    const before = editor.select('demo-npc')!;
    editor.move('demo-npc', { areaId: 'demo-room', x: 2, y: 2 });
    const operation = session.exportChanges().operations[0];
    expect(operation.type).toBe('move');
    expect(editor.select('demo-npc')).toEqual({ ...before, areaId: 'demo-room', x: 2, y: 2 });
    session.undo();
    expect(editor.select('demo-npc')).toEqual(before);
  });

  it('rejects invalid fields, duplicate IDs, references, walls, solids, overlaps and bounds atomically', () => {
    const session = new EditorSession(fixture()), editor = new NpcEditor(session);
    editor.move('demo-npc', { areaId: 'demo-outdoor', x: 5, y: 4 });
    session.undo();
    const unchanged = session.document;
    const invalid: EditorInteraction[] = [
      newNpc({ id: 'Bad ID' }), newNpc({ id: 'demo-tree' }), newNpc({ name: '  ' }),
      newNpc({ eventKey: 'BAD KEY' }), newNpc({ eventKey: 'missing.key' }),
      newNpc({ sprite: 'grandma' }), newNpc({ lines: [] }), newNpc({ lines: ['  '] }),
      newNpc({ areaId: 'missing-area' }), newNpc({ x: 10 }), newNpc({ x: 0 }),
      newNpc({ x: 2, y: 2 }), newNpc({ x: 4, y: 4 }), newNpc({ x: 8, y: 2 }),
      newNpc({ w: 0 }), newNpc({ facing: 'north' as EditorInteraction['facing'] }),
    ];
    for (const npc of invalid) {
      expect(() => editor.add(npc), JSON.stringify(npc)).toThrow(EditorValidationError);
      expect(session.document).toEqual(unchanged);
      expect(session.canRedo).toBe(true);
    }
    expect(() => editor.update('demo-npc', { lines: [] })).toThrow(EditorValidationError);
    expect(() => editor.update('demo-npc', { id: 'changed-id' } as never)).toThrow(EditorValidationError);
    expect(() => editor.move('demo-npc', { areaId: 'demo-outdoor', x: -1, y: 4 })).toThrow(EditorValidationError);
    expect(() => editor.remove('demo-tree')).toThrow(EditorValidationError);
    expect(session.document).toEqual(unchanged);
    session.redo();
    expect(editor.select('demo-npc')?.x).toBe(5);
  });

  it('offers declared renderer choices without rejecting declared fallback sprites', () => {
    const document = fixture();
    document.catalogs.sprites.push('cat', 'grandma', 'custom-fallback');
    const session = new EditorSession(document), editor = new NpcEditor(session);
    expect(availableNpcSprites(session.document)).toEqual(['cat', 'friend', 'grandma']);
    editor.update('demo-npc', { sprite: 'custom-fallback' });
    expect(editor.select('demo-npc')?.sprite).toBe('custom-fallback');
    expect(availableNpcSprites(session.document)).not.toContain('custom-fallback');
  });

  it('exports, applies and reloads NPC changes while preserving runtime event references', () => {
    const baseline = fixture();
    baseline.catalogs.eventKeys.push('demo.followup'); // Test-only reference in the sample document.
    const session = new EditorSession(baseline), editor = new NpcEditor(session);
    editor.move('demo-npc', { areaId: 'demo-outdoor', x: 5, y: 4 });
    editor.update('demo-npc', { name: '検証用の名前', eventKey: 'demo.followup', facing: 'left', lines: ['検証用の会話'] });
    const changes = loadChangeSet(serializeChangeSet(session.exportChanges()));
    const applied = applyChangeSet(baseline, changes);
    const reloaded = loadDocument(serializeDocument(applied));
    expect(reloaded).toEqual(session.document);
    const edited = reloaded.interactions.find(i => i.id === 'demo-npc');
    expect(edited).toMatchObject({ x: 5, y: 4, name: '検証用の名前', eventKey: 'demo.followup', facing: 'left' });
    const events: MapEvent[] = [];
    const game = new Game(buildEditorWorld(reloaded), { sink: { onMapEvent: event => { events.push(event); } } });
    game.player = { areaId: 'demo-outdoor', ...feetAtTile(5, 5), facing: 'up' };
    game.action();
    expect(events).toContainEqual({ type: 'interact', areaId: 'demo-outdoor', interactionId: 'demo-npc', eventKey: 'demo.followup' });
    expect(game.dialog?.lines).toEqual(['検証用の会話']);
  });
});
