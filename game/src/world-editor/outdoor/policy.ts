import type { EditorDocument, EditorObject } from '../../editor/types';
import { assembleEditorWorld } from '../../editor/runtime';
import { outdoorForObject, outdoorReadOnlyReason } from '../../render/outdoor/catalog';
import { LANDMARKS } from '../../world';
import { equal } from '../../world/layouts/codec';
import { isRoad, T } from '../../world/tiles';
import { isSolidTile } from '../../world/runtime';
import { isPlacedNpc, npcIssue } from '../npc';
import type { OutdoorEditContext } from './types';

const fixed = (a: unknown, b: unknown, reason: string) => { if (!equal(a, b)) throw new Error(reason); };
const contains = (o: EditorObject, x: number, y: number) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
const attributes = ({ id: _, x: __, y: ___, ...o }: EditorObject) => o;
const fixedPoints = () => [LANDMARKS.schoolGate, LANDMARKS.stationFront, LANDMARKS.parkPlaza, LANDMARKS.shoppingStreet];

export function outdoorProtectedReason(document: EditorDocument, object: EditorObject): string {
  return outdoorReadOnlyReason(object.kind) ?? (object.facilityId ? '施設の建物は消したり複製したりできません' :
    document.interactions.some(i => i.objectId === object.id) ? '調べる場所が結び付いているため消したり複製したりできません' : '');
}

/** Portal-aware flood, including fixed landmarks that the general entity validator does not target. */
function assertLandmarkAccess(document: EditorDocument, areaId: string): void {
  const world = assembleEditorWorld(document), visited = new Map([...world.areas].map(([id, a]) => [id, new Uint8Array(a.width * a.height)]));
  const queue: { areaId: string; x: number; y: number }[] = [];
  const add = (id: string, x: number, y: number) => {
    const a = world.areas.get(id);
    if (!a || isSolidTile(a, x, y)) return;
    const seen = visited.get(id)!, index = y * a.width + x;
    if (!seen[index]) { seen[index] = 1; queue.push({ areaId: id, x, y }); }
  };
  add(document.start.areaId, document.start.x, document.start.y);
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index], a = world.areas.get(p.areaId)!;
    const door = a.portalAt.get(p.y * a.width + p.x);
    if (door) add(door.to.areaId, door.to.x, door.to.y);
    else for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) add(p.areaId, p.x + dx, p.y + dy);
  }
  const a = world.areas.get(areaId)!;
  if (fixedPoints().some(p => !visited.get(areaId)![p.y * a.width + p.x]) ||
      !visited.get(document.start.areaId)?.[document.start.y * world.areas.get(document.start.areaId)!.width + document.start.x])
    throw new Error('目印の場所をふさぐことはできません');
}

