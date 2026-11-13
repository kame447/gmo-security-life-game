import { describe, expect, it } from 'vitest';
import prototype from '../data/editor-prototype.json';
import { applyChangeSet, createChangeSet, parseDocument } from '../src/editor/index.ts';
import { createEditorBackend } from '../src/editor-ui/backend.ts';
import { EditorModel } from '../src/editor-ui/model.ts';
import { mapDraftOperations, mapMoveOperations, operationsFromDraft, validateMapOperations } from '../src/editor-ui/map/operations.ts';
import { footprint, hitSelection, sceneEntries } from '../src/editor-ui/map/scene.ts';
import { tileFromClient, zoomScroll } from '../src/editor-ui/map/viewport.ts';

const fixture = () => parseDocument(prototype);
describe('map editor operations', () => {
  it('moves a facility and its building/doors/return arrival in one undo step', () => {
    const model = new EditorModel(createEditorBackend(fixture()));
    const original = model.document;
    model.select({ table: 'facilities', id: 'demo-house' });
    const operations = mapMoveOperations(original, model.selection!, 6, 1);
    expect(validateMapOperations(original, operations)).toEqual([]);
    model.commit(operations);
    expect(model.document.objects.find(o => o.id === 'demo-house-building')!.x).toBe(6);
    expect(model.document.portals.find(p => p.id === 'demo-enter')!.from.x).toBe(7);
    expect(model.document.portals.find(p => p.id === 'demo-exit')!.to.x).toBe(7);
    expect(model.document.facilities[0].id).toBe(original.facilities[0].id);
    expect(model.history('undo')).toBe(true); expect(model.document).toEqual(original);
    expect(model.history('redo')).toBe(true);
    expect(model.document.portals.find(p => p.id === 'demo-enter')!.from.x).toBe(7);
  });
  it('keeps facility geometry synchronized when moving its building', () => {
    const d = fixture(), ops = mapMoveOperations(d, { table: 'objects', id: 'demo-house-building' }, 6, 1);
    const next = applyChangeSet(d, createChangeSet(d, ops));
    expect(next.portals.find(p => p.id === 'demo-exit')!.to.x).toBe(7);
    expect(d.objects.find(o => o.id === 'demo-house-building')!.x).toBe(7);
  });
  it('moves paired portal arrival offsets and rejects unsafe placements', () => {
    const d = fixture(), ops = mapMoveOperations(d, { table: 'portals', id: 'demo-enter' }, 6, 2);
    const next = applyChangeSet(d, createChangeSet(d, ops));
    expect(next.portals.find(p => p.id === 'demo-enter')!.from).toEqual({ x: 6, y: 2 });
    expect(next.portals.find(p => p.id === 'demo-exit')!.to).toMatchObject({ x: 6, y: 3 });
    expect(validateMapOperations(d, mapMoveOperations(d, { table: 'objects', id: 'demo-tree' }, 0, 2)).some(i => i.code === 'overlap')).toBe(true);
    expect(validateMapOperations(d, mapMoveOperations(d, { table: 'facilities', id: 'demo-house' }, 4, 3)).some(i => i.code === 'overlap')).toBe(true);
    expect(validateMapOperations(d, mapMoveOperations(d, { table: 'portals', id: 'demo-enter' }, 20, 2)).some(i => i.code === 'bounds')).toBe(true);
  });
  it('keeps linked object interactions synchronized and leaves NPCs alone', () => {
    const d = fixture();
    d.interactions.push({ id: 'tree-label', areaId: 'demo-outdoor', kind: 'object', name: '木', x: 2, y: 2, objectId: 'demo-tree', solid: false, eventKey: 'demo.greeting', lines: [] });
    const next = applyChangeSet(d, createChangeSet(d, mapMoveOperations(d, { table: 'objects', id: 'demo-tree' }, 3, 2)));
    expect(next.interactions.find(i => i.id === 'tree-label')!.x).toBe(3);
    expect(next.interactions.find(i => i.id === 'demo-npc')).toEqual(d.interactions.find(i => i.id === 'demo-npc'));
    expect(() => mapMoveOperations(d, { table: 'interactions', id: 'demo-npc' }, 5, 4)).toThrow('移動できません');
  });
  it('applies typed properties and grouped placement from the same form without losing history', () => {
    const model = new EditorModel(createEditorBackend(fixture()));
    model.select({ table: 'objects', id: 'demo-house-building' });
    model.draft!.x = '6';
    const after = JSON.parse(model.draft!.text); after.style = 'brick'; model.draft!.text = JSON.stringify(after);
    expect(model.applyDraft((table, before, next) => mapDraftOperations(model.document, table, before, next))).toBe(true);
    expect(model.document.objects.find(o => o.id === 'demo-house-building')).toMatchObject({ x: 6, style: 'brick' });
    expect(model.document.portals.find(p => p.id === 'demo-exit')!.to.x).toBe(7);
    model.history('undo'); expect(model.document).toEqual(fixture());
  });
  it('leaves document/history untouched on generator failure, validation failure and selection deletion', () => {
    const model = new EditorModel(createEditorBackend(fixture()));
    model.select({ table: 'objects', id: 'demo-tree' }); model.draft!.x = '3';
    expect(model.applyDraft(() => { throw new Error('generator failed'); })).toBe(false);
    expect(model.issues[0].message).toBe('generator failed');
    expect(model.document).toEqual(fixture()); expect(model.backend.canUndo).toBe(false);
    expect(model.applyDraft(() => [{ type: 'delete', table: 'objects', id: 'demo-tree', before: model.document.objects.find(o => o.id === 'demo-tree')! }])).toBe(false);
    expect(model.issues[0].message).toContain('保持');
    expect(model.document).toEqual(fixture()); expect(model.backend.canUndo).toBe(false);
    model.draft!.x = '0';
    expect(model.applyDraft((table, before, after) => mapDraftOperations(model.document, table, before, after))).toBe(false);
    expect(model.issues.some(i => i.code === 'overlap')).toBe(true);
    expect(model.document).toEqual(fixture()); expect(model.backend.canUndo).toBe(false);
  });
  it('previews coordinates and JSON changes using the same operation generation', () => {
    const model = new EditorModel(createEditorBackend(fixture()));
    model.select({ table: 'objects', id: 'demo-tree' });
    const after = JSON.parse(model.draft!.text); after.x = 3; model.draft!.text = JSON.stringify(after);
    expect(operationsFromDraft(model.document, model.draft!)[0]).toMatchObject({ after: { x: 3 } });
    model.draft!.x = '5';
    expect(operationsFromDraft(model.document, model.draft!)[0]).toMatchObject({ after: { x: 5 } });
    expect(model.document).toEqual(fixture());
  });
});
describe('map viewport and selection', () => {
  it('converts CSS-scaled coordinates and preserves zoom anchors', () => {
    expect(tileFromClient(329, 203, { left: 100, top: 50, width: 760, height: 608 }, { width: 380, height: 304 })).toEqual({ x: 3, y: 2 });
    expect(zoomScroll(100, 200, 1, 2)).toBe(376);
    expect(zoomScroll(0, 10, 1, .5)).toBe(7);
  });
  it('selects topmost portals, linked facility bounds and per-area objects', () => {
    const scene = fixture(), facility = { table: 'facilities', id: 'demo-house' } as const;
    expect(footprint(scene, facility)).toEqual({ x: 7, y: 1, w: 2, h: 2 });
    expect(hitSelection(scene, 'demo-outdoor', 8, 2)).toEqual({ table: 'portals', id: 'demo-enter' });
    expect(hitSelection(scene, 'demo-outdoor', 8, 2, facility)).toEqual(facility);
    expect(hitSelection(scene, 'demo-room', 2, 2)).toBeNull();
    expect(sceneEntries(scene, 'demo-room').map(e => e.entity.id)).toEqual(['demo-room', 'demo-exit']);
  });
});
