import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/world';
import { WorldEditorModel, HOME_AREA } from '../src/world-editor/model';
import { withDerived } from '../src/editor/changes';
import type { EditorDocument } from '../src/editor/types';
import { AREA_EDIT_POLICIES, areaEditPolicy, assertWorldEdit, changedAreaIds, isEditableArea } from '../src/world-editor/world-policy';
import { assertInteriorEdit } from '../src/world-editor/policy';

const fixture = () => {
  const model = new WorldEditorModel(buildWorld());
  return { before: model.initial, after: model.document, context: model.context };
};
const testPolicies = { ...AREA_EDIT_POLICIES, 'town-main': () => {} };
function moveShop(document: EditorDocument) {
  document.objects.find(o => o.facilityId === 'shop-konbini')!.x--;
  document.portals.find(p => p.id === 'konbini-enter')!.from.x--;
  document.portals.find(p => p.id === 'konbini-exit')!.to.x--;
}

describe('ワールド全体の編集方針', () => {
  it('屋内エリアは固定登録を持たず世界データから導き、未登録の屋外は拒否する', () => {
    expect(Object.keys(AREA_EDIT_POLICIES)).toEqual(['town-main']);
    expect(Object.isFrozen(AREA_EDIT_POLICIES)).toBe(true);
    const model = new WorldEditorModel(buildWorld()), after = model.document;
    for (const id of [HOME_AREA, 'school-classroom-interior', 'shop-konbini-interior']) {
      expect(isEditableArea(model.initial, id)).toBe(true);
      expect(areaEditPolicy(model.initial, id)).toBe(assertInteriorEdit);
    }
    after.objects.find(o => o.areaId === 'school-classroom-interior')!.x++;
    expect(() => model.commit(after)).not.toThrow();
    expect(model.dirty).toBe(1);
    const { before, context } = fixture();
    const unregisteredOutdoor = { ...structuredClone(before.areas[0]), id: 'town-neighbor', name: 'となりまち', kind: 'outdoor' as const };
    const docBefore = { ...structuredClone(before), areas: [...before.areas, unregisteredOutdoor] };
    const docAfter = structuredClone(docBefore);
    docAfter.interactions.push({ id: 'town-neighbor-npc-1', areaId: 'town-neighbor', kind: 'npc', name: '人', sprite: 'friend',
      x: 2, y: 2, w: 1, h: 1, solid: true, eventKey: 'npc.town-neighbor-npc-1', lines: ['こんにちは。'] });
    const derivedAfter = withDerived(docAfter, context);
    expect(isEditableArea(docBefore, 'town-neighbor')).toBe(false);
    expect(() => assertWorldEdit(docBefore, derivedAfter, context)).toThrow('このエリアは変更できません: town-neighbor');
  });
  it('自宅の家具と同じ施設の屋外移動をまとめて通し、3エリアを求める', () => {
    const { before, after, context } = fixture();
    after.objects.find(o => o.id === 'home-family-interior-plant-14-9')!.x--;
    moveShop(after);
    expect(() => assertWorldEdit(before, after, context, testPolicies)).not.toThrow();
    expect(changedAreaIds(before, after)).toEqual([HOME_AREA, 'shop-konbini-interior', 'town-main']);
    expect(() => assertWorldEdit(before, after, context)).not.toThrow();
  });
  it('まちを登録しても、戻り先だけの移動は拒否する', () => {
    const { before, after, context } = fixture();
    after.portals.find(p => p.id === 'konbini-exit')!.to.x--;
    expect(() => assertWorldEdit(before, after, context)).toThrow();
  });
  it('建物と同量の戻り先移動と店内の正当な家具変更を許し、結び付き壊れは拒否する', () => {
    const { before, after, context } = fixture(); moveShop(after);
    expect(() => assertWorldEdit(before, after, context, testPolicies)).not.toThrow();
    const desynced = structuredClone(after);
    desynced.objects.find(o => o.areaId === 'shop-konbini-interior')!.x++;
    expect(() => assertWorldEdit(before, desynced, context, testPolicies)).toThrow('のみもののケース');
    const chair = new WorldEditorModel(buildWorld()).create('chair-wood', 'shop-konbini-interior');
    after.objects.push({ ...chair, x: 4, y: 6 });
    expect(() => assertWorldEdit(before, withDerived(after, context), context, testPolicies)).not.toThrow();
  });
  it('屋内到着位置と、建物を伴わない戻り先の変更を拒否する', () => {
    const { before, context } = fixture();
    for (const id of ['home-enter', 'home-exit']) {
      const after = structuredClone(before); after.portals.find(p => p.id === id)!.to.x++;
      expect(() => assertWorldEdit(before, withDerived(after, context), context, testPolicies)).toThrow();
    }
  });
  it('別施設・異なる移動量・向きと行き先の変更を戻り先の例外にしない', () => {
    const { before, context } = fixture();
    for (const alter of [
      (d: EditorDocument) => { d.portals.find(p => p.id === 'home-exit')!.to.x--; },
      (d: EditorDocument) => { d.portals.find(p => p.id === 'konbini-exit')!.to.x--; },
      (d: EditorDocument) => { d.portals.find(p => p.id === 'konbini-exit')!.to.facing = 'up'; },
      (d: EditorDocument) => { d.portals.find(p => p.id === 'konbini-exit')!.to.areaId = HOME_AREA; },
    ]) {
      const after = structuredClone(before); moveShop(after); alter(after);
      expect(() => assertWorldEdit(before, withDerived(after, context), context, testPolicies)).toThrow();
    }
  });
  it('文書・施設・年代・sprite・地形・出入口の同一性を保護する', () => {
    const { before, context } = fixture();
    for (const alter of [
      (d: EditorDocument) => { d.id = 'another-world'; },
      (d: EditorDocument) => { d.tileSize++; },
      (d: EditorDocument) => { d.facilities[0].name += '変更'; },
      (d: EditorDocument) => { d.variant!.id = 'another-variant'; },
      (d: EditorDocument) => { d.catalogs.sprites.push('another-person'); },
      (d: EditorDocument) => { d.areas.pop(); },
      (d: EditorDocument) => { d.areas[0].width++; },
      (d: EditorDocument) => { d.areas[0].ground[0]++; },
      (d: EditorDocument) => { d.portals[0].facilityId = 'school'; },
    ]) {
      const after = structuredClone(before); alter(after);
      expect(() => assertWorldEdit(before, after, context, testPolicies)).toThrow();
    }
  });
  it('偽の開始位置とキーを拒否し、同じcontextの宣言が無いときは厳密比較する', () => {
    const { before, context } = fixture();
    for (const alter of [
      (d: EditorDocument) => { d.start.x++; },
      (d: EditorDocument) => { d.catalogs.eventKeys.push('npc.forged'); },
      (d: EditorDocument) => { d.interactions.find(i => i.id === 'home-mother')!.eventKey = 'npc.home-mother'; },
    ]) {
      const after = structuredClone(before); alter(after);
      expect(() => assertWorldEdit(before, after, context)).toThrow();
    }
    const after = structuredClone(before);
    after.objects.find(o => o.facilityId === 'home-family')!.y++;
    after.portals.find(p => p.id === 'home-enter')!.from.y++;
    after.portals.find(p => p.id === 'home-exit')!.to.y++;
    const derived = withDerived(after, context);
    expect(derived.start).toMatchObject({ x: 35, y: 33 });
    expect(() => assertWorldEdit(before, derived, context, testPolicies)).not.toThrow();
    expect(() => assertWorldEdit(before, derived, { baselineWorld: context.baselineWorld }, testPolicies)).toThrow('開始位置');
  });
});
