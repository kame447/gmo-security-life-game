import {describe,expect,it} from 'vitest';
import {applyChangeSet,createChangeSet,diffDocuments,loadChangeSet,previewChangeSet,serializeChangeSet,withDerived} from '../src/editor/changes';
import {EditorSession} from '../src/editor/history';
import {parseDocument,validateDocument} from '../src/editor/schema';
import {assembleEditorWorld} from '../src/editor/runtime';
import type {EditorDocument,EditorInteraction,EditorValidationContext,EditOperation} from '../src/editor/types';
import {buildWorld} from '../src/world';
import {worldDocument} from '../src/world-editor/document';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {prepareSave} from '../src/world-editor/persistence';
import {trustedContext} from '../src/world-editor/trusted-context';

function fixture(){
  const world=buildWorld(),context=trustedContext(world),document=parseDocument(withDerived(worldDocument(world),context),context);
  return{world,context,document};
}
function npc():EditorInteraction{
  const id=`${HOME_AREA}-npc-1`;
  return{id,areaId:HOME_AREA,kind:'npc',name:'検証用の人',sprite:'mother',x:8,y:6,w:1,h:1,solid:true,
    facing:'down',eventKey:`npc.${id}`,lines:['検証用の会話です。']};
}
function houseMove(document:EditorDocument):EditOperation[]{
  const object=document.objects.find(o=>o.facilityId==='home-family')!;
  const enter=document.portals.find(p=>p.id==='home-enter')!,exit=document.portals.find(p=>p.id==='home-exit')!;
  return[{type:'move',table:'objects',id:object.id,before:object,after:{...object,y:object.y+1}},
    {type:'move',table:'portals',id:enter.id,before:enter,after:{...enter,from:{...enter.from,y:enter.from.y+1}}},
    {type:'update',table:'portals',id:exit.id,before:exit,after:{...exit,to:{...exit.to,y:exit.to.y+1}}}];
}

