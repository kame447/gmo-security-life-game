import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/world';
import { T, isRoad, isSolidGround } from '../src/world/tiles';
import { diffDocuments } from '../src/editor';
import { OutdoorModel } from '../src/world-editor/outdoor';
import { WorldEditorModel } from '../src/world-editor/model';
import { changedAreaIds } from '../src/world-editor/world-policy';
import { prepareSave } from '../src/world-editor/persistence';
import type { EditorObject } from '../src/editor/types';

function fixture(sign = false) {
  const world = buildWorld();
  if (sign) {
    // A traversable facade permits a contained sign without exempting new solid overlaps.
    // Other tests use the unmodified solid house in the real World.
    world.areas.get('town-main')!.def.objects.find(o => o.facilityId === 'home-family')!.solid = false;
    world.areas.get('town-main')!.def.interactions.push({ id: 'test-home-sign', kind: 'sign', name: '家の表札',
      x: 32, y: 31, solid: false, eventKey: 'home.test-sign', lines: ['ただいま。'] });
  }
  const host = new WorldEditorModel(world); return { host, outdoor: new OutdoorModel(host) };
}
function freeCandidate(host: WorldEditorModel, outdoor: OutdoorModel, object: EditorObject, adding: boolean) {
  const area = host.document.areas.find(a => a.id === 'town-main')!;
  const occupied = host.document.objects.filter(o => o.areaId === area.id);
  for (let y = 1; y < area.height - object.h; y++) for (let x = 1; x < area.width - object.w; x++) {
    if (occupied.some(o => o.id !== object.id && x < o.x + o.w && x + object.w > o.x && y < o.y + o.h && y + object.h > o.y)) continue;
    const cells = Array.from({ length: object.w * object.h }, (_, i) => area.ground[(y + Math.floor(i / object.w)) * area.width + x + i % object.w]);
    if (cells.some(t => isSolidGround(t) || isRoad(t) || t === T.BRIDGE || t === T.CROSSING || t === T.SIDEWALK)) continue;
    const result = outdoor.candidate({ ...object, x, y }, adding);
    if (!outdoor.issues(result).length) return result;
  }
  throw new Error('No valid real-world position for test');
}

