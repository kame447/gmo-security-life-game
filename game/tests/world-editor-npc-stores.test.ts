import { describe, expect, it } from 'vitest';
import { STORE_CONTACTS } from '../src/data/stores';
import { parseDocument } from '../src/editor/schema';
import { withDerived } from '../src/editor/changes';
import { assembleEditorWorld } from '../src/editor/runtime';
import type { EditorInteraction } from '../src/editor/types';
import { validateStoreContacts } from '../src/stores/validate';
import { TRAIN_NETWORK } from '../src/travel/network';
import { buildWorld, validateWorld } from '../src/world';
import { layoutArea, type AreaLayout } from '../src/world/layouts/codec';
import type { World } from '../src/world/runtime';
import { worldDocument } from '../src/world-editor/document';
import { WorldEditorModel } from '../src/world-editor/model';
import { areaNpcs, EDITABLE_PEOPLE, npcEventKey } from '../src/world-editor/npc';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';
import { trustedContext, worldRailLinks } from '../src/world-editor/trusted-context';
import { isEditableArea } from '../src/world-editor/world-policy';

function legalMove(model: WorldEditorModel, npc: EditorInteraction): { x: number; y: number } {
  const area = model.document.areas.find(candidate => candidate.id === npc.areaId)!;
  for (let distance = 1; distance <= 4; distance++) {
    for (const [dx, dy] of [[0, distance], [distance, 0], [0, -distance], [-distance, 0]]) {
      const candidate = { ...npc, x: npc.x + dx, y: npc.y + dy };
      if (candidate.x < 1 || candidate.y < 1 || candidate.x >= area.width - 1 || candidate.y >= area.height - 1) continue;
      if (!model.issues(model.npcCandidate(candidate)).length) return { x: candidate.x, y: candidate.y };
    }
  }
  throw new Error(`No legal nearby move for ${npc.id} in ${npc.areaId}`);
}

function freeCell(model: WorldEditorModel, areaId: string): { x: number; y: number } {
  const area = model.document.areas.find(candidate => candidate.id === areaId)!;
  const draft = model.createNpc('friend', areaId);
  for (let y = 1; y < area.height - 1; y++) {
    for (let x = 1; x < area.width - 1; x++) {
      if (!model.issues(model.npcCandidate({ ...draft, x, y }, true)).length) return { x, y };
    }
  }
  throw new Error(`No free NPC cell in ${areaId}`);
}

function reopen(layout: AreaLayout, world: World, areaId: string): WorldEditorModel {
  const document = worldDocument(world);
  const source = world.areas.get(areaId)!.def;
  const area = layoutArea(layout, source);
  Object.assign(document.areas.find(candidate => candidate.id === areaId)!, layout.area);
  document.objects = [
    ...document.objects.filter(item => item.areaId !== areaId),
    ...area.objects.map(item => ({ ...item, id: item.id!, areaId })),
  ];
  document.interactions = [
    ...document.interactions.filter(item => item.areaId !== areaId),
    ...layout.interactions.map(item => ({ ...item, areaId })),
  ];
  document.portals = [
    ...document.portals.filter(door => door.areaId !== areaId),
    ...area.portals.map(door => ({ ...door, areaId })),
  ];
  const context = trustedContext(world, worldRailLinks(world));
  return new WorldEditorModel(assembleEditorWorld(parseDocument(withDerived(document, context), context)));
}

