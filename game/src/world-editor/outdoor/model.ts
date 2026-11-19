import { cloneDocument, withDerivedView } from '../../editor/changes';
import { validateDocument } from '../../editor/schema';
import type { EditorDocument, EditorObject } from '../../editor/types';
import { outdoorById, outdoorReadOnlyReason } from '../../render/outdoor/catalog';
import { assertWorldEdit } from '../world-policy';
import { outdoorProtectedReason } from './policy';
import type { OutdoorHost, OutdoorModelApi } from './types';

/** Shares the application's one commit/Undo/Redo stream; owns only issued IDs. */
export class OutdoorModel implements OutdoorModelApi {
  private readonly used = new Set<string>();
  constructor(private readonly host: OutdoorHost, readonly areaId = 'town-main') {
    for (const list of [host.initial.areas, host.initial.facilities, host.initial.objects, host.initial.interactions, host.initial.portals])
      for (const item of list) this.used.add(item.id);
  }
  object(id: string, document = this.host.document) { return document.objects.find(o => o.id === id && o.areaId === this.areaId); }
  readOnlyReason(id: string) {
    const object = this.object(id); return object ? outdoorReadOnlyReason(object.kind) ?? '' : '屋外の物を選んでください';
  }
  protectedReason(id: string) {
    const doc = this.host.document, object = this.object(id, doc);
    return object ? outdoorProtectedReason(doc, object) : '屋外の物を選んでください';
  }
  rotationReason(_id: string) { return '屋外の物には回転用の絵がないため回せません'; }
  rotate(id: string): never { throw new Error(this.rotationReason(id)); }
  candidate(object: EditorObject, adding = false): EditorDocument {
    const next = cloneDocument(this.host.document), old = this.object(object.id, next);
    if (object.areaId !== this.areaId) throw new Error('同じまちの中で移動してください');
    if (adding) {
      if (next.objects.some(o => o.id === object.id)) throw new Error('識別子が重複しています');
      next.objects.push(structuredClone(object));
    } else {
      if (!old) throw new Error('屋外の物を選んでください');
      const reason = outdoorReadOnlyReason(old.kind); if (reason) throw new Error(reason);
      const dx = object.x - old.x, dy = object.y - old.y;
      const group = next.objects.filter(o => o.id === old.id || (old.facilityId && o.areaId === this.areaId && o.facilityId === old.facilityId));
      const ids = new Set(group.map(o => o.id));
      for (const interaction of next.interactions) if (interaction.areaId === this.areaId && interaction.kind !== 'npc' &&
        ((interaction.objectId && ids.has(interaction.objectId)) || group.some(o => o.facilityId && interaction.x >= o.x && interaction.y >= o.y &&
          interaction.x + (interaction.w ?? 1) <= o.x + o.w && interaction.y + (interaction.h ?? 1) <= o.y + o.h))) {
        interaction.x += dx; interaction.y += dy;
      }
      for (const o of group) { o.x += dx; o.y += dy; }
      next.objects[next.objects.findIndex(o => o.id === object.id)] = structuredClone(object);
      if (old.facilityId) for (const portal of next.portals.filter(p => p.facilityId === old.facilityId)) {
        if (portal.areaId === this.areaId) { portal.from.x += dx; portal.from.y += dy; }
        if (portal.to.areaId === this.areaId) { portal.to.x += dx; portal.to.y += dy; }
      }
    }
    return withDerivedView(next, this.host.context);
  }
  issues(candidate: EditorDocument): string[] {
    try {
      const derived = withDerivedView(candidate, this.host.context);
      assertWorldEdit(this.host.initial, derived, this.host.context);
      return validateDocument(derived, this.host.context).map(issue => issue.message);
    } catch (error) { return [(error as Error).message]; }
  }
  private id(kind: string) {
    for (const list of [this.host.document.areas, this.host.document.facilities, this.host.document.objects, this.host.document.interactions, this.host.document.portals])
      for (const item of list) this.used.add(item.id);
    let n = 1; while (this.used.has(`${this.areaId}-${kind}-${n}`)) n++;
    const id = `${this.areaId}-${kind}-${n}`; this.used.add(id); return id;
  }
  create(entryId: string): EditorObject {
    const entry = outdoorById(entryId); if (!entry) throw new Error('まちの一覧にある物を選んでください');
    return { id: this.id(entry.kind), areaId: this.areaId, kind: entry.kind,
      ...(entry.style !== undefined ? { style: entry.style } : {}), x: 1, y: 1, w: entry.w, h: entry.h, solid: entry.solid, layer: entry.layer };
  }
  duplicate(id: string): EditorObject {
    const reason = this.protectedReason(id); if (reason) throw new Error(reason);
    const o = this.object(id)!; return { ...o, id: this.id(o.kind) };
  }
  move(id: string, x: number, y: number) {
    const o = this.object(id); if (!o) throw new Error('屋外の物を選んでください');
    this.host.commit(this.candidate({ ...o, x, y }));
  }
  remove(id: string) {
    const reason = this.protectedReason(id); if (reason) throw new Error(reason);
    const next = structuredClone(this.host.document); next.objects = next.objects.filter(o => o.id !== id); this.host.commit(next);
  }
}
