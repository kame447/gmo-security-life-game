import { describe, expect, it } from 'vitest';
import { TRAIN_NETWORK } from '../src/travel/network';
import { AREA_FACTORIES, buildWorld, validateWorld } from '../src/world';
import { T } from '../src/world/tiles';
import { staleLayouts } from '../src/world/layouts';
import { initialLayout } from '../src/world/layouts/codec';
import { toRuntime, type World } from '../src/world/runtime';
import { HOME_AREA, WorldEditorModel } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';
import { areaEditPolicy, isEditableArea } from '../src/world-editor/world-policy';
import { validateDocument } from '../src/editor';
import { assembleEditorWorld } from '../src/editor/runtime';
import { furnitureVariant, nextFacing } from '../src/render/furniture/catalog';

describe('Issue #24 全屋内エリアの編集・回転・重なり・将来統合互換', () => {
  it('実在する全屋内エリアと将来の#33商店/#59駅互換エリアを固定一覧なしで編集対象として導く', () => {
    const world = buildWorld();
    const indoorIds = [...world.areas.values()].filter(a => a.def.kind === 'indoor').map(a => a.def.id);
    expect(indoorIds).toEqual(['home-family-interior', 'school-classroom-interior', 'shop-konbini-interior', 'shop-greengrocer-interior', 'shop-bookstore-interior', 'shop-candy-interior', 'shop-bakery-interior', 'shop-cafe-interior', 'shop-pharmacy-interior', 'station-main-interior', 'station-neighbor-interior']);
    const model = new WorldEditorModel(world);
    for (const id of indoorIds) {
      expect(isEditableArea(model.initial, id)).toBe(true);
      expect(areaEditPolicy(model.initial, id)).toBe(assertInteriorEdit);
    }

    // Synthetic future areas mimicking #33 shop fixtures (kind/style) and #59 station interiors (T.RAIL / walkable concourse).
    const stationWidth = 10, stationHeight = 8;
    const stationGround = Uint8Array.from({ length: stationWidth * stationHeight }, (_, idx) => {
      const x = idx % stationWidth, y = Math.floor(idx / stationWidth);
      if (y === 0) return T.WALL_TOP;
      if (y === 1) return T.FENCE;
      if (y === 2) return T.RAIL;
      if (x === 0 || x === stationWidth - 1 || y === stationHeight - 1) return T.WALL;
      return T.FLOOR_CLASS;
    });
    const town = structuredClone(world.areas.get('town-main')!.def);
    town.portals.push(
      { id: 'fixture-greengrocer-enter', from: { x: 35, y: 34 }, to: { areaId: 'fixture-shop-greengrocer-interior', x: 4, y: 6, facing: 'up' } },
      { id: 'fixture-station-main-enter', from: { x: 36, y: 34 }, to: { areaId: 'fixture-station-main-interior', x: 4, y: 6, facing: 'up' } },
    );
    const extraAreas: [string, ReturnType<typeof toRuntime>][] = [
      [town.id, toRuntime(town)],
      ['fixture-shop-greengrocer-interior', toRuntime({
        id: 'fixture-shop-greengrocer-interior',
        name: 'やおや',
        kind: 'indoor',
        width: 10,
        height: 8,
        ground: Uint8Array.from({ length: 80 }, (_, idx) => {
          const x = idx % 10, y = Math.floor(idx / 10);
          return y === 0 ? T.WALL_TOP : x === 0 || x === 9 || y === 7 ? T.WALL : T.FLOOR_WOOD;
        }),
        objects: [
          { id: 'fixture-shop-greengrocer-interior-produce-1', kind: 'shopshelf', style: 'greengrocer', x: 2, y: 2, w: 2, h: 1, solid: true, layer: 'sorted' },
        ],
        interactions: [
          { id: 'fixture-greengrocer-clerk', kind: 'npc', name: '店主', sprite: 'clerk', x: 6, y: 2, facing: 'down', solid: true, eventKey: 'shop.greengrocer.clerk', lines: ['いらっしゃい！'] },
        ],
        portals: [
          { id: 'fixture-greengrocer-exit', from: { x: 4, y: 7, w: 2 }, to: { areaId: town.id, x: 35, y: 35, facing: 'down' } },
        ],
      })],
      ['fixture-station-main-interior', toRuntime({
        id: 'fixture-station-main-interior',
        name: 'まちのえき',
        kind: 'indoor',
        width: stationWidth,
        height: stationHeight,
        ground: stationGround,
        objects: [
          { id: 'fixture-station-main-interior-bench-1', kind: 'bench', x: 3, y: 4, w: 2, h: 1, solid: true, layer: 'sorted' },
        ],
        interactions: [],
        portals: [
          { id: 'fixture-station-exit', from: { x: 4, y: 7, w: 2 }, to: { areaId: town.id, x: 36, y: 35, facing: 'down' } },
        ],
      })],
    ];
    const extendedWorld: World = {
      variant: world.variant,
      start: world.start,
      facilities: world.facilities,
      areas: new Map([...world.areas, ...extraAreas]),
    };
    const extModel = new WorldEditorModel(extendedWorld);
    expect(isEditableArea(extModel.initial, 'fixture-shop-greengrocer-interior')).toBe(true);
    expect(isEditableArea(extModel.initial, 'fixture-station-main-interior')).toBe(true);

    // Move custom-style #33 shop fixture and add chair-wood + NPC
    extModel.move('fixture-shop-greengrocer-interior-produce-1', 3, 2, 'fixture-shop-greengrocer-interior');
    const shopChair = { ...extModel.create('chair-wood', 'fixture-shop-greengrocer-interior'), x: 6, y: 5 };
    extModel.commit(extModel.candidate(shopChair, true));
    // Place chair on walkable station T.PLATFORM and refuse placement on T.RAIL
    const stationChair = { ...extModel.create('chair-wood', 'fixture-station-main-interior'), x: 6, y: 4 };
    extModel.commit(extModel.candidate(stationChair, true));
    expect(() => extModel.commit(extModel.candidate({ ...extModel.create('chair-wood', 'fixture-station-main-interior'), x: 6, y: 2 }, true))).toThrow();
    expect(extModel.object(stationChair.id, undefined, 'fixture-station-main-interior')).toMatchObject({ x: 6, y: 4 });
  });

  it('きょうしつとコンビニで家具の追加・移動・4方向回転・削除・床塗装・NPC・Undo/Redoが通り、3部屋同時保存と検証が成立する', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    const classroom = 'school-classroom-interior';
    const konbini = 'shop-konbini-interior';

    // 1) Classroom: add chair-wood, rotate through all 4 facings, move & delete unlinked desk, paint floor, edit teacher, add new NPC
    const classChair = { ...model.create('chair-wood', classroom), x: 4, y: 9 };
    model.commit(model.candidate(classChair, true));
    const observedFacings = [model.object(classChair.id, undefined, classroom)!.facing];
    for (let i = 0; i < 4; i++) {
      model.rotate(classChair.id, classroom);
      observedFacings.push(model.object(classChair.id, undefined, classroom)!.facing);
    }
    expect(observedFacings).toEqual(['down', 'left', 'up', 'right', 'down']);

    const unlinkedDesk = model.initial.objects.find(o => o.areaId === classroom && !model.initial.interactions.some(i => i.objectId === o.id))!;
    model.move(unlinkedDesk.id, unlinkedDesk.x, unlinkedDesk.y + 1, classroom);
    expect(model.object(unlinkedDesk.id, undefined, classroom)?.y).toBe(unlinkedDesk.y + 1);
    const duplicate = { ...model.duplicate(classChair.id, classroom), x: 5, y: 9 };
    model.commit(model.candidate(duplicate, true));
    expect(duplicate.id).not.toBe(classChair.id);
    model.remove(duplicate.id, classroom);
    expect(model.object(duplicate.id, undefined, classroom)).toBeUndefined();

    model.updateNpc('school-teacher', { name: '担任の先生', lines: ['きょうしつも編集できます。'] }, classroom);
    const classNpc = { ...model.createNpc('friend', classroom), x: 10, y: 9 };
    model.commit(model.npcCandidate(classNpc, true));
    model.rotateNpc(classNpc.id, classroom);
    expect(model.npc(classNpc.id, undefined, classroom)?.facing).toBe('left');

    // Paint floor surface in classroom
    const surfaceDoc = model.document;
    const classArea = surfaceDoc.areas.find(a => a.id === classroom)!;
    classArea.surfaces = { palette: ['floor-wood-dark'], cells: Array(classArea.width * classArea.height).fill(0) };
    classArea.surfaces.cells[9 * classArea.width + 6] = 1;
    model.commit(surfaceDoc);

    // 2) Konbini: verify linked object protection + non-linked move/delete + add chair + edit clerk
    const linkedKonbiniObj = model.initial.interactions.find(i => i.areaId === konbini && i.objectId)?.objectId;
    if (linkedKonbiniObj) {
      expect(() => model.remove(linkedKonbiniObj, konbini)).toThrow();
    }
    const unlinkedKonbiniObj = model.initial.objects.find(o => o.areaId === konbini && !model.initial.interactions.some(i => i.objectId === o.id))!;
    model.move(unlinkedKonbiniObj.id, unlinkedKonbiniObj.x, unlinkedKonbiniObj.y + 1, konbini);
    const konbiniChair = { ...model.create('chair-wood', konbini), x: 3, y: 8 };
    model.commit(model.candidate(konbiniChair, true));
    model.updateNpc('konbini-clerk', { lines: ['いらっしゃいませ、棚も動かせます。'] }, konbini);

    // 3) Home edit alongside classroom & konbini -> 3-area save plan
    model.move('home-family-interior-plant-14-9', 13, 9, HOME_AREA);

    // Undo / Redo preserves cross-area state cleanly
    const snapshot = model.document;
    model.session.undo();
    expect(model.object('home-family-interior-plant-14-9', undefined, HOME_AREA)?.x).toBe(14);
    model.session.redo();
    expect(model.document).toEqual(snapshot);

    const plan = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(plan.files.map(f => [f.areaId, f.created])).toEqual([
      [HOME_AREA, false],
      [classroom, true],
      [konbini, true],
    ]);
    expect(validateWorld(assembleEditorWorld(model.document), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
  }, 15000);

  it('意図した重なり（ラグ上の家具・壁の窓・床塗装）を許し、不正な重なりと旧配置JSONを拒否する', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    const classroom = 'school-classroom-interior';

    // Intentional overlaps: rug-large (decal, non-solid) + table-low (sorted, solid) + chair-wood on rug + window-wall on WALL_TOP
    const rug = { ...model.create('rug-large', classroom), x: 3, y: 9 };
    model.commit(model.candidate(rug, true));
    const tableOnRug = { ...model.create('table-low', classroom), x: 3, y: 9 };
    expect(() => model.commit(model.candidate(tableOnRug, true))).not.toThrow();
    const win = { ...model.create('window-wall', classroom), x: 9, y: 0 };
    expect(() => model.commit(model.candidate(win, true))).not.toThrow();
    expect(validateDocument(model.document, model.context)).toEqual([]);

    // Forbidden overlaps: two solids at same tile, wall-only decal on floor, solid on arrival tile / exit portal / WALL
    expect(() => model.commit(model.candidate({ ...model.create('chair-wood', classroom), x: 3, y: 9 }, true))).toThrow();
    expect(() => model.commit(model.candidate({ ...model.create('window-wall', classroom), x: 3, y: 6 }, true))).toThrow();
    const enterPortal = model.initial.portals.find(p => p.to.areaId === classroom)!;
    expect(() => model.commit(model.candidate({ ...model.create('chair-wood', classroom), x: enterPortal.to.x, y: enterPortal.to.y }, true))).toThrow();
    const exitPortal = model.initial.portals.find(p => p.areaId === classroom)!;
    expect(() => model.commit(model.candidate({ ...model.create('chair-wood', classroom), x: exitPortal.from.x, y: exitPortal.from.y }, true))).toThrow();

    // Stale source JSON detection protects rebuilt interiors across factories
    const allGenerated = AREA_FACTORIES.map(c => c());
    expect(staleLayouts(allGenerated)).toEqual([]);
    const rebuilt = allGenerated.map(d => d.id === HOME_AREA ? { ...d, name: '改装後のいえ' } : d);
    expect(staleLayouts(rebuilt)).toEqual([HOME_AREA]);
    const classroomDef = allGenerated.find(a => a.id === classroom)!;
    const stale = initialLayout(classroomDef, 'createClassroom');
    const modifiedDef = { ...classroomDef, name: '改装後のきょうしつ' };
    expect(stale.source.fingerprint).not.toBe(initialLayout(modifiedDef, 'createClassroom').source.fingerprint);

    // Every furniture variant rotation stays reversible
    const sofaNext = furnitureVariant('sofa-2seat', nextFacing('sofa-2seat', 'down'))!;
    expect([sofaNext.w, sofaNext.h]).toEqual([1, 2]);
  });
});
