import type { EditorDocument, EditorValidationContext } from '../editor/types';
import { withDerived } from '../editor/changes';
import { equal } from '../world/layouts/codec';
import { furnitureById, furnitureVariant } from '../render/furniture/catalog';
import { objectRotationRule, rotatedDimensions } from '../render/furniture/rotation';
import { isPlacedNpc, npcIssue } from './npc';

const reject = (message: string): never => { throw new Error(message); };
const fixed = (a: unknown, b: unknown, message: string) => { if (!equal(a,b)) reject(message); };

/** Keep the existing whole-world guard until the shared world policy is integrated. */
export function assertHomeWorldEdit(before: EditorDocument, after: EditorDocument, areaId: string, context?: EditorValidationContext): void {
  fixed(before.facilities,after.facilities,'施設は変更できません');
  fixed(before.portals,after.portals,'出入口は変更できません');
  fixed(before.start,after.start,'開始位置は変更できません');
  fixed(before.variant,after.variant,'年代の設定は変更できません');
  fixed(before.catalogs.sprites,after.catalogs.sprites,'見た目の参照は変更できません');
  if(context?.derived?.placedNpcEventKeys){
    for(const document of [before,after])fixed(document.catalogs.eventKeys,withDerived(document,context).catalogs.eventKeys,'会話の参照が人物と一致しません');
  }else fixed(before.catalogs.eventKeys,after.catalogs.eventKeys,'会話の参照は変更できません');
  for (const area of before.areas) {
    const candidate = after.areas.find(a => a.id === area.id);
    if (!candidate) reject('エリアは削除できません');
    const { surfaces: _, ...old } = area, { surfaces: __, ...next } = candidate!;
    fixed(old,next,'部屋の大きさと地形は変更できません');
    if (area.id !== areaId) fixed(area,candidate,'ほかのエリアは変更できません');
  }
  if (after.areas.length !== before.areas.length) reject('エリアは追加できません');
  fixed(before.objects.filter(o=>o.areaId!==areaId),after.objects.filter(o=>o.areaId!==areaId),'ほかのエリアは変更できません');
  fixed(before.interactions.filter(i=>i.areaId!==areaId),after.interactions.filter(i=>i.areaId!==areaId),'ほかのエリアは変更できません');
  assertInteriorEdit(before,after,areaId);
}

/** Area-local entity rules. Global metadata and cross-area return links belong to the world policy. */
export function assertInteriorEdit(before: EditorDocument, after: EditorDocument, areaId: string): void {
  if(!before.areas.some(a=>a.id===areaId)||!after.areas.some(a=>a.id===areaId))reject('編集する部屋が見つかりません');
  const localDoors=(document:EditorDocument)=>document.portals.filter(p=>p.areaId===areaId).map(({to:_,...p})=>p);
  fixed(localDoors(before),localDoors(after),'部屋の出入口は変更できません');
  const previous=before.interactions.filter(i=>i.areaId===areaId),current=after.interactions.filter(i=>i.areaId===areaId);
  for (const i of previous) {
    const j = current.find(j => j.id === i.id);
    if(!j){if(isPlacedNpc(i))continue;reject('元の人物と調べる場所は削除できません');}
    if (i.kind === 'npc') {
      const { x: _, y: __, facing: ___, sprite: ____, name: _____, lines: ______, ...meta } = i;
      const { x: a, y: b, facing: c, sprite: d, name: e, lines: f, ...changed } = j!;
      fixed(meta,changed,'元の人物のID・イベントキー・足元は変更できません');
      const problem=npcIssue(j!,after);if(problem)reject(problem);
    }
    else if (!i.objectId) fixed(i,j,'調べる場所の内容は変更できません');
    else {
      const { x: _, y: __, w: ___, h: ____, ...meta } = i;
      const { x: a, y: b, w: c, h: d, ...changed } = j!;
      fixed(meta,changed,'調べる場所の結び付きと内容は変更できません');
      const object = after.objects.find(o => o.id === i.objectId);
      if (!object || a !== object.x || b !== object.y || (c ?? 1) !== object.w || (d ?? 1) !== object.h)
        reject(`「${i.name}」が結び付いた家具は消せません`);
    }
  }
  for(const npc of current.filter(i=>!previous.some(original=>original.id===i.id))){
    if(!isPlacedNpc(npc)||!new RegExp(`^${areaId}-npc-[1-9][0-9]*$`).test(npc.id))reject('新しい人物の識別子が不正です');
    const problem=npcIssue(npc,after);if(problem)reject(problem);
  }
  for (const o of after.objects.filter(o => o.areaId === areaId)) {
    for (const p of after.portals) {
      if (p.areaId === areaId && o.x < p.from.x + (p.from.w ?? 1) && o.x + o.w > p.from.x &&
          o.y <= p.from.y && o.y + o.h > p.from.y) reject('出入口のマスには置けません');
      if (p.to.areaId === areaId && p.to.x >= o.x && p.to.x < o.x + o.w && p.to.y >= o.y && p.to.y < o.y + o.h)
        reject('出入口の到着位置には置けません');
    }
    const original = before.objects.find(p => p.id === o.id);
    if (original) {
      if (o.kind !== original.kind) reject('元の家具のkindは変更できません');
      const rule = objectRotationRule(original);
      if (!original.catalogId) {
        if (o.catalogId) reject('従来の家具にカタログIDは付けられません');
        const oldFacing = original.facing ?? 'down', newFacing = o.facing ?? 'down';
        if (!rule || rule.directions.length <= 1) {
          if (newFacing !== oldFacing) reject(rule?.reason || 'この家具は回せません');
          const { x: _, y: __, ...old } = original, { x: a, y: b, ...next } = o;
          fixed(old, next, '従来の家具は大きさと属性を保って移動します');
        } else {
          if (!rule.directions.includes(newFacing)) reject(rule.reason || 'この家具は指定された向きに回せません');
          const expected = rotatedDimensions(original, newFacing);
          if (o.w !== expected.w || o.h !== expected.h) reject('回転後の足元の大きさが一致しません');
          const { x: _1, y: _2, facing: _3, w: _4, h: _5, ...old } = original;
          const { x: _6, y: _7, facing: _8, w: _9, h: _10, ...next } = o;
          fixed(old, next, '従来の家具は属性を保って移動・回転します');
        }
      }
    } else if (!o.catalogId || !furnitureById(o.catalogId) || o.kind !== o.catalogId ||
        !new RegExp(`^${areaId}-${o.catalogId}-[1-9][0-9]*$`).test(o.id)) reject('新しい家具の識別子が不正です');
    if (o.catalogId) {
      const rule = objectRotationRule(o), facing = o.facing ?? 'down';
      if (rule && !rule.directions.includes(facing)) reject(rule.reason || 'この家具は指定された向きに回せません');
      const variant = furnitureVariant(o.catalogId, facing);
      if (!variant || o.w !== variant.w || o.h !== variant.h) reject('回転後の足元の大きさが一致しません');
    }
  }
}
