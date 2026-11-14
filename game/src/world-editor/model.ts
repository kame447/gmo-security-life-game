import { EditorSession, diffDocuments, parseDocument, validateDocument, type EditorDocument, type EditorObject } from '../editor';
import { assembleEditorWorld } from '../editor/runtime';
import type { EditorValidationContext } from '../editor/types';
import type { World } from '../world/runtime';
import { furnitureById, furnitureVariant, nextFacing } from '../render/furniture/catalog';
import { assertWorldEdit } from './world-policy';
import { worldDocument } from './document';
import { withDerived } from '../editor/changes';
import { trustedContext } from './trusted-context';

export const HOME_AREA = 'home-family-interior';
export class WorldEditorModel {
  readonly context: EditorValidationContext;
  readonly initial: EditorDocument;
  session: EditorSession;
  private readonly used = new Set<string>();
  constructor(world: World) {
    this.context = trustedContext(world);
    this.initial = parseDocument(withDerived(worldDocument(world),this.context), this.context);
    this.session = new EditorSession(this.initial, { context: this.context });
    for (const list of [this.initial.objects,this.initial.interactions,this.initial.portals]) for (const item of list) this.used.add(item.id);
  }
  get document() { return this.session.document; }
  get dirty() { return this.session.exportChanges().operations.length; }
  object(id: string, document = this.document) { return document.objects.find(o => o.id === id && o.areaId === HOME_AREA); }
  protectedReason(id: string) {
    const links = this.initial.interactions.filter(i => i.objectId === id);
    return links.length ? `「${links.map(i => i.name).join('・')}」が結び付いているので、消せません` : '';
  }
  candidate(object: EditorObject, adding = false): EditorDocument {
    const next = this.document;
    if (adding) next.objects.push(structuredClone(object));
    else {
      const i = next.objects.findIndex(o => o.id === object.id);
      if (i < 0) throw new Error('家具が見つかりません');
      next.objects[i] = structuredClone(object);
      for (const linked of next.interactions.filter(i => i.objectId === object.id)) {
        linked.x = object.x; linked.y = object.y; linked.w = object.w; linked.h = object.h;
      }
    }
    return withDerived(next,this.context);
  }
  issues(candidate: EditorDocument): string[] {
    let derived: EditorDocument;
    try { derived=withDerived(candidate,this.context);assertWorldEdit(this.initial,derived,this.context); }
    catch (error) { return [(error as Error).message]; }
    return validateDocument(derived,this.context).map(issue => {
      if (issue.code === 'arrival') return '出入口の到着位置をふさぐことはできません';
      if (issue.code === 'unreachable') return '出入口や調べる場所への通路を保ってください';
      if (issue.code === 'overlap') return '壁やほかの家具と重なっています';
      return issue.message;
    });
  }
  commit(candidate: EditorDocument) {
    candidate=withDerived(candidate,this.context);
    const errors = this.issues(candidate); if (errors.length) throw new Error(errors[0]);
    const changes = diffDocuments(this.document,candidate,this.context);
    this.session.commit(changes.operations);
  }
  move(id: string, x: number, y: number) {
    const object = this.object(id); if (!object) throw new Error('家具を選んでください');
    this.commit(this.candidate({ ...object, x, y }));
  }
  rotate(id: string) {
    const o = this.object(id); if (!o?.catalogId) throw new Error('この家具の回転用の絵は、まだカタログにありません');
    const facing = nextFacing(o.catalogId,o.facing), variant = furnitureVariant(o.catalogId,facing)!;
    this.commit(this.candidate({ ...o, facing, w: variant.w, h: variant.h }));
  }
  remove(id: string) {
    const reason = this.protectedReason(id); if (reason) throw new Error(reason);
    if (!this.object(id)) throw new Error('家具を選んでください');
    const next = this.document; next.objects = next.objects.filter(o => o.id !== id); this.commit(next);
  }
  create(catalogId: string): EditorObject {
    const entry = furnitureById(catalogId), variant = furnitureVariant(catalogId);
    if (!entry || !variant) throw new Error('カタログにない家具です');
    let n = 1, id = `${HOME_AREA}-${catalogId}-${n}`;
    while (this.used.has(id)) id = `${HOME_AREA}-${catalogId}-${++n}`;
    this.used.add(id);
    return { id, areaId: HOME_AREA, kind: catalogId, catalogId, facing: variant.facing, x: 1, y: 1,
      w: variant.w, h: variant.h, solid: entry.solid, layer: entry.layer };
  }
  duplicate(id: string) {
    const o = this.object(id); if (!o?.catalogId) throw new Error('この家具はカタログ移行後に複製できます');
    return { ...o, kind: o.catalogId, id: this.create(o.catalogId).id };
  }
  runtime(document = this.document) {
    const edited=assembleEditorWorld(document),source=this.context.baselineWorld;
    // Normalization orders authoring tables by ID. Preserve untouched game arrays,
    // including tied sprite depths, in their original order for the actual view.
    return { ...edited,areas:new Map([...source.areas].map(([id,area])=>[id,
      id===HOME_AREA?edited.areas.get(id)!:structuredClone(area)])),facilities:structuredClone(source.facilities) };
  }
  markSaved() { this.session = new EditorSession(this.document, { context: this.context }); }
}
