import {describe,expect,it} from 'vitest';
import {buildWorld} from '../src/world';
import {HOME_AREA,WorldEditorModel} from '../src/world-editor/model';
import {changedAreaIds} from '../src/world-editor/world-policy';
import {withDerived} from '../src/editor/changes';

describe('屋外と部屋を表示するruntime',()=>{
  it('屋外を変えても既存の絵と調べる対象の順序を保ち、新規だけ末尾へ加える',()=>{
    const model=new WorldEditorModel(buildWorld()),candidate=model.document,source=model.context.baselineWorld.areas.get('town-main')!;
    const tree=candidate.objects.find(o=>o.areaId==='town-main'&&o.kind==='tree')!;tree.x+=2;
    candidate.objects.push({...tree,id:'town-main-tree-1',x:65,y:45});
    const area=model.runtime(candidate,['town-main']).areas.get('town-main')!;
    expect(area.objects.map(o=>o.id)).toEqual([...source.objects.map(o=>o.id),'town-main-tree-1']);
    expect(area.interactions.map(i=>i.id)).toEqual(source.interactions.map(i=>i.id));
    expect(area.def.portals.map(p=>p.id)).toEqual(source.def.portals.map(p=>p.id));
    expect(area.objects.find(o=>o.id===tree.id)!.x).toBe(tree.x);expect(model.document).toEqual(model.initial);
  });
  it('自宅の未保存変更と建物/入口/室内の戻り先の候補を、同じworldへ全部反映する',()=>{
    const model=new WorldEditorModel(buildWorld()),candidate=model.document;
    const plant=candidate.objects.find(o=>o.id==='home-family-interior-plant-14-9')!;plant.x--;
    const shop=candidate.objects.find(o=>o.facilityId==='shop-konbini')!;shop.x--;
    candidate.portals.find(p=>p.id==='konbini-enter')!.from.x--;
    candidate.portals.find(p=>p.id==='konbini-exit')!.to.x--;
    const derived=withDerived(candidate,model.context),areas=[...new Set([HOME_AREA,...changedAreaIds(model.initial,derived)])],world=model.runtime(derived,areas);
    expect(areas).toEqual([HOME_AREA,'shop-konbini-interior','town-main']);
    expect(world.areas.get(HOME_AREA)!.objects.find(o=>o.id===plant.id)!.x).toBe(13);
    expect(world.areas.get('town-main')!.objects.find(o=>o.id===shop.id)!.x).toBe(50);
    expect(world.areas.get('town-main')!.def.portals.find(p=>p.id==='konbini-enter')!.from.x).toBe(53);
    expect(world.areas.get('shop-konbini-interior')!.def.portals.find(p=>p.id==='konbini-exit')!.to.x).toBe(53);
    expect(world.areas.get('school-classroom-interior')).toBeDefined();
    expect(world.areas.get('school-classroom-interior')).toEqual(model.context.baselineWorld.areas.get('school-classroom-interior'));
    expect(model.document).toEqual(model.initial);expect(model.dirty).toBe(0);
  });
});
