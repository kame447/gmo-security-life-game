import { describe,expect,it } from 'vitest';
import { buildWorld, validateWorld } from '../src/world';
import { WorldEditorModel, HOME_AREA } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertHomeWorldEdit as assertInteriorEdit } from '../src/world-editor/policy';

describe('WYSIWYGの操作と保存の契約',()=>{
  it('一般家具は削除・Undo/Redoでき、保護家具と結び付きは保存口でも拒否する',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world);
    const sofa='home-family-interior-sofa-1-9',desk='home-family-interior-desk-4-1';
    expect(()=>model.remove(desk)).toThrow('結び付');expect(model.dirty).toBe(0);
    model.remove(sofa);expect(model.object(sofa)).toBeUndefined();model.session.undo();expect(model.object(sofa)).toBeDefined();model.session.redo();
    const saved=JSON.parse(prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges()},world).text);
    expect(saved.objects.some((o:{id:string})=>o.id===sofa)).toBe(false);
    const bad=model.document;bad.objects=bad.objects.filter(o=>o.id!==desk);
    expect(()=>assertInteriorEdit(model.initial,bad,HOME_AREA)).toThrow();
  });
  it('机の移動と調べる場所は1段のUndoに入り、回転後も足元を合わせる',()=>{
    const model=new WorldEditorModel(buildWorld()),id='home-family-interior-desk-4-1';
    model.move(id,4,2);
    expect(model.document.interactions.find(i=>i.id==='home-study-desk')).toMatchObject({x:4,y:2,w:2,h:1});
    model.session.undo();expect(model.object(id)).toMatchObject({x:4,y:1});
    model.session.redo();expect(model.object(id)).toMatchObject({x:4,y:2});
    // The rotation transaction uses the same link update for all catalog footprints.
    const linked=model.object(id)!;
    model.commit(model.candidate({...linked,catalogId:'sofa-2seat',facing:'down',solid:true,layer:'sorted'}));
    model.rotate(id);
    expect(model.document.interactions.find(i=>i.id==='home-study-desk')).toMatchObject({x:4,y:2,w:1,h:2});
    expect(validateWorld(model.runtime())).toEqual([]);
  });
  it('削除・Undo・未確定の取消後も発行済みIDを使い回さない',()=>{
    const model=new WorldEditorModel(buildWorld()),first=model.create('chair-wood');
    model.commit(model.candidate({...first,x:8,y:6},true));model.remove(first.id);
    const second=model.create('chair-wood');expect(second.id).not.toBe(first.id);
    model.commit(model.candidate({...second,x:8,y:6},true));model.session.undo();
    const third=model.create('chair-wood');expect(third.id).not.toBe(second.id);
    model.session.redo();expect(model.object(second.id)).toBeDefined();
    expect(model.create('chair-wood').id).not.toBe(third.id);
  });
  it('出入口・到着位置・壁への配置は確定されず、履歴も不変',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;
    for(const[x,y]of [[7,11],[7,10],[0,2]]){
      const object={...model.create('chair-wood'),x,y};
      expect(()=>model.commit(model.candidate(object,true))).toThrow();expect(model.document).toEqual(before);
    }
  });
  it('NPC/会話/出入口/他エリアの変更と不正な保存先を拒否する',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world);
    for(const alter of [
      (d:typeof model.initial)=>{d.interactions=d.interactions.filter(i=>i.id!=='home-mother');},
      (d:typeof model.initial)=>{d.interactions.find(i=>i.id==='home-tablet')!.objectId=undefined;},
      (d:typeof model.initial)=>{d.portals.find(p=>p.id==='home-exit')!.to.x++;},
      (d:typeof model.initial)=>{d.objects.find(o=>o.areaId==='town-main')!.x++;},
    ]){const d=model.document;alter(d);expect(()=>assertInteriorEdit(model.initial,d,HOME_AREA)).toThrow();}
    expect(()=>prepareSave({areaId:'../../outside',changes:model.session.exportChanges()},world)).toThrow();
    expect(()=>prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges(),baselineWorld:world},world)).toThrow();
  });
  it('別の基準からの差分は適用せず、元の会話と帰路を維持する',()=>{
    const world=buildWorld(),a=new WorldEditorModel(world),b=new WorldEditorModel(world);
    a.move('home-family-interior-plant-14-9',13,9);b.move('home-family-interior-plant-14-9',12,9);
    expect(()=>prepareSave({areaId:HOME_AREA,changes:a.session.exportChanges()},b.runtime())).toThrow();
    expect(a.document.portals).toEqual(a.initial.portals);
    expect(a.document.interactions.filter(i=>i.kind==='npc')).toEqual(a.initial.interactions.filter(i=>i.kind==='npc'));
  });
});
