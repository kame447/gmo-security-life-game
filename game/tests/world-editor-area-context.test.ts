import {describe,expect,it} from 'vitest';
import {buildWorld} from '../src/world';
import {HOME_AREA,WorldEditorModel} from '../src/world-editor/model';

const sofa='home-family-interior-sofa-1-9';
describe('エリア引数と従来の自宅操作の互換',()=>{
  it('引数なしと明示した自宅で、家具の移動・複製・削除・履歴が全文一致する',()=>{
    const legacy=new WorldEditorModel(buildWorld()),explicit=new WorldEditorModel(buildWorld());
    legacy.move(sofa,2,9);explicit.move(sofa,2,9,HOME_AREA);
    expect(explicit.duplicate(sofa,HOME_AREA)).toEqual(legacy.duplicate(sofa));
    legacy.remove(sofa);explicit.remove(sofa,HOME_AREA);expect(explicit.document).toEqual(legacy.document);
    legacy.session.undo();explicit.session.undo();expect(explicit.document).toEqual(legacy.document);
    expect(explicit.create('chair-wood',HOME_AREA)).toEqual(legacy.create('chair-wood'));
  });
  it('人物の6関数はエリア引数を必須とし、指定エリアの編集・回転・ID・削除を行う',()=>{
    const model=new WorldEditorModel(buildWorld());
    // Runtime check that omitting areaId fails loudly even from untyped callers.
    const unsafe=model as unknown as Record<string,(...args:unknown[])=>unknown>;
    expect(()=>unsafe.npc('home-mother')).toThrow('エリア');
    expect(()=>unsafe.npcProtectedReason('home-mother')).toThrow('エリア');
    expect(()=>unsafe.createNpc('friend')).toThrow('エリア');
    expect(()=>unsafe.removeNpc('home-mother')).toThrow('エリア');
    expect(()=>unsafe.updateNpc('home-mother',{y:6})).toThrow('エリア');
    expect(()=>unsafe.rotateNpc('home-mother')).toThrow('エリア');
    model.updateNpc('home-mother',{y:6},HOME_AREA);
    model.rotateNpc('home-mother',HOME_AREA);
    expect(model.npc('home-mother',undefined,HOME_AREA)).toMatchObject({y:6,facing:'up'});
    expect(model.npcProtectedReason('home-mother',HOME_AREA)).toContain('消せません');
    const created={...model.createNpc('friend',HOME_AREA),x:4,y:7};
    model.commit(model.npcCandidate(created,true));
    expect(model.npc(created.id,undefined,HOME_AREA)).toEqual(created);
    model.removeNpc(created.id,HOME_AREA);
    expect(model.npc(created.id,undefined,HOME_AREA)).toBeUndefined();
  });
  it('別エリアの参照とID発行を明示でき、未登録の教室と不正な屋外の戻り先は拒否する',()=>{
    const model=new WorldEditorModel(buildWorld()),initial=model.document;
    const object=initial.objects.find(o=>o.areaId==='town-main')!,npc=initial.interactions.find(i=>i.areaId==='town-main'&&i.kind==='npc')!;
    expect(model.object(object.id)).toBeUndefined();expect(model.npc(npc.id,undefined,HOME_AREA)).toBeUndefined();
    expect(model.object(object.id,undefined,'town-main')).toEqual(object);expect(model.npc(npc.id,undefined,'town-main')).toEqual(npc);
    const created=model.createNpc('friend','town-main');expect(created).toMatchObject({id:'town-main-npc-1',areaId:'town-main',eventKey:'npc.town-main-npc-1'});
    const classroom=model.document;classroom.interactions.find(i=>i.id==='school-teacher')!.name='候補の名前';
    expect(()=>model.commit(classroom)).not.toThrow();
    expect(model.npc('school-teacher',undefined,'school-classroom-interior')?.name).toBe('候補の名前');
    model.session.undo();expect(model.document).toEqual(initial);
    const wrongReturn=model.document;wrongReturn.portals.find(p=>p.id==='konbini-exit')!.to.x--;
    expect(()=>model.commit(wrongReturn)).toThrow('戻り先');expect(model.document).toEqual(initial);
  });
  it('runtimeの既定は従来の自宅投影で、指定したエリアだけ候補へ切り替える',()=>{
    const model=new WorldEditorModel(buildWorld()),candidate=model.document,source=model.context.baselineWorld;
    const npc=candidate.interactions.find(i=>i.areaId==='town-main'&&i.kind==='npc')!;npc.name='候補の表示名';
    expect(model.runtime(candidate)).toEqual(model.runtime(candidate,[HOME_AREA]));
    expect(model.runtime(candidate).areas.get('town-main')).toEqual(source.areas.get('town-main'));
    const preview=model.runtime(candidate,['town-main']);expect(preview.areas.get('town-main')!.interactions.find(i=>i.id===npc.id)!.name).toBe('候補の表示名');
    expect(preview.areas.get(HOME_AREA)).toEqual(source.areas.get(HOME_AREA));expect(model.document).toEqual(model.initial);
  });
});
