import {describe,expect,it} from 'vitest';
import {buildWorld,validateWorld} from '../src/world';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {EDITABLE_PEOPLE,npcEventKey} from '../src/world-editor/npc';
import {assertHomeWorldEdit,assertInteriorEdit} from '../src/world-editor/policy';
import type {EditorInteraction} from '../src/editor/types';
import {prepareSave} from '../src/world-editor/persistence';
import {Game} from '../src/session/game';
import {feetAtTile} from '../src/core/coords';

function fixture(){const world=buildWorld();return{world,model:new WorldEditorModel(world)};}
function put(model:WorldEditorModel,sprite='friend',x=4,y=7){
  const npc={...model.createNpc(sprite),x,y};model.commit(model.npcCandidate(npc,true));return npc;
}
describe('実ワールドに置く人物と保存の境界',()=>{
  it('承認した10種を読込時に宣言し、主人公と汎用fallbackを追加/変更/直接保存でも拒否する',()=>{
    const{world,model}=fixture();expect(EDITABLE_PEOPLE).toHaveLength(10);
    for(const person of EDITABLE_PEOPLE)expect(model.document.catalogs.sprites).toContain(person.id);
    expect(EDITABLE_PEOPLE.some(person=>person.id==='player')).toBe(false);
    for(const sprite of ['player','unknown-person']){
      expect(()=>model.createNpc(sprite)).toThrow();expect(()=>model.updateNpc('home-mother',{sprite})).toThrow();
      const npc={...model.createNpc('friend'),sprite,x:4,y:7},baseDocument=model.document;
      const changes={schemaVersion:1,documentId:baseDocument.id,baseDocument,operations:[{type:'add',table:'interactions',id:npc.id,after:npc}]};
      expect(()=>prepareSave({areaId:HOME_AREA,changes},world)).toThrow();
    }
    expect(model.dirty).toBe(0);
  });
  it('新規ID/自己キー/足元/通常会話を作り、元の家具・人物・出入口は全文保持する',()=>{
    const{model}=fixture(),before=model.document,npc=put(model);
    expect(npc).toMatchObject({id:`${HOME_AREA}-npc-1`,eventKey:`npc.${HOME_AREA}-npc-1`,kind:'npc',solid:true,facing:'down'});
    expect(npc.name.trim()).not.toBe('');expect(npc.lines[0].trim()).not.toBe('');
    expect(model.document.catalogs.eventKeys).toContain(npcEventKey(npc.id));expect(model.document.catalogs.sprites).toEqual(before.catalogs.sprites);
    expect(model.document.objects).toEqual(before.objects);expect(model.document.portals).toEqual(before.portals);
    expect(model.document.interactions.filter(i=>i.id!==npc.id)).toEqual(before.interactions);
    expect(validateWorld(model.runtime())).toEqual([]);
    model.updateNpc(npc.id,{name:'追加した人',sprite:'teacher',facing:'right',lines:['追加した会話','2行目です']});
    const game=new Game(model.runtime(),{phoneClock:()=>0,phoneEpochClock:()=>0});
    game.player={areaId:HOME_AREA,...feetAtTile(4,8),facing:'up'};expect(game.facingInteraction()?.id).toBe(npc.id);game.action();
    expect(game.dialog?.speaker).toBe('追加した人');expect(game.dialog?.lines).toEqual(['追加した会話','2行目です']);
  });
  it('取消/削除/Undo後も発行したIDを使い回さず、Redoは同じIDへ戻す',()=>{
    const{model}=fixture(),cancelled=model.createNpc('friend');
    const placed=put(model);expect(placed.id).toBe(`${HOME_AREA}-npc-2`);expect(model.npc(cancelled.id)).toBeUndefined();
    model.session.undo();expect(model.npc(placed.id)).toBeUndefined();expect(model.document.catalogs.eventKeys).not.toContain(placed.eventKey);
    model.session.redo();expect(model.npc(placed.id)).toEqual(placed);
    model.removeNpc(placed.id);expect(model.document.catalogs.eventKeys).not.toContain(placed.eventKey);
    const next=put(model);expect(next.id).toBe(`${HOME_AREA}-npc-3`);
    model.markSaved();model.removeNpc(next.id);expect(model.createNpc('friend').id).toBe(`${HOME_AREA}-npc-4`);
  });
  it('取消された配置は文書も履歴も変えず、元の人物は削除できない',()=>{
    const{model}=fixture(),before=model.document;model.createNpc('cat');expect(model.document).toEqual(before);
    expect(model.session.canUndo).toBe(false);expect(()=>model.removeNpc('home-mother')).toThrow('消せません');expect(model.document).toEqual(before);
  });
  it('壁/固い家具/人/調べる場所/入口/到着位置を拒否し、通れる敷物は許す',()=>{
    const{model}=fixture(),before=model.document,npc=model.createNpc('cat');
    for(const[x,y]of [[0,2],[10,3],[13,4],[5,8],[7,11],[7,10]]){
      expect(()=>model.commit(model.npcCandidate({...npc,x,y},true))).toThrow();expect(model.document).toEqual(before);
    }
    model.commit(model.npcCandidate({...npc,x:4,y:7},true));expect(validateWorld(model.runtime())).toEqual([]);
  });
  it('新規人物の偽ID/偽キー/種類/衝突/足元/空欄と、元人物の改名による保護回避を局所でも拒否する',()=>{
    const{model}=fixture(),before=model.document,valid={...model.createNpc('friend'),x:4,y:7};
    const patches:Partial<EditorInteraction>[]=[{id:'renamed-npc'},{eventKey:'home.mother'},{kind:'object'},{solid:false},{w:2},{h:2},{name:''},{lines:[]},{lines:[' ']},{sprite:'player'}];
    for(const patch of patches){const after=model.document;after.interactions.push({...valid,...patch});
      expect(()=>assertInteriorEdit(before,after,HOME_AREA)).toThrow();}
    const after=model.document;after.interactions=after.interactions.filter(i=>i.id!=='home-mother');
    after.interactions.push({...before.interactions.find(i=>i.id==='home-mother')!,id:`${HOME_AREA}-npc-9`,eventKey:`npc.${HOME_AREA}-npc-9`});
    expect(()=>assertInteriorEdit(before,after,HOME_AREA)).toThrow();
  });
  it('派生キーだけは信頼済み文脈で通し、改竄metadataとspriteの追加は引き続き拒否する',()=>{
    const{model}=fixture(),before=model.document,npc=put(model),after=model.document;
    expect(()=>assertHomeWorldEdit(before,after,HOME_AREA)).toThrow();
    expect(()=>assertHomeWorldEdit(before,after,HOME_AREA,model.context)).not.toThrow();
    for(const change of [(d:typeof after)=>d.catalogs.eventKeys.push('invented.event'),(d:typeof after)=>d.catalogs.eventKeys.splice(d.catalogs.eventKeys.indexOf(npc.eventKey),1),
      (d:typeof after)=>d.catalogs.sprites.push('player'),(d:typeof after)=>d.start.x++]){
      const candidate=structuredClone(after);change(candidate);expect(()=>assertHomeWorldEdit(before,candidate,HOME_AREA,model.context)).toThrow();
    }
  });
});
