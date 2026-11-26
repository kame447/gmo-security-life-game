import {describe,expect,it} from 'vitest';
import {buildWorld} from '../src/world';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {assertHomeWorldEdit,assertInteriorEdit} from '../src/world-editor/policy';

function fixture(){const model=new WorldEditorModel(buildWorld());return{model,before:model.document,after:model.document};}
const checks=[assertInteriorEdit,assertHomeWorldEdit];
describe('部屋の局所方針と全体ガードの移行',()=>{
  it('局所関数は他エリア/全体metadataを見ず、互換wrapperは従来どおり拒否する',()=>{
    const{before,after}=fixture();after.objects.find(o=>o.areaId==='town-main')!.x++;
    after.interactions.find(i=>i.areaId==='town-main')!.name='検証用の表示';
    after.facilities[0].name='検証用の施設';after.variant!.id='another-variant';after.start.x++;
    after.catalogs.sprites.push('unregistered-person');
    expect(()=>assertInteriorEdit(before,after,HOME_AREA)).not.toThrow();
    expect(()=>assertHomeWorldEdit(before,after,HOME_AREA)).toThrow();
  });
  it('出口toは全体へ委ね、部屋自身の入口fromとIDは局所で保護する',()=>{
    const{before,after}=fixture();after.portals.find(p=>p.id==='home-exit')!.to.y++;
    expect(()=>assertInteriorEdit(before,after,HOME_AREA)).not.toThrow();expect(()=>assertHomeWorldEdit(before,after,HOME_AREA)).toThrow();
    for(const check of checks){const changed=structuredClone(before);changed.portals.find(p=>p.id==='home-exit')!.from.x++;
      expect(()=>check(before,changed,HOME_AREA)).toThrow();}
  });
  it('保護家具の削除・リンク変更は両方が拒否し、家具/調べる足元の同時移動は通す',()=>{
    const{before}=fixture(),id='home-family-interior-lowtable-5-8';
    for(const check of checks){
      const removed=structuredClone(before);removed.objects=removed.objects.filter(o=>o.id!==id);
      expect(()=>check(before,removed,HOME_AREA)).toThrow();
      const unlinked=structuredClone(before);delete unlinked.interactions.find(i=>i.objectId===id)!.objectId;
      expect(()=>check(before,unlinked,HOME_AREA)).toThrow();
      const moved=structuredClone(before);moved.objects.find(o=>o.id===id)!.y++;moved.interactions.find(i=>i.objectId===id)!.y++;
      expect(()=>check(before,moved,HOME_AREA)).not.toThrow();
      const ordinary=structuredClone(before);ordinary.objects=ordinary.objects.filter(o=>o.id!=='home-family-interior-sofa-1-9');
      expect(()=>check(before,ordinary,HOME_AREA)).not.toThrow();
    }
  });
  it('元NPCの自分用キーへの付替えと削除を、導出の関数に頼らず局所でも拒否する',()=>{
    const{before}=fixture();for(const check of checks){
      const changed=structuredClone(before);changed.interactions.find(i=>i.id==='home-mother')!.eventKey='npc.home-mother';
      expect(()=>check(before,changed,HOME_AREA)).toThrow();
      const removed=structuredClone(before);removed.interactions=removed.interactions.filter(i=>i.id!=='home-mother');
      expect(()=>check(before,removed,HOME_AREA)).toThrow();
    }
  });
  it('出入口と到着位置への新規家具を両方の経路が拒否する',()=>{
    const{before,model}=fixture();for(const[x,y]of [[7,11],[7,10]]){
      const after=model.candidate({...model.create('chair-wood'),x,y},true);
      for(const check of checks)expect(()=>check(before,after,HOME_AREA)).toThrow();
    }
  });
});
