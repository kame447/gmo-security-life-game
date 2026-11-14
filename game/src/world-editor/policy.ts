import type { EditorDocument } from '../editor/types';
import { equal } from '../world/layouts/codec';
import { furnitureById } from '../render/furniture/catalog';

/** Phase-one policy, applied to direct save requests as well as UI gestures. */
export function assertInteriorEdit(before: EditorDocument, after: EditorDocument, areaId: string): void {
  const reject = (message: string): never => { throw new Error(message); };
  const fixed = (a: unknown, b: unknown, message: string) => { if (!equal(a,b)) reject(message); };
  fixed(before.facilities,after.facilities,'施設は変更できません');
  fixed(before.portals,after.portals,'出入口は変更できません');
  fixed(before.start,after.start,'開始位置は変更できません');
  fixed(before.variant,after.variant,'年代の設定は変更できません');
  fixed(before.catalogs,after.catalogs,'会話の参照は変更できません');
  for (const area of before.areas) {
    const candidate = after.areas.find(a => a.id === area.id);
    if (!candidate) reject('エリアは削除できません');
    const { surfaces: _, ...old } = area, { surfaces: __, ...next } = candidate!;
    fixed(old,next,'部屋の大きさと地形は変更できません');
    if (area.id !== areaId) fixed(area,candidate,'ほかのエリアは変更できません');
  }
  if (after.areas.length !== before.areas.length) reject('エリアは追加できません');
  const ids = before.interactions.map(i => i.id).sort();
  fixed(ids,after.interactions.map(i => i.id).sort(),'人物と調べる場所は追加・削除できません');
  for (const i of before.interactions) {
    const j = after.interactions.find(j => j.id === i.id)!;
    if (i.areaId !== areaId || !i.objectId) fixed(i,j,'人物と会話は変更できません');
    else {
      const { x: _, y: __, w: ___, h: ____, ...meta } = i;
      const { x: a, y: b, w: c, h: d, ...changed } = j;
      fixed(meta,changed,'調べる場所の結び付きと内容は変更できません');
      const object = after.objects.find(o => o.id === i.objectId);
      if (!object || a !== object.x || b !== object.y || (c ?? 1) !== object.w || (d ?? 1) !== object.h)
        reject(`「${i.name}」が結び付いた家具は消せません`);
    }
  }
  fixed(before.objects.filter(o => o.areaId !== areaId), after.objects.filter(o => o.areaId !== areaId),'ほかのエリアは変更できません');
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
      if (!o.catalogId) {
        const { x: _, y: __, ...old } = original, { x: a, y: b, ...next } = o;
        fixed(old,next,'従来の家具は大きさと属性を保って移動します');
      }
    } else if (!o.catalogId || !furnitureById(o.catalogId) || o.kind !== o.catalogId ||
        !new RegExp(`^${areaId}-${o.catalogId}-[1-9][0-9]*$`).test(o.id)) reject('新しい家具の識別子が不正です');
  }
}
