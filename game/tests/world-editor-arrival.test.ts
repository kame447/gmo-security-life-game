import { describe, expect, it } from 'vitest';
import { createChangeSet } from '../src/editor';
import { buildWorld } from '../src/world';
import { WorldEditorModel } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';

const ARRIVAL_OVERLAPPED_STORES = [
  'shop-konbini-interior',
  'shop-greengrocer-interior',
  'shop-cafe-interior',
  'shop-pharmacy-interior',
] as const;

describe('出入口と到着位置の物理占有検査（decal除外と固い物/調べる物の拒否）', () => {
  it('shop-floor やマットが到着位置に重なる4店で、店員名の変更がモデルと保存口の両方で通る', () => {
    for (const areaId of ARRIVAL_OVERLAPPED_STORES) {
      const world = buildWorld();
      const model = new WorldEditorModel(world);
      const doc = model.document;
      const arrivalPortals = doc.portals.filter(p => p.to.areaId === areaId);
      expect(arrivalPortals.length).toBeGreaterThan(0);

      // Confirm at least one non-solid decal object covers an arrival tile in each of these 4 stores.
      const coveringDecals = doc.objects.filter(o =>
        o.areaId === areaId &&
        o.solid === false &&
        o.layer === 'decal' &&
        arrivalPortals.some(p =>
          p.to.x >= o.x && p.to.x < o.x + o.w && p.to.y >= o.y && p.to.y < o.y + o.h,
        ),
      );
      expect(coveringDecals.length).toBeGreaterThan(0);

      const clerk = doc.interactions.find(i => i.areaId === areaId && i.kind === 'npc');
      expect(clerk).toBeDefined();

      const nextName = `${clerk!.name ?? '店員'}・改`;
      const candidate = model.npcCandidate({ ...clerk!, name: nextName });
      expect(model.issues(candidate)).toEqual([]);

      model.updateNpc(clerk!.id, { name: nextName }, areaId);
      expect(model.npc(clerk!.id, undefined, areaId)?.name).toBe(nextName);

      const saved = prepareSave({ changes: model.session.exportChanges() }, world);
      expect(saved.files.map(f => f.areaId)).toEqual([areaId]);

      const parsed = JSON.parse(saved.text) as { interactions: Array<{ id: string; name?: string }> };
      const savedClerk = parsed.interactions.find(i => i.id === clerk!.id);
      expect(savedClerk?.name).toBe(nextName);
    }
  });

  it('正の例: 調べられない solid:false かつ layer:decal のラグは到着位置・出入口に重ねても保存まで通る', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    const areaId = 'home-family-interior';
    const arrival = model.document.portals.find(p => p.to.areaId === areaId)!.to;
    const rug = model.create('rug-large', areaId);

    // 到着タイルの左上へ 3x2 ラグの右下が重なるように置く（足元表面は全て floor 上で到着位置へ重なる）
    const onArrival = model.candidate({ ...rug, x: arrival.x - (rug.w - 1), y: arrival.y - (rug.h - 1) }, true);
    expect(model.issues(onArrival)).toEqual([]);
    model.commit(onArrival);

    // shop-konbini-interior の shop-rug を出入口のマスに重ねて動かしても保存まで通る
    const konbiniRug = model.document.objects.find(o => o.areaId === 'shop-konbini-interior' && o.kind === 'shop-rug')!;
    expect(konbiniRug.solid).toBe(false);
    expect(konbiniRug.layer).toBe('decal');
    const konbiniExit = model.document.portals.find(p => p.areaId === 'shop-konbini-interior')!.from;
    model.move(konbiniRug.id, konbiniExit.x, konbiniExit.y - (konbiniRug.h - 1), 'shop-konbini-interior');

    const saved = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(saved.files.map(f => f.areaId).sort()).toEqual([areaId, 'shop-konbini-interior']);
  });

  it('負の例: 固い物・non-decal・調べられる物・話しかけられる物が到着位置や出入口に重なる配置は拒む', () => {
    const world = buildWorld();
    const areaId = 'home-family-interior';
    const model = new WorldEditorModel(world);
    const base = model.document;
    const arrival = base.portals.find(p => p.to.areaId === areaId)!.to;
    const exitPortal = base.portals.find(p => p.areaId === areaId)!.from;

    // 1. 固い家具（chair-wood）を到着位置・出入口へ置くのは拒む
    const chair = model.create('chair-wood', areaId);
    const chairOnArrival = model.candidate({ ...chair, x: arrival.x, y: arrival.y }, true);
    expect(() => assertInteriorEdit(base, chairOnArrival, areaId)).toThrow('出入口の到着位置には置けません');
    expect(model.issues(chairOnArrival).length).toBeGreaterThan(0);
    // 保存口でも固い家具を到着位置へ置く変更は拒む（schema の arrival 検査が先に弾く）
    const arrivalChanges = createChangeSet(base, [{ type: 'add', table: 'objects', id: chair.id, after: { ...chair, x: 4, y: 4 } }], model.context);
    (arrivalChanges.operations[0] as { after: { x: number; y: number } }).after = { ...chair, x: arrival.x, y: arrival.y };
    expect(() => prepareSave({ changes: arrivalChanges }, world)).toThrow();

    const chairOnExit = model.candidate({ ...chair, x: exitPortal.x, y: exitPortal.y }, true);
    expect(() => assertInteriorEdit(base, chairOnExit, areaId)).toThrow('出入口のマスには置けません');
    expect(model.issues(chairOnExit).length).toBeGreaterThan(0);

    // 2. solid:false でも layer:'sorted' の物は到着位置で拒む（assertInteriorEdit / prepareSave 双方）
    const { catalogId: _cat, ...chairBase } = chair;
    const sortedObj = { ...chairBase, id: `${areaId}-test-sorted`, solid: false, layer: 'sorted' as const };
    const sortedNonSolid = model.candidate({ ...sortedObj, x: arrival.x, y: arrival.y }, true);
    expect(() => assertInteriorEdit(base, sortedNonSolid, areaId)).toThrow('出入口の到着位置には置けません');
    const sortedChanges = createChangeSet(base, [{ type: 'add', table: 'objects', id: sortedObj.id, after: { ...sortedObj, x: 4, y: 4 } }], model.context);
    (sortedChanges.operations[0] as { after: typeof sortedObj }).after = { ...sortedObj, x: arrival.x, y: arrival.y };
    expect(() => prepareSave({ changes: sortedChanges }, world)).toThrow('出入口の到着位置には置けません');

    // 3. solid:false・layer:'decal' でも調べられる対象（interaction.objectId が紐付く物）は到着位置・出入口で拒む
    const decalId = `${areaId}-inspectable-decal`;
    const beforeWithInspectable = structuredClone(base);
    beforeWithInspectable.objects.push({
      id: decalId, areaId, kind: 'rug-small', facing: 'down', x: 3, y: 3, w: 1, h: 1, solid: false, layer: 'decal',
    });
    beforeWithInspectable.interactions.push({
      id: `${areaId}-inspectable-decal-note`, areaId, objectId: decalId, kind: 'object',
      name: 'メモのあるマット', x: 3, y: 3, w: 1, h: 1, solid: false, eventKey: base.catalogs.eventKeys[0]!, lines: ['メモ'],
    });
    const inspectableOnArrival = structuredClone(beforeWithInspectable);
    inspectableOnArrival.objects.find(o => o.id === decalId)!.x = arrival.x;
    inspectableOnArrival.objects.find(o => o.id === decalId)!.y = arrival.y;
    const linked = inspectableOnArrival.interactions.find(i => i.objectId === decalId)!;
    linked.x = arrival.x;
    linked.y = arrival.y;
    expect(() => assertInteriorEdit(beforeWithInspectable, inspectableOnArrival, areaId)).toThrow('出入口の到着位置には置けません');

    // 4. 話しかけられる物（NPC）を到着位置・出入口へ置くのは拒む
    const clerk = base.interactions.find(i => i.areaId === areaId && i.kind === 'npc')!;
    const npcOnArrival = model.npcCandidate({ ...clerk, x: arrival.x, y: arrival.y });
    expect(model.issues(npcOnArrival).length).toBeGreaterThan(0);
    expect(() => assertInteriorEdit(base, npcOnArrival, areaId)).toThrow();
  });
});