/** Area-local rules 6–10. Terrain/collision/facility-link validity also uses validateDocument. */
export function assertOutdoorEdit(before: EditorDocument, after: EditorDocument, { areaId }: OutdoorEditContext): void {
  const area = before.areas.find(a => a.id === areaId), nextArea = after.areas.find(a => a.id === areaId);
  if (!area || area.kind !== 'outdoor' || !nextArea) throw new Error('編集するまちが見つかりません');
  fixed(area, nextArea, 'まちの地面・地区・大きさは変更できません');
  fixed(before.facilities, after.facilities, '施設は変更できません');
  fixed(before.variant, after.variant, '年代の設定は変更できません');
  const previous = before.objects.filter(o => o.areaId === areaId), current = after.objects.filter(o => o.areaId === areaId);
  const byId = new Map(current.map(o => [o.id, o]));
  const points = [...fixedPoints(), ...(after.start.areaId === areaId ? [after.start] : [])];
  for (const old of previous) {
    const next = byId.get(old.id), reason = outdoorReadOnlyReason(old.kind);
    if (reason) { fixed(old, next, reason); continue; }
    if (!next) {
      const protection = outdoorProtectedReason(before, old);
      if (protection) throw new Error(protection);
    } else fixed(attributes(old), attributes(next), '屋外の物は大きさ・種類・属性を保って移動します');
  }
  for (const object of current) {
    const old = previous.find(o => o.id === object.id);
    if (!old) {
      const entry = outdoorForObject(object);
      if (!entry || object.catalogId || object.facilityId || !new RegExp(`^${areaId}-${object.kind}-[1-9][0-9]*$`).test(object.id))
        throw new Error('まちの一覧にある物と新しい識別子を使ってください');
      const shape = { areaId, kind: entry.kind, ...(entry.style !== undefined ? { style: entry.style } : {}),
        w: entry.w, h: entry.h, solid: entry.solid, layer: entry.layer };
      if (!equal(attributes(object), shape) && !previous.some(source => !outdoorProtectedReason(before, source) && equal(attributes(source), attributes(object))))
        throw new Error('新しい物は一覧の大きさと属性、複製は元の物の大きさと属性を使ってください');
    }
    if (points.some(p => contains(object, p.x, p.y))) throw new Error('目印の場所をふさぐことはできません');
    if (old && equal(old, object)) continue; // Keep untouched source overlaps, never extend their exemption.
    for (let y = object.y; y < object.y + object.h; y++) for (let x = object.x; x < object.x + object.w; x++) {
      const tile = nextArea.ground[y * nextArea.width + x];
      if (isRoad(tile) || tile === T.BRIDGE || tile === T.CROSSING) throw new Error('車道・横断歩道・橋・踏切の上には置けません');
      if (object.solid && outdoorForObject(object)?.category === 'building' && tile === T.SIDEWALK)
        throw new Error('建物は歩道の上には置けません');
    }
  }
  for (const door of before.portals.filter(p => p.areaId === areaId)) {
    const next = after.portals.find(p => p.id === door.id);
    if (!next) throw new Error('まちの出入口は削除できません');
    const source = previous.find(o => o.facilityId && o.facilityId === door.facilityId), moved = source && byId.get(source.id);
    const dx = source && moved ? moved.x - source.x : 0, dy = source && moved ? moved.y - source.y : 0;
    fixed({ ...door, from: { ...door.from, x: door.from.x + dx, y: door.from.y + dy } }, next,
      '出入口は同じ施設の建物と一緒に移動してください');
  }
  const oldTargets = before.interactions.filter(i => i.areaId === areaId), targets = after.interactions.filter(i => i.areaId === areaId);
  for (const old of oldTargets) {
    const next = targets.find(i => i.id === old.id);
    if (!next) { if (isPlacedNpc(old)) continue; throw new Error('元の人物と調べる場所は削除できません'); }
    if (old.kind === 'npc') {
      const { x: _, y: __, facing: ___, sprite: ____, name: _____, lines: ______, ...meta } = old;
      const { x: a, y: b, facing: c, sprite: d, name: e, lines: f, ...changed } = next;
      fixed(meta, changed, '元の人物のID・イベントキー・足元は変更できません');
      const problem = npcIssue(next, after); if (problem) throw new Error(problem);
    } else {
      const source = previous.find(o => old.objectId === o.id || (o.facilityId && contains(o, old.x, old.y) &&
        contains(o, old.x + (old.w ?? 1) - 1, old.y + (old.h ?? 1) - 1)));
      const moved = source && byId.get(source.id);
      fixed({ ...old, x: old.x + (source && moved ? moved.x - source.x : 0), y: old.y + (source && moved ? moved.y - source.y : 0) }, next,
        '調べる場所は内容を保って結び付いた物と一緒に移動してください');
    }
  }
  for (const npc of targets) {
    if (points.some(p => p.x === npc.x && p.y === npc.y)) throw new Error('目印の場所をふさぐことはできません');
    if (oldTargets.some(i => i.id === npc.id)) continue;
    if (!isPlacedNpc(npc) || !new RegExp(`^${areaId}-npc-[1-9][0-9]*$`).test(npc.id)) throw new Error('新しい人物の識別子が不正です');
    const problem = npcIssue(npc, after); if (problem) throw new Error(problem);
  }
  assertLandmarkAccess(after, areaId);
}
