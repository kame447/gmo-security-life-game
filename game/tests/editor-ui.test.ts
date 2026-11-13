/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import raw from '../data/editor-prototype.json?raw';
import { applyChangeSet, loadChangeSet, parseDocument, type EditorObject } from '../src/editor/index.ts';
import { createEditorBackend } from '../src/editor-ui/backend.ts';
import { EditorModel, operationFromForm } from '../src/editor-ui/model.ts';

const makeModel = () => new EditorModel(createEditorBackend(JSON.parse(raw)));
const tree = { table: 'objects', id: 'demo-tree' } as const;

describe('editor UI state', () => {
  it('selects the current area and target without discarding an unfinished form', () => {
    const model = makeModel();
    expect(model.areaId).toBe('demo-outdoor');
    expect(model.select(tree)).toBe(true);
    expect(model.draft?.id).toBe('demo-tree');
    model.draft!.x = '3';
    expect(model.selectArea('demo-room')).toBe(false);
    expect(model.areaId).toBe('demo-outdoor');
    expect(model.notice).toContain('未反映');
    model.cancelDraft();
    expect(model.selectArea('demo-room')).toBe(true);
    expect(model.selection).toBeNull();
  });

  it('converts position-only and property changes to the correct before/after operations', () => {
    const before = parseDocument(JSON.parse(raw)).objects.find(item => item.id === 'demo-tree')!;
    const moved = { ...before, x: 3 };
    expect(operationFromForm('objects', before, moved)).toEqual({ type: 'move', table: 'objects', id: before.id, before, after: moved });
    const updated = { ...moved, kind: 'bench' };
    expect(operationFromForm('objects', before, updated)).toEqual({ type: 'update', table: 'objects', id: before.id, before, after: updated });
    expect(operationFromForm('objects', undefined, moved)).toEqual({ type: 'add', table: 'objects', id: moved.id, after: moved });
  });

  it('checks invalid coordinates, duplicate IDs, and terrain before allowing export', () => {
    const model = makeModel();
    model.select(tree);
    model.draft!.x = '-1';
    expect(model.applyDraft()).toBe(false);
    expect(model.issues[0].message).toContain('座標');
    expect(model.canExport).toBe(false);
    model.draft!.x = '0';
    expect(model.applyDraft()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'overlap')).toBe(true);
    expect(model.document.objects.find(item => item.id === tree.id)?.x).toBe(2);
    model.cancelDraft();
    model.startAdd('objects');
    const duplicate = JSON.parse(model.draft!.text) as EditorObject;
    duplicate.id = 'demo-tree';
    model.draft!.text = JSON.stringify(duplicate);
    expect(model.applyDraft()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'duplicate-id')).toBe(true);
    expect(() => model.exportText()).toThrow();
  });

  it('presents backend bounds and reference errors without changing the current document', () => {
    const model = makeModel();
    model.select(tree);
    model.draft!.x = '99';
    expect(model.applyDraft()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'bounds')).toBe(true);
    model.cancelDraft();
    model.select({ table: 'interactions', id: 'demo-npc' });
    const edited = JSON.parse(model.draft!.text);
    edited.eventKey = 'unknown.event';
    model.draft!.text = JSON.stringify(edited);
    expect(model.applyDraft()).toBe(false);
    expect(model.issues.some(issue => issue.code === 'reference')).toBe(true);
    expect(model.document.interactions.find(item => item.id === 'demo-npc')?.eventKey).toBe('demo.greeting');
  });

  it('adds, edits, removes, and connects undo/redo to selection and the document', () => {
    const model = makeModel();
    expect(model.startAdd('objects')).toBe(true);
    expect(model.applyDraft()).toBe(true);
    expect(model.selection).toEqual({ table: 'objects', id: 'new-object' });
    model.draft!.x = '2';
    expect(model.applyDraft()).toBe(true);
    expect(model.document.objects.find(item => item.id === 'new-object')?.x).toBe(2);
    expect(model.history('undo')).toBe(true);
    expect(model.document.objects.find(item => item.id === 'new-object')?.x).toBe(1);
    expect(model.history('redo')).toBe(true);
    expect(model.document.objects.find(item => item.id === 'new-object')?.x).toBe(2);
    expect(model.deleteSelection()).toBe(true);
    expect(model.document.objects.some(item => item.id === 'new-object')).toBe(false);
    expect(model.history('undo')).toBe(true);
    expect(model.document.objects.some(item => item.id === 'new-object')).toBe(true);
  });

  it('exports validated changes that recreate the document from the original data', () => {
    const model = makeModel();
    model.select(tree);
    model.draft!.x = '3';
    expect(model.canExport).toBe(false);
    expect(model.applyDraft()).toBe(true);
    expect(model.canExport).toBe(true);
    const changes = loadChangeSet(model.exportText());
    expect(changes.operations).toHaveLength(1);
    expect(changes.operations[0]).toMatchObject({ type: 'move', table: 'objects', id: 'demo-tree', before: { x: 2 }, after: { x: 3 } });
    expect(applyChangeSet(JSON.parse(raw), changes)).toEqual(model.document);
  });
});
