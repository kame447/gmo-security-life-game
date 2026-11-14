import { describe, expect, it } from 'vitest';
import { buildWorld, AREA_FACTORIES } from '../src/world';
import { createTown } from '../src/world/town';
import { areaLayout } from '../src/world/layouts';
import { initialLayout, layoutArea, plainArea, areaFingerprint } from '../src/world/layouts/codec';
import { withDerived, diffDocuments } from '../src/editor/changes';
import { canonicalJSON } from '../src/editor/schema';
import type { EditorRailLink } from '../src/editor/types';
import { WorldEditorModel, HOME_AREA } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { AREA_EDIT_POLICIES } from '../src/world-editor/world-policy';
import { trustedContext } from '../src/world-editor/trusted-context';

const testPolicies = { ...AREA_EDIT_POLICIES, 'town-main': () => {} };
function fixture(home = true) {
  const world = buildWorld(), model = new WorldEditorModel(world), after = model.document;
  if (home) after.objects.find(o => o.id === 'home-family-interior-plant-14-9')!.x--;
  after.objects.find(o => o.facilityId === 'shop-konbini')!.x--;
  after.portals.find(p => p.id === 'konbini-enter')!.from.x--;
  after.portals.find(p => p.id === 'konbini-exit')!.to.x--;
  const changes = diffDocuments(model.initial, withDerived(after, model.context), model.context);
  return { world, changes };
}

describe('まちの初回配置とワールド単位の保存計画', () => {
  it('まちはJSONを作らずに往復し、元の順序・地区・5組の結び付きを保つ', () => {
    expect(areaLayout('town-main')).toBeUndefined();
    const town = createTown(), layout = initialLayout(town, 'createTown');
    expect(plainArea(layoutArea(JSON.parse(canonicalJSON(layout)), town))).toEqual(plainArea(town));
    expect(layout.objects.map(o => o.id)).toEqual(town.objects.map(o => o.id));
    expect(layout.interactions.filter(i => i.objectId).map(i => [i.id, i.objectId]).sort()).toEqual([
      ['neighborhood-board', 'town-board-30-34'], ['neighborhood-postbox', 'town-postbox-41-36'],
      ['park-slide', 'town-slide-106-64'], ['shopping-vending', 'town-vending-50-53'], ['station-busstop', 'town-busstop-50-61'],
    ]);
  });
  it('同じ未保存文書から既存1・新規2の3ファイルを求め、元の配列順と指紋を保つ', () => {
    const { world, changes } = fixture();
    const result = prepareSave({ changes }, world, testPolicies);
    expect(result.files.map(f => [f.areaId, f.created])).toEqual([
      [HOME_AREA, false], ['shop-konbini-interior', true], ['town-main', true],
    ]);
    expect(result.text).toBe('');
    expect(prepareSave({ areaId: HOME_AREA, changes }, world, testPolicies)).toEqual(result);
    for (const file of result.files) {
      const layout = JSON.parse(file.text), source = AREA_FACTORIES.map(create => create()).find(a => a.id === file.areaId)!;
      expect(file.relativePath).toBe(`data/world/areas/${file.areaId}.json`);
      expect(layout.source.fingerprint).toBe(areaFingerprint(source));
      expect(file.text).toBe(canonicalJSON(layout));
      const original = areaLayout(file.areaId) ?? initialLayout(source, 'AreaFactory');
      expect(layout.objects.map((o: { id: string }) => o.id)).toEqual(original.objects.map(o => o.id));
      expect(layout.interactions.map((i: { id: string }) => i.id)).toEqual(original.interactions.map(i => i.id));
      expect(layout.portals.map((p: { id: string }) => p.id)).toEqual(original.portals.map(p => p.id));
      expect(layoutArea(layout, source).districts).toEqual(source.districts);
    }
  });
  it('屋外だけなら2ファイル、変更なしなら0ファイルで、製品の登録は自宅だけ', () => {
    const { world, changes } = fixture(false);
    expect(prepareSave({ changes }, world, testPolicies).files.map(f => f.areaId)).toEqual(['shop-konbini-interior', 'town-main']);
    expect(() => prepareSave({ changes }, world)).toThrow('town-main');
    const model = new WorldEditorModel(world);
    expect(prepareSave({ changes: model.session.exportChanges() }, world).files).toEqual([]);
    for (const extra of [{ files: [] }, { baselineWorld: world }, { areaId: 'town-main' }, { derived: {} }, { policies: {} }]) {
      expect(() => prepareSave({ changes, ...extra }, world, testPolicies)).toThrow();
    }
  });
  it('railLinksは信頼済み呼出側から独立コピーし、旧contextの省略との互換を保つ', () => {
    const world = buildWorld(), links: EditorRailLink[] = [{ from: { areaId: 'town-main', x: 35, y: 32 }, to: { areaId: 'town-main', x: 35, y: 33 } }];
    expect(trustedContext(world).railLinks).toBeUndefined();
    const context = trustedContext(world, links);
    expect(context.railLinks).toEqual(links); expect(context.railLinks).not.toBe(links);
    links[0].to.x = 36; expect(context.railLinks![0].to.x).toBe(35);
    expect(trustedContext(world, []).railLinks).toEqual([]);
  });
});
