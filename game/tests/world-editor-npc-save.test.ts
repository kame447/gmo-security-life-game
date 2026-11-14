import {describe,expect,it} from 'vitest';
import {buildWorld} from '../src/world';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {prepareSave} from '../src/world-editor/persistence';
import {worldDocument} from '../src/world-editor/document';
import {trustedContext} from '../src/world-editor/trusted-context';
import {withDerived} from '../src/editor/changes';
import {parseDocument} from '../src/editor/schema';
import {assembleEditorWorld} from '../src/editor/runtime';
import {layoutArea,type AreaLayout} from '../src/world/layouts/codec';
import type {World} from '../src/world/runtime';

function reopen(layout:AreaLayout,world:World){
  const document=worldDocument(world),source=world.areas.get(HOME_AREA)!.def,house=layoutArea(layout,source);
  Object.assign(document.areas.find(a=>a.id===HOME_AREA)!,layout.area);
  document.objects=[...document.objects.filter(o=>o.areaId!==HOME_AREA),...house.objects.map(o=>({...o,id:o.id!,areaId:HOME_AREA}))];
  document.interactions=[...document.interactions.filter(i=>i.areaId!==HOME_AREA),...layout.interactions.map(i=>({...i,areaId:HOME_AREA}))];
  document.portals=[...document.portals.filter(p=>p.areaId!==HOME_AREA),...house.portals.map(p=>({...p,areaId:HOME_AREA}))];
  const context=trustedContext(world);
  return new WorldEditorModel(assembleEditorWorld(parseDocument(withDerived(document,context),context)));
}
describe('NPCの編集と自宅配置JSONの往復',()=>{
  it('位置/向き/名前/会話/既存キーをJSONの保存・再起動・次回保存で厳密に保つ',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world),before=model.document;
    model.updateNpc('home-mother',{y:6,facing:'right',name:'検証用の表示名',lines:['「こんにちは」','<b>文字として扱う会話</b>']});
    const saved=JSON.parse(prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges()},world).text) as AreaLayout;
    const resumed=reopen(saved,world);expect(resumed.document).toEqual(model.document);
    expect(resumed.npc('home-mother')).toMatchObject({id:'home-mother',eventKey:'home.mother',y:6,facing:'right'});
    expect(resumed.npcProtectedReason('home-mother')).toContain('消せません');
    expect(resumed.document.objects).toEqual(before.objects);expect(resumed.document.portals).toEqual(before.portals);
    resumed.updateNpc('home-mother',{name:'次の保存の検証'});
    const again=prepareSave({areaId:HOME_AREA,changes:resumed.session.exportChanges()},resumed.runtime(resumed.initial));
    expect(JSON.parse(again.text).interactions.find((i:{id:string})=>i.id==='home-mother').name).toBe('次の保存の検証');
  });
  it('直接の保存要求でも元NPCの削除と自己キー付替えを拒否する',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world),baseDocument=model.document,mother=model.npc('home-mother')!;
    for(const operation of [{type:'delete',table:'interactions',id:mother.id,before:mother},
      {type:'update',table:'interactions',id:mother.id,before:mother,after:{...mother,eventKey:`npc.${mother.id}`}}]){
      expect(()=>prepareSave({areaId:HOME_AREA,changes:{schemaVersion:1,documentId:baseDocument.id,baseDocument,operations:[operation]}},world)).toThrow();
      expect(model.document).toEqual(baseDocument);
    }
  });
  it('追加→保存→開き直し→削除→次回保存でキーを残さず、再開後も置いた人だけを消せる',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world),npc={...model.createNpc('grandma'),x:4,y:7};
    model.commit(model.npcCandidate(npc,true));model.updateNpc(npc.id,{name:'保存した人',lines:['保存して開き直す会話'],facing:'left'});
    const saved=JSON.parse(prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges()},world).text) as AreaLayout;
    const resumed=reopen(saved,world),baseline=resumed.runtime(resumed.initial);
    expect(resumed.document).toEqual(model.document);expect(resumed.npcProtectedReason(npc.id)).toBe('');
    expect(resumed.npcProtectedReason('home-mother')).toContain('消せません');
    resumed.removeNpc(npc.id);expect(resumed.document.catalogs.eventKeys).not.toContain(npc.eventKey);
    resumed.session.undo();expect(resumed.npc(npc.id)).toEqual(model.npc(npc.id));
    resumed.session.redo();expect(resumed.npc(npc.id)).toBeUndefined();
    const deleted=JSON.parse(prepareSave({areaId:HOME_AREA,changes:resumed.session.exportChanges()},baseline).text) as AreaLayout;
    const again=reopen(deleted,baseline);expect(again.document).toEqual(resumed.document);
    expect(again.document.catalogs.eventKeys).not.toContain(npc.eventKey);
    again.updateNpc('home-mother',{lines:['次の保存も一致します']});
    expect(()=>prepareSave({areaId:HOME_AREA,changes:again.session.exportChanges()},again.runtime(again.initial))).not.toThrow();
  });
});
