import { EditorSession, diffDocuments, parseDocument, validateDocument, type EditorDocument, type EditorObject, type EditorInteraction } from '../editor';
import { assembleEditorWorld } from '../editor/runtime';
import type { EditorValidationContext } from '../editor/types';
import { toRuntime, type World } from '../world/runtime';
import { furnitureById, furnitureVariant } from '../render/furniture/catalog';
import { rotatedObjectVariant } from '../render/furniture/rotation';
import { assertWorldEdit } from './world-policy';
import { worldDocument } from './document';
import { withDerived } from '../editor/changes';
import { trustedContext } from './trusted-context';
import { editablePerson, isPlacedNpc, npcEventKey } from './npc';

const requireAreaId = (areaId: string) => { if (!areaId) throw new Error('エリアを指定してください'); return areaId; };

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
  object(id: string, document = this.document, areaId = HOME_AREA) { return document.objects.find(o => o.id === id && o.areaId === areaId); }
  npc(id: string, document = this.document, areaId: string) {
    requireAreaId(areaId);
    return document.interactions.find(i => i.id === id && i.areaId === areaId && i.kind === 'npc');
  }
  npcProtectedReason(id: string, areaId: string) {
    const npc=this.npc(id,undefined,requireAreaId(areaId));return npc&&!isPlacedNpc(npc)?'ゲームの出来事につながっている人物なので、消せません':'';
  }
  npcCandidate(npc: EditorInteraction, adding = false): EditorDocument {
    const next=this.document,index=next.interactions.findIndex(i=>i.id===npc.id);
    if(adding)next.interactions.push(structuredClone(npc));
    else{if(index<0)throw new Error('人物を選んでください');next.interactions[index]=structuredClone(npc);}
    return withDerived(next,this.context);
  }
  createNpc(sprite: string, areaId: string): EditorInteraction {
    requireAreaId(areaId);
    const entry=editablePerson(sprite);if(!entry)throw new Error('人のカタログにある見た目を選んでください');
    let n=1,id=`${areaId}-npc-${n}`;
    while(this.used.has(id))id=`${areaId}-npc-${++n}`;
    this.used.add(id);
    return{id,areaId,kind:'npc',sprite,name:entry.name,x:1,y:1,facing:'down',solid:true,
      eventKey:npcEventKey(id),lines:['こんにちは。']};
  }
  removeNpc(id: string, areaId: string) {
    const reason=this.npcProtectedReason(id,requireAreaId(areaId));if(reason)throw new Error(reason);
    if(!this.npc(id,undefined,areaId))throw new Error('人物を選んでください');
    const next=this.document;next.interactions=next.interactions.filter(npc=>npc.id!==id);this.commit(next);
  }
  updateNpc(id: string, patch: Partial<Pick<EditorInteraction,'x'|'y'|'facing'|'name'|'lines'|'sprite'>>, areaId: string) {
    const npc=this.npc(id,undefined,requireAreaId(areaId));if(!npc)throw new Error('人物を選んでください');
    this.commit(this.npcCandidate({...npc,...structuredClone(patch)}));
  }
  rotateNpc(id: string, areaId: string) {
    const npc=this.npc(id,undefined,requireAreaId(areaId));if(!npc)throw new Error('人物を選んでください');
    const directions=['down','left','up','right'] as const;
    this.updateNpc(id,{facing:directions[(directions.indexOf(npc.facing??'down')+1)%directions.length]},areaId);
  }
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
  move(id: string, x: number, y: number, areaId = HOME_AREA) {
    const object = this.object(id,undefined,areaId); if (!object) throw new Error('家具を選んでください');
    this.commit(this.candidate({ ...object, x, y }));
  }
  rotate(id: string, areaId = HOME_AREA) {
    const o = this.object(id,undefined,areaId); if (!o) throw new Error('家具を選んでください');
    const next = rotatedObjectVariant(o);
    this.commit(this.candidate({ ...o, ...next }));
  }
  remove(id: string, areaId = HOME_AREA) {
    const reason = this.protectedReason(id); if (reason) throw new Error(reason);
    if (!this.object(id,undefined,areaId)) throw new Error('家具を選んでください');
    const next = this.document; next.objects = next.objects.filter(o => o.id !== id); this.commit(next);
  }
  create(catalogId: string, areaId = HOME_AREA): EditorObject {
    const entry = furnitureById(catalogId), variant = furnitureVariant(catalogId);
    if (!entry || !variant) throw new Error('カタログにない家具です');
    let n = 1, id = `${areaId}-${catalogId}-${n}`;
    while (this.used.has(id)) id = `${areaId}-${catalogId}-${++n}`;
    this.used.add(id);
    return { id, areaId, kind: catalogId, catalogId, facing: variant.facing, x: 1, y: 1,
      w: variant.w, h: variant.h, solid: entry.solid, layer: entry.layer };
  }
  duplicate(id: string, areaId = HOME_AREA) {
    const o = this.object(id,undefined,areaId); if (!o?.catalogId) throw new Error('この家具はカタログ移行後に複製できます');
    return { ...o, kind: o.catalogId, id: this.create(o.catalogId,areaId).id };
  }
  runtime(document = this.document, editedAreaIds: readonly string[] = [HOME_AREA]) {
    const edited=assembleEditorWorld(document),source=this.context.baselineWorld;
    // Normalization orders authoring tables by ID. Preserve untouched game arrays,
    // including tied sprite depths, in their original order for the actual view.
    return { ...edited,areas:new Map([...source.areas].map(([id,area])=>{
      if(!editedAreaIds.includes(id))return[id,structuredClone(area)];
      const current=edited.areas.get(id)!;if(current.def.kind!=='outdoor')return[id,current];
      const ordered=<T extends {id?:string}>(values:T[],original:T[])=>{
        const order=new Map(original.map((item,index)=>[item.id,index]));
        return [...values].sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER));
      };
      return[id,toRuntime({...current.def,objects:ordered(current.def.objects,area.def.objects),
        interactions:ordered(current.def.interactions,area.def.interactions),portals:ordered(current.def.portals,area.def.portals)})];
    })),facilities:structuredClone(source.facilities) };
  }
  markSaved() { this.session = new EditorSession(this.document, { context: this.context }); }
}