describe('N1.5 店を含む全エリアの人物確認', () => {
  it('isEditableArea による走査で全16編集可能エリア32人が編集対象になり、7店の接続と一致する', () => {
    const world = buildWorld();
    const initial = new WorldEditorModel(world).initial;
    expect(validateWorld(world, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
    expect(validateStoreContacts(world, STORE_CONTACTS)).toEqual([]);

    const editableAreas = initial.areas.filter(area => isEditableArea(initial, area.id));
    const readonlyPopulated = initial.areas.filter(
      area => !isEditableArea(initial, area.id) && areaNpcs(initial, area.id).length > 0,
    );
    expect(readonlyPopulated.map(area => area.id)).toEqual(['town-neighbor']);
    expect(editableAreas).toHaveLength(16);

    const counts = Object.fromEntries(editableAreas.map(area => [area.id, areaNpcs(initial, area.id).length]));
    expect(counts['town-main']).toBe(6);
    expect(counts['home-family-interior']).toBe(1);
    expect(counts['school-classroom-interior']).toBe(2);
    for (const store of STORE_CONTACTS) {
      expect(editableAreas.some(area => area.id === store.interiorAreaId)).toBe(true);
      expect(counts[store.interiorAreaId]).toBe(store.catalogId === 'cafe' ? 3 : 2);
    }
    expect(counts['high-school-interior']).toBe(3);
    expect(counts['university-interior']).toBe(3);
    expect(counts['office-interior']).toBe(2);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(32);
  });

  it('7店すべての店員で5種類の編集・Undo/Redo・保存往復・保護・store接続検証が通る', () => {
    const world = buildWorld();
    const initial = new WorldEditorModel(world).initial;
    const storeIds = new Set(STORE_CONTACTS.map(store => store.interiorAreaId));
    const storeAreas = initial.areas.filter(area => isEditableArea(initial, area.id) && storeIds.has(area.id));
    expect(storeAreas).toHaveLength(STORE_CONTACTS.length);

    for (const area of storeAreas) {
      const store = STORE_CONTACTS.find(entry => entry.interiorAreaId === area.id)!;
      const model = new WorldEditorModel(world);
      const original = areaNpcs(model.document, area.id).find(npc => npc.eventKey === store.clerkEventKey)!;
      expect(original).toBeDefined();

      const nextPos = legalMove(model, original);
      const nextSprite = EDITABLE_PEOPLE.find(person => person.id !== original.sprite)!.id;
      model.updateNpc(original.id, nextPos, area.id);
      model.rotateNpc(original.id, area.id);
      model.updateNpc(original.id, {
        name: `${original.name}・確認`,
        lines: ['店員の編集確認です。', '2行目も保持します。'],
        sprite: nextSprite,
      }, area.id);

      const edited = model.npc(original.id, undefined, area.id)!;
      expect(edited).toMatchObject({
        id: original.id,
        eventKey: store.clerkEventKey,
        kind: 'npc',
        solid: true,
        x: nextPos.x,
        y: nextPos.y,
        name: `${original.name}・確認`,
        lines: ['店員の編集確認です。', '2行目も保持します。'],
        sprite: nextSprite,
      });
      expect(edited.w).toBe(original.w);
      expect(edited.h).toBe(original.h);
      expect(edited.facing).not.toBe(original.facing ?? 'down');

      const editedWorld = model.runtime(model.document, [area.id]);
      expect(validateWorld(editedWorld, { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
      expect(validateStoreContacts(editedWorld, STORE_CONTACTS)).toEqual([]);

      model.session.undo();
      expect(model.npc(original.id, undefined, area.id)!.name).toBe(original.name);
      model.session.undo();
      model.session.undo();
      expect(model.npc(original.id, undefined, area.id)).toEqual(original);
      model.session.redo();
      model.session.redo();
      model.session.redo();
      expect(model.npc(original.id, undefined, area.id)).toEqual(edited);

      const prepared = prepareSave({ changes: model.session.exportChanges() }, world);
      expect(prepared.files.map(file => file.areaId)).toEqual([area.id]);
      const saved = JSON.parse(prepared.text) as AreaLayout;
      const reopened = reopen(saved, world, area.id);
      expect(reopened.document).toEqual(model.document);
      expect(validateStoreContacts(reopened.runtime(reopened.document, [area.id]), STORE_CONTACTS)).toEqual([]);

      expect(reopened.npcProtectedReason(original.id, area.id)).toContain('消せません');
      expect(() => reopened.removeNpc(original.id, area.id)).toThrow(/消せません/);

      const baseline = reopened.document;
      for (const patch of [
        { id: `${original.id}-tamper` },
        { eventKey: 'tampered.clerk' },
        { eventKey: `npc.${original.id}` },
        { kind: 'object' },
        { w: 2 },
        { h: 2 },
        { solid: false },
      ]) {
        const after = reopened.document;
        Object.assign(after.interactions.find(item => item.id === original.id)!, patch);
        expect(() => assertInteriorEdit(baseline, after, area.id)).toThrow();
        expect(reopened.document).toEqual(baseline);
      }
    }
  }, 15000);

  it('7店すべてで置いた人の追加・保存・再読込後の削除で店員キーと店舗接続を壊さない', () => {
    const world = buildWorld();
    for (const store of STORE_CONTACTS) {
      const areaId = store.interiorAreaId;
      const model = new WorldEditorModel(world);
      const cell = freeCell(model, areaId);
      const placed = { ...model.createNpc('friend', areaId), ...cell, name: `${areaId}の追加人物`, lines: ['店内の追加人物です。'] };
      model.commit(model.npcCandidate(placed, true));
      expect(placed.eventKey).toBe(npcEventKey(placed.id));
      expect(model.document.catalogs.eventKeys).toContain(placed.eventKey);
      expect(validateStoreContacts(model.runtime(model.document, [areaId]), STORE_CONTACTS)).toEqual([]);

      const preparedSave = prepareSave({ changes: model.session.exportChanges() }, world);
      expect(preparedSave.files.map(file => file.areaId)).toEqual([areaId]);
      const saved = JSON.parse(preparedSave.text) as AreaLayout;
      const reopened = reopen(saved, world, areaId);
      const baseRuntime = reopened.runtime(reopened.initial, [areaId]);
      expect(reopened.npcProtectedReason(placed.id, areaId)).toBe('');
      expect(reopened.npcProtectedReason(
        areaNpcs(reopened.document, areaId).find(npc => npc.eventKey === store.clerkEventKey)!.id,
        areaId,
      )).toContain('消せません');

      reopened.removeNpc(placed.id, areaId);
      expect(reopened.document.catalogs.eventKeys).not.toContain(placed.eventKey);
      reopened.session.undo();
      expect(reopened.npc(placed.id, undefined, areaId)).toEqual(placed);
      reopened.session.redo();
      expect(reopened.npc(placed.id, undefined, areaId)).toBeUndefined();

      const preparedDelete = prepareSave({ changes: reopened.session.exportChanges() }, baseRuntime);
      expect(preparedDelete.files.map(file => file.areaId)).toEqual([areaId]);
      const savedAfterDelete = JSON.parse(preparedDelete.text) as AreaLayout;
      expect(savedAfterDelete.interactions.some(item => item.id === placed.id)).toBe(false);
      expect(savedAfterDelete.interactions.some(item => item.eventKey === placed.eventKey)).toBe(false);
      const finalModel = reopen(savedAfterDelete, baseRuntime, areaId);
      expect(finalModel.document.catalogs.eventKeys).not.toContain(placed.eventKey);
      expect(validateStoreContacts(finalModel.runtime(finalModel.document, [areaId]), STORE_CONTACTS)).toEqual([]);
    }
  }, 15000);
});
