import { describe, expect, it } from 'vitest';
import { createHome, createClassroom, createKonbini } from '../src/world/interiors';
import { createTown } from '../src/world/town';
import { TRAIN_NETWORK } from '../src/travel/network';
import { AREA_FACTORIES, buildWorld, validateWorld } from '../src/world';
import { applyAreaLayout, areaLayout, staleLayouts } from '../src/world/layouts';
import { areaFingerprint, initialLayout, layoutArea, plainArea } from '../src/world/layouts/codec';
import { fingerprint } from '../src/world/layouts/hash';
import { fingerprintValue } from '../src/editor-persistence/common';
import { WorldEditorModel, HOME_AREA } from '../src/world-editor/model';
import { canonicalJSON, parseDocument, validateDocument } from '../src/editor/schema';
import { prepareSave } from '../src/world-editor/persistence';

describe('実ゲームの配置JSON',()=>{
  it('canonical UTF-8の指紋は既存WebCrypto方式と一致する',async()=>{
    for(const input of ['',{},'じぶんのいえ🪑',{cells:Array.from({length:500},(_,n)=>n)}])expect(fingerprint(input)).toBe(await fingerprintValue(input));
    expect(areaFingerprint(createHome())).toBe(areaLayout(HOME_AREA)!.source.fingerprint);
  });
  it('生成元の変更を検出し、JSONのないエリアは同じ定義を返す',()=>{
    const sources=AREA_FACTORIES.map(fn=>fn());expect(staleLayouts(sources)).toEqual([]);
    sources.find(a=>a.id===HOME_AREA)!.objects[0].x++;
    expect(staleLayouts(sources)).toEqual([HOME_AREA]);
    for(const create of [createTown,createClassroom,createKonbini]){const a=create();expect(applyAreaLayout(a)).toBe(a);}
  });
  it('初回移行は元のID・会話・出入口を保ち、台所を新しい品に分割する',()=>{
    const source=createHome(),layout=areaLayout(HOME_AREA)!;
    expect(layout.interactions.filter(i=>i.objectId).map(i=>[i.id,i.objectId]).sort()).toEqual([
      ['home-study-desk','home-family-interior-desk-4-1'],['home-tablet','home-family-interior-lowtable-5-8']]);
    const restored=layoutArea(layout,source);
    expect(restored.interactions).toEqual(source.interactions);expect(restored.portals).toEqual(source.portals);
    expect(restored.ground).toEqual(source.ground);
    for(const o of source.objects){const next=restored.objects.find(p=>p.id===o.id)!;expect(next).toMatchObject({id:o.id,kind:o.kind,x:o.x,y:o.y});expect(next.catalogId).toBeTruthy();}
    expect(restored.objects.filter(o=>!source.objects.some(p=>p.id===o.id)).map(o=>o.id).sort()).toEqual([
      `${HOME_AREA}-cabinet-low-1`,`${HOME_AREA}-kitchen-stove-1`]);
    const preview=new WorldEditorModel(buildWorld()).runtime();
    for(const create of [createTown,createClassroom,createKonbini]){
      expect(plainArea(buildWorld().areas.get(create().id)!.def)).toEqual(plainArea(create()));
      expect(plainArea(preview.areas.get(create().id)!.def)).toEqual(plainArea(create()));
    }
    expect(validateWorld(buildWorld(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
  });
  it('既存メタデータとcatalogId/facing/surfacesが実文書から保存へ往復する',()=>{
    const world=buildWorld(),model=new WorldEditorModel(world),chair=model.create('chair-wood');
    model.commit(model.candidate({...chair,x:8,y:6},true));model.rotate(chair.id);
    const doc=model.document,area=doc.areas.find(a=>a.id===HOME_AREA)!;
    area.surfaces={palette:['floor-wood-dark'],cells:Array(area.width*area.height).fill(0)};area.surfaces.cells[6*area.width+8]=1;
    model.commit(doc);
    const result=prepareSave({areaId:HOME_AREA,changes:model.session.exportChanges()},world),l=JSON.parse(result.text);
    expect(l.objects.find((o:{id:string})=>o.id===chair.id)).toMatchObject({catalogId:'chair-wood',facing:'left'});
    expect(l.area.surfaces).toEqual(area.surfaces);
    expect(parseDocument(model.document,model.context).variant).toEqual(world.variant);
    expect(model.document.areas.find(a=>a.id==='town-main')!.districts).toEqual(createTown().districts);
    expect(validateWorld(model.runtime(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
  });
  it('未知catalogId・不一致の足元・壁への不正配置を拒否する',()=>{
    const model=new WorldEditorModel(buildWorld()),o={...model.create('chair-wood'),x:8,y:6};
    for(const changed of [{...o,catalogId:'missing-chair'},{...o,w:4},{...o,y:0}]){
      expect(model.issues(model.candidate(changed,true)).length).toBeGreaterThan(0);
    }
    const d=model.document,a=d.areas.find(a=>a.id===HOME_AREA)!;
    a.surfaces={palette:['wall-stripe-green'],cells:Array(a.width*a.height).fill(0)};a.surfaces.cells[6*a.width+8]=1;
    expect(validateDocument(d,model.context).some(e=>e.code==='placement')).toBe(true);
  });
  it('サイズ・areaIdの異なる配置は読み込まず、決定的なJSONを保つ',()=>{
    const def=createHome(),data=initialLayout(def,'createHome');
    expect(()=>layoutArea({...data,areaId:'town-main'},def)).toThrow();
    expect(()=>layoutArea({...data,area:{...data.area,width:99}},def)).toThrow();
    const bad=structuredClone(areaLayout(HOME_AREA)!);bad.objects[0].catalogId='unknown-chair';
    expect(()=>layoutArea(bad,def)).toThrow();
    const wrong=structuredClone(areaLayout(HOME_AREA)!);wrong.objects[0].w++;
    expect(()=>layoutArea(wrong,def)).toThrow();
    expect(canonicalJSON(initialLayout(def,'createHome'))).toBe(canonicalJSON(data));
  });
});