describe('信頼済みの宣言による開始位置とNPCイベントキー',()=>{
  it('宣言なしの既存APIは開始位置とcatalogsの変更を拒否したまま',()=>{
    const{document,world}=fixture(),original=structuredClone(document),strict={baselineWorld:world};
    expect(withDerived(document)).toBe(document);
    expect(withDerived(document,strict)).toBe(document);expect(validateDocument(document,strict)).toEqual([]);
    expect(()=>createChangeSet(document,houseMove(document),strict)).toThrow();
    expect(()=>createChangeSet(document,[{type:'add',table:'interactions',id:npc().id,after:npc()}],strict)).toThrow();
    const altered=structuredClone(document);altered.start.x++;
    expect(()=>diffDocuments(document,altered,strict)).toThrow();
    altered.start=structuredClone(document.start);altered.catalogs.eventKeys.push('unreferenced.key');
    expect(validateDocument(altered,strict)).toEqual([]);expect(()=>diffDocuments(document,altered,strict)).toThrow();expect(document).toEqual(original);
  });
  it('家を1マス南へ動かす3操作で開始位置を導き、Undo/Redo/差分の下書きで保つ',()=>{
    const{document,context}=fixture(),session=new EditorSession(document,{context});
    session.commit(houseMove(document));
    expect(session.document.start).toEqual({areaId:'town-main',x:35,y:33,facing:'down'});
    expect(validateDocument(session.document,context)).toEqual([]);
    const moved=session.document;session.undo();expect(session.document).toEqual(document);session.redo();expect(session.document).toEqual(moved);
    const serialized=serializeChangeSet(session.exportChanges(),context),loaded=loadChangeSet(serialized,context);
    expect(loaded.operations).toHaveLength(3);expect(loaded.operations.every(op=>['objects','portals'].includes(op.table))).toBe(true);
    expect(previewChangeSet(document,loaded,context).document).toEqual(moved);
    expect(worldDocument(assembleEditorWorld(moved)).start).toEqual(moved.start);
  });
  it('NPC追加/削除とUndo/Redoは参照キーも一緒に更新する',()=>{
    const{document,context}=fixture(),person=npc(),session=new EditorSession(document,{context});
    session.commit([{type:'add',table:'interactions',id:person.id,after:person}]);
    expect(session.document.catalogs.eventKeys).toContain(person.eventKey);
    const added=session.document;session.undo();expect(session.document).toEqual(document);session.redo();expect(session.document).toEqual(added);
    session.commit([{type:'delete',table:'interactions',id:person.id,before:person}]);
    expect(session.document.catalogs.eventKeys).not.toContain(person.eventKey);expect(session.document).toEqual(document);
    session.undo();expect(session.document).toEqual(added);
  });
  it('保存して開き直したNPCを消してもキーが残らず、その次の保存も競合しない',()=>{
    const{document,context}=fixture(),person=npc();
    const added=applyChangeSet(document,createChangeSet(document,[{type:'add',table:'interactions',id:person.id,after:person}],context),context);
    const reopenedWorld=assembleEditorWorld(added),reopenedContext=trustedContext(reopenedWorld);
    const reopened=parseDocument(worldDocument(reopenedWorld),reopenedContext),session=new EditorSession(reopened,{context:reopenedContext});
    const loadedPerson=reopened.interactions.find(i=>i.id===person.id)!;
    session.commit([{type:'delete',table:'interactions',id:person.id,before:loadedPerson}]);
    const removed=session.document;expect(removed.catalogs.eventKeys).not.toContain(person.eventKey);
    const saved=previewChangeSet(reopened,session.exportChanges(),reopenedContext).document;
    expect(saved).toEqual(removed);expect(parseDocument(worldDocument(assembleEditorWorld(saved)),reopenedContext)).toEqual(saved);
    const mother=removed.interactions.find(i=>i.id==='home-mother')!;
    session.commit([{type:'update',table:'interactions',id:mother.id,before:mother,after:{...mother,name:'検証用の名前'}}]);
    expect(previewChangeSet(reopened,session.exportChanges(),reopenedContext).document).toEqual(session.document);
  });
  it('同じキーを別の対象が使っている限り、NPCを消しても共有キーを残す',()=>{
    const{document,world}=fixture(),person=npc();
    document.interactions.push(person,{id:'home-shared-note',areaId:HOME_AREA,kind:'object',name:'検証用のメモ',x:9,y:6,
      solid:false,eventKey:person.eventKey,lines:['共有キーの検証です。']});document.catalogs.eventKeys.push(person.eventKey);
    const source=parseDocument(document,{baselineWorld:world}),context=trustedContext(assembleEditorWorld(source));
    const changes=createChangeSet(source,[{type:'delete',table:'interactions',id:person.id,before:person}],context);
    expect(applyChangeSet(source,changes,context).catalogs.eventKeys).toContain(person.eventKey);
  });
  it('元のキーの変更、自分用キーへの付替え、偽キーと不正な導出宣言を拒否する',()=>{
    const{document,context}=fixture(),mother=document.interactions.find(i=>i.id==='home-mother')!;
    for(const eventKey of ['invented.event',`npc.${mother.id}`]){
      const candidate=structuredClone(document);candidate.interactions.find(i=>i.id===mother.id)!.eventKey=eventKey;
      expect(()=>withDerived(candidate,context)).toThrow();
    }
    const invalid=structuredClone(document);invalid.interactions.push({...npc(),eventKey:'invented.event'});
    expect(()=>withDerived(invalid,context)).toThrow();
    invalid.interactions=[...document.interactions,{...npc(),kind:'object'}];expect(()=>withDerived(invalid,context)).toThrow();
    const missing:EditorValidationContext={...context,derived:{startPortalId:'missing-exit'}};
    expect(()=>withDerived(document,missing)).toThrow();
    expect(()=>withDerived(document,{...context,derived:{...context.derived,unrecognized:true} as EditorValidationContext['derived']})).toThrow();
  });
  it('差分は導いた値の正しさを確認し、文書ID/年代/spritesは完全一致のまま',()=>{
    const{document,context}=fixture();
    for(const mutate of [
      (d:EditorDocument)=>{d.id='another-document';},
      (d:EditorDocument)=>{d.variant!.id='another-variant';},
      (d:EditorDocument)=>{d.catalogs.sprites.push('unregistered-person');},
      (d:EditorDocument)=>{d.start.x++;},
      (d:EditorDocument)=>{d.catalogs.eventKeys.push('unreferenced.key');},
    ]){const candidate=structuredClone(document);mutate(candidate);expect(()=>diffDocuments(document,candidate,context)).toThrow();}
  });
  it('モデルの候補から導出して検証・確定・Undo・保存下書き・再読込を通す',()=>{
    const{world}=fixture(),model=new WorldEditorModel(world),id='home-family-interior-plant-14-9';
    const candidate=model.candidate({...model.object(id)!,x:13});
    candidate.start={areaId:'home-family-interior',x:0,y:0,facing:'up'};candidate.catalogs.eventKeys=[];
    expect(model.issues(candidate)).toEqual([]);model.commit(candidate);
    expect(model.document.start).toEqual(model.initial.start);expect(model.document.catalogs).toEqual(model.initial.catalogs);
    const edited=model.document;model.session.undo();expect(model.document).toEqual(model.initial);model.session.redo();expect(model.document).toEqual(edited);
    const saved=JSON.parse(prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges()},world).text);
    expect(saved.objects.find((o:{id:string})=>o.id===id).x).toBe(13);
    const reopened=new WorldEditorModel(model.runtime());expect(reopened.object(id)!.x).toBe(13);expect(reopened.document).toEqual(edited);
    expect(()=>prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges(),derived:contextForForgery()},world)).toThrow();
  });
  it('信頼済みcontextはワールドからだけ作り、入力や呼出側のワールドを変更しない',()=>{
    const{world,document,context}=fixture(),snapshot=structuredClone(document);
    expect(context.derived).toEqual({startPortalId:'home-exit',placedNpcEventKeys:true});expect(context.railLinks).toBeUndefined();
    expect(context.baselineWorld).not.toBe(world);expect(Object.keys(context).sort()).toEqual(['baselineWorld','derived']);
    withDerived(document,context);expect(document).toEqual(snapshot);
    const copied=context.baselineWorld.areas.get(HOME_AREA)!;copied.def.interactions[0].name='コピーの変更';
    expect(world.areas.get(HOME_AREA)!.def.interactions[0].name).not.toBe('コピーの変更');
    const forged={...createChangeSet(document,[],trustedContext(world)),derived:contextForForgery()};
    expect(()=>applyChangeSet(document,forged,trustedContext(world))).toThrow();
  });
});
function contextForForgery(){return{startPortalId:'untrusted-exit',placedNpcEventKeys:true};}