describe('屋外の操作モデルと共有履歴', () => {
  it.each([false, true])('家・入口・戻り先・開始位置を1段で移動しUndo/Redoする（S2-3、含まれる表札=%s）', sign => {
    const { host, outdoor } = fixture(sign), before = host.document;
    const home = before.objects.find(o => o.facilityId === 'home-family')!;
    const candidate = outdoor.candidate({ ...home, y: home.y + 1 });
    expect(host.document).toEqual(before); expect(host.session.canUndo).toBe(false);
    expect(outdoor.issues(candidate)).toEqual([]);
    host.commit(candidate);
    expect(host.document.objects.find(o => o.id === home.id)!.y).toBe(home.y + 1);
    expect(host.document.portals.find(p => p.id === 'home-enter')!.from.y).toBe(32);
    expect(host.document.portals.find(p => p.id === 'home-exit')!.to.y).toBe(33);
    if (sign) expect(host.document.interactions.find(i => i.id === 'test-home-sign')!.y).toBe(32);
    expect(host.document.start).toMatchObject({ x: 35, y: 33 });
    expect(diffDocuments(before, host.document, host.context).operations).toHaveLength(sign ? 4 : 3);
    host.session.undo(); expect(host.document).toEqual(before); expect(host.session.canUndo).toBe(false);
    host.session.redo(); expect(host.document.start.y).toBe(33);
    // Move back from the current position, not from the original snapshot.
    outdoor.move(home.id, home.x, home.y); expect(host.document).toEqual(before);
  });
  it('コンビニの移動と自宅家具を同じ履歴に積み、3エリアの保存下書きへ渡す', () => {
    const { host, outdoor } = fixture();
    host.move('home-family-interior-plant-14-9', 13, 9);
    const indoorEdited = host.document, shop = indoorEdited.objects.find(o => o.facilityId === 'shop-konbini')!;
    outdoor.move(shop.id, shop.x - 1, shop.y);
    expect(changedAreaIds(host.initial, host.document)).toEqual(['home-family-interior', 'shop-konbini-interior', 'town-main']);
    const plan = prepareSave({ changes: host.session.exportChanges() }, buildWorld());
    expect(plan.files.map(f => f.areaId)).toEqual(['home-family-interior', 'shop-konbini-interior', 'town-main']);
    host.session.undo(); expect(host.document).toEqual(indoorEdited);
    host.session.undo(); expect(host.document).toEqual(host.initial);
  });
  it('掲示板を動かすと結び付いた調べる場所が同じだけ動きUndo1段で戻る（S2-8）', () => {
    const { host, outdoor } = fixture(), before = host.document;
    const board = before.objects.find(o => o.areaId === 'town-main' && o.kind === 'board')!;
    const candidate = freeCandidate(host, outdoor, board, false);
    host.commit(candidate);
    const moved = host.document.objects.find(o => o.id === board.id)!, target = host.document.interactions.find(i => i.objectId === board.id)!;
    expect(target).toMatchObject({ x: moved.x, y: moved.y, w: moved.w });
    expect(target.eventKey).toBe('neighborhood.board');
    host.session.undo(); expect(host.document).toEqual(before);
  });
  it('追加・削除・取消・Undo/Redo後もIDを再利用せず、複製は元の属性を保つ（S2-9）', () => {
    const { host, outdoor } = fixture(), cancelled = outdoor.create('tree-green');
    const first = outdoor.create('tree-green'); expect(first.id).not.toBe(cancelled.id);
    host.commit(freeCandidate(host, outdoor, first, true));
    outdoor.remove(first.id); const second = outdoor.create('tree-green');
    expect(second.id).not.toBe(first.id);
    host.session.undo(); expect(outdoor.object(first.id)).toBeDefined();
    host.session.undo(); expect(outdoor.object(first.id)).toBeUndefined();
    const third = outdoor.create('tree-green'); expect(new Set([cancelled.id, first.id, second.id, third.id]).size).toBe(4);
    host.session.redo(); expect(outdoor.object(first.id)).toBeDefined();
    const source = host.document.objects.find(o => o.areaId === 'town-main' && o.kind === 'house' && !o.facilityId)!;
    const copy = outdoor.duplicate(source.id);
    expect(copy.id).not.toBe(source.id); expect({ ...copy, id: source.id }).toEqual(source);
    const replacement = outdoor.candidate(copy, true);
    replacement.objects = replacement.objects.filter(o => o.id !== source.id);
    expect(outdoor.issues(replacement)).toEqual([]);
    host.commit(replacement);
  });
  it('水・別の物・出入口との重なりを既存検証で拒否する', () => {
    const { host, outdoor } = fixture(), before = host.document, area = before.areas.find(a => a.id === 'town-main')!;
    const tree = outdoor.create('tree-green'), water = area.ground.indexOf(T.WATER);
    const other = before.objects.find(o => o.areaId === 'town-main' && o.kind === 'tree')!;
    const door = before.portals.find(p => p.id === 'home-enter')!.from;
    for (const point of [{ x: water % area.width, y: Math.floor(water / area.width) }, other, door]) {
      const candidate = outdoor.candidate({ ...tree, x: point.x, y: point.y }, true);
      expect(outdoor.issues(candidate).length).toBeGreaterThan(0);
      expect(() => host.commit(candidate)).toThrow();
      expect(host.document).toEqual(before);
    }
  });
  it('屋外でも既存NPCの編集と新NPCの追加/削除を保ち、元のキーの改変は拒否する', () => {
    const { host, outdoor } = fixture(), before = host.document;
    const old = before.interactions.find(i => i.areaId === 'town-main' && i.kind === 'npc')!;
    const next = host.document;
    next.interactions.find(i => i.id === old.id)!.name += 'さん'; host.commit(next);
    const free = freeCandidate(host, outdoor, outdoor.create('tree-green'), true).objects.find(o => o.id.startsWith('town-main-tree-'))!;
    const addition = host.document;
    const npc = { ...old, id: 'town-main-npc-1', eventKey: 'npc.town-main-npc-1', x: free.x, y: free.y };
    addition.interactions.push(npc); host.commit(addition);
    expect(host.document.catalogs.eventKeys).toContain(npc.eventKey);
    const removal = host.document; removal.interactions = removal.interactions.filter(i => i.id !== npc.id); host.commit(removal);
    expect(host.document.catalogs.eventKeys).not.toContain(npc.eventKey);
    const invalid = host.document; invalid.interactions.find(i => i.id === old.id)!.eventKey = `npc.${old.id}`;
    expect(() => host.commit(invalid)).toThrow();
  });
  it('無効な移動と回転では文書・履歴が変わらず、壊れた施設の連動も拒否する', () => {
    const { host, outdoor } = fixture(), before = host.document, home = before.objects.find(o => o.facilityId === 'home-family')!;
    expect(() => outdoor.move(home.id, -1, home.y)).toThrow();
    expect(() => outdoor.rotate(home.id)).toThrow('回転');
    const next = outdoor.candidate({ ...home, y: home.y + 1 });
    next.portals.find(p => p.id === 'home-enter')!.from.y--;
    expect(outdoor.issues(next).length).toBeGreaterThan(0);
    expect(() => host.commit(next)).toThrow();
    expect(host.document).toEqual(before); expect(host.session.canUndo).toBe(false);
  });
  it('ドラッグの全World検査を含む1候補の所要時間を測る（S2-13、Nodeでの目安）', () => {
    const { host, outdoor } = fixture(), home = host.document.objects.find(o => o.facilityId === 'home-family')!;
    const samples = Array.from({ length: 6 }, () => {
      const start = performance.now(), candidate = outdoor.candidate({ ...home, y: home.y + 1 });
      expect(outdoor.issues(candidate)).toEqual([]);
      return performance.now() - start;
    });
    console.log('OUTDOOR_VALIDATION_MS', JSON.stringify(samples));
    expect(Math.max(...samples)).toBeLessThanOrEqual(50);
  });
});
