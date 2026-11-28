import {describe,expect,it} from 'vitest';
import {TRAIN_NETWORK} from '../src/travel/network';
import {buildWorld,LANDMARKS,validateWorld} from '../src/world';
import {isSolidGround} from '../src/world/tiles';
import {toRuntime} from '../src/world/runtime';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {EDITABLE_PEOPLE,npcEventKey} from '../src/world-editor/npc';
import {assertHomeWorldEdit,assertInteriorEdit} from '../src/world-editor/policy';
import {isEditableArea} from '../src/world-editor/world-policy';
import type {EditorInteraction} from '../src/editor/types';
import {prepareSave} from '../src/world-editor/persistence';
import {Game} from '../src/session/game';
import {feetAtTile} from '../src/core/coords';

function fixture(){const world=buildWorld();return{world,model:new WorldEditorModel(world)};}
function put(model:WorldEditorModel,areaId:string,sprite='friend',x=4,y=7){
  const npc={...model.createNpc(sprite,areaId),x,y};model.commit(model.npcCandidate(npc,true));return npc;
}
describe('実ワールドに置く人物と保存の境界',()=>{
  it('通常10種と着席2種を読込時に宣言し、主人公と汎用fallbackを追加/変更/直接保存でも拒否する',()=>{
    const{world,model}=fixture();expect(EDITABLE_PEOPLE).toHaveLength(12);
    for(const person of EDITABLE_PEOPLE)expect(model.document.catalogs.sprites).toContain(person.id);
    expect(EDITABLE_PEOPLE.some(person=>person.id==='player')).toBe(false);
    for(const sprite of ['player','unknown-person']){
      expect(()=>model.createNpc(sprite,HOME_AREA)).toThrow();expect(()=>model.updateNpc('home-mother',{sprite},HOME_AREA)).toThrow();
      const npc={...model.createNpc('friend',HOME_AREA),sprite,x:4,y:7},baseDocument=model.document;
      const changes={schemaVersion:1,documentId:baseDocument.id,baseDocument,operations:[{type:'add',table:'interactions',id:npc.id,after:npc}]};
      expect(()=>prepareSave({areaId:HOME_AREA,changes},world)).toThrow();
    }
    expect(model.dirty).toBe(0);
  });
  it('新規ID/自己キー/足元/通常会話を作り、元の家具・人物・出入口は全文保持する',()=>{
    const{model}=fixture(),before=model.document,npc=put(model,HOME_AREA);
    expect(npc).toMatchObject({id:`${HOME_AREA}-npc-1`,eventKey:`npc.${HOME_AREA}-npc-1`,kind:'npc',solid:true,facing:'down'});
    expect(npc.name.trim()).not.toBe('');expect(npc.lines[0].trim()).not.toBe('');
    expect(model.document.catalogs.eventKeys).toContain(npcEventKey(npc.id));expect(model.document.catalogs.sprites).toEqual(before.catalogs.sprites);
    expect(model.document.objects).toEqual(before.objects);expect(model.document.portals).toEqual(before.portals);
    expect(model.document.interactions.filter(i=>i.id!==npc.id)).toEqual(before.interactions);
    expect(validateWorld(model.runtime(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
    model.updateNpc(npc.id,{name:'追加した人',sprite:'teacher',facing:'right',lines:['追加した会話','2行目です']},HOME_AREA);
    const game=new Game(model.runtime(),{phoneClock:()=>0,phoneEpochClock:()=>0});
    game.player={areaId:HOME_AREA,...feetAtTile(4,8),facing:'up'};expect(game.facingInteraction()?.id).toBe(npc.id);game.action();
    expect(game.dialog?.speaker).toBe('追加した人');expect(game.dialog?.lines).toEqual(['追加した会話','2行目です']);
  });
  it('取消/削除/Undo後も発行したIDを使い回さず、Redoは同じIDへ戻す',()=>{
    const{model}=fixture(),cancelled=model.createNpc('friend',HOME_AREA);
    const placed=put(model,HOME_AREA);expect(placed.id).toBe(`${HOME_AREA}-npc-2`);expect(model.npc(cancelled.id,undefined,HOME_AREA)).toBeUndefined();
    model.session.undo();expect(model.npc(placed.id,undefined,HOME_AREA)).toBeUndefined();expect(model.document.catalogs.eventKeys).not.toContain(placed.eventKey);
    model.session.redo();expect(model.npc(placed.id,undefined,HOME_AREA)).toEqual(placed);
    model.removeNpc(placed.id,HOME_AREA);expect(model.document.catalogs.eventKeys).not.toContain(placed.eventKey);
    const next=put(model,HOME_AREA);expect(next.id).toBe(`${HOME_AREA}-npc-3`);
    model.markSaved();model.removeNpc(next.id,HOME_AREA);expect(model.createNpc('friend',HOME_AREA).id).toBe(`${HOME_AREA}-npc-4`);
  });
  it('取消された配置は文書も履歴も変えず、元の人物は削除できない',()=>{
    const{model}=fixture(),before=model.document;model.createNpc('cat',HOME_AREA);expect(model.document).toEqual(before);
    expect(model.session.canUndo).toBe(false);expect(()=>model.removeNpc('home-mother',HOME_AREA)).toThrow('消せません');expect(model.document).toEqual(before);
  });
  it('壁/固い家具/人/調べる場所/入口/到着位置を拒否し、通れる敷物は許す',()=>{
    const{model}=fixture(),before=model.document,npc=model.createNpc('cat',HOME_AREA);
    for(const[x,y]of [[0,2],[10,3],[13,4],[5,8],[7,11],[7,10]]){
      expect(()=>model.commit(model.npcCandidate({...npc,x,y},true))).toThrow();expect(model.document).toEqual(before);
    }
    model.commit(model.npcCandidate({...npc,x:4,y:7},true));expect(validateWorld(model.runtime(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
  });
  it('新規人物の偽ID/偽キー/種類/衝突/足元/空欄と、元人物の改名による保護回避を局所でも拒否する',()=>{
    const{model}=fixture(),before=model.document,valid={...model.createNpc('friend',HOME_AREA),x:4,y:7};
    const patches:Partial<EditorInteraction>[]=[{id:'renamed-npc'},{eventKey:'home.mother'},{kind:'object'},{solid:false},{w:2},{h:2},{name:''},{lines:[]},{lines:[' ']},{sprite:'player'}];
    for(const patch of patches){const after=model.document;after.interactions.push({...valid,...patch});
      expect(()=>assertInteriorEdit(before,after,HOME_AREA)).toThrow();}
    const after=model.document;after.interactions=after.interactions.filter(i=>i.id!=='home-mother');
    after.interactions.push({...before.interactions.find(i=>i.id==='home-mother')!,id:`${HOME_AREA}-npc-9`,eventKey:`npc.${HOME_AREA}-npc-9`});
    expect(()=>assertInteriorEdit(before,after,HOME_AREA)).toThrow();
  });
  it('派生キーだけは信頼済み文脈で通し、改竄metadataとspriteの追加は引き続き拒否する',()=>{
    const{model}=fixture(),before=model.document,npc=put(model,HOME_AREA),after=model.document;
    expect(()=>assertHomeWorldEdit(before,after,HOME_AREA)).toThrow();
    expect(()=>assertHomeWorldEdit(before,after,HOME_AREA,model.context)).not.toThrow();
    for(const change of [(d:typeof after)=>d.catalogs.eventKeys.push('invented.event'),(d:typeof after)=>d.catalogs.eventKeys.splice(d.catalogs.eventKeys.indexOf(npc.eventKey),1),
      (d:typeof after)=>d.catalogs.sprites.push('player'),(d:typeof after)=>d.start.x++]){
      const candidate=structuredClone(after);change(candidate);expect(()=>assertHomeWorldEdit(before,candidate,HOME_AREA,model.context)).toThrow();
    }
  });
});

function freeNpcCell(model: WorldEditorModel, npc: EditorInteraction): EditorInteraction {
  const area = model.document.areas.find(candidate => candidate.id === npc.areaId)!;
  const seeds = model.document.interactions.filter(item => item.areaId === npc.areaId && item.kind === 'npc');
  for (const seed of seeds) {
    for (let radius = 1; radius <= 5; radius++) {
      for (const [dx, dy] of [[0, radius], [radius, 0], [0, -radius], [-radius, 0], [radius, radius], [-radius, radius]]) {
        const candidate = { ...npc, x: seed.x + dx, y: seed.y + dy };
        if (candidate.x < 1 || candidate.y < 1 || candidate.x >= area.width - 1 || candidate.y >= area.height - 1) continue;
        if (!model.issues(model.npcCandidate(candidate, true)).length) return candidate;
      }
    }
  }
  for (let y = 1; y < area.height - 1; y++) {
    for (let x = 1; x < area.width - 1; x++) {
      const candidate = { ...npc, x, y };
      if (!model.issues(model.npcCandidate(candidate, true)).length) return candidate;
    }
  }
  throw new Error(`No free NPC cell in ${npc.areaId}`);
}

describe('実ワールド全エリアのNPC追加・削除・配置拒否回帰（N1）', () => {
  const world = buildWorld(), initial = new WorldEditorModel(world).initial;
  const editableAreas = initial.areas.filter(area => isEditableArea(initial, area.id));

  it('編集可能エリアをすべて列挙する', () => {
    expect(editableAreas.length).toBeGreaterThanOrEqual(4);
  });

  it.each(editableAreas)('$id でarea別ID・自己キー追加、削除、Undo/Redo、ID非再利用が通る', area => {
    const model = new WorldEditorModel(world);
    const cancelled = model.createNpc('friend', area.id);
    const npc = freeNpcCell(model, model.createNpc('friend', area.id));
    expect(npc.id).not.toBe(cancelled.id);
    expect(npc.id).toMatch(new RegExp(`^${area.id}-npc-[1-9][0-9]*$`));
    expect(npc.eventKey).toBe(npcEventKey(npc.id));

    model.commit(model.npcCandidate(npc, true));
    expect(model.document.catalogs.eventKeys).toContain(npc.eventKey);
    expect(validateWorld(model.runtime(model.document, [area.id]),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);

    model.removeNpc(npc.id, area.id);
    expect(model.npc(npc.id, undefined, area.id)).toBeUndefined();
    expect(model.document.catalogs.eventKeys).not.toContain(npc.eventKey);

    model.session.undo();
    expect(model.npc(npc.id, undefined, area.id)).toEqual(npc);
    expect(model.document.catalogs.eventKeys).toContain(npc.eventKey);

    model.session.redo();
    expect(model.npc(npc.id, undefined, area.id)).toBeUndefined();
    expect(model.document.catalogs.eventKeys).not.toContain(npc.eventKey);

    const next = model.createNpc('friend', area.id);
    expect(next.id).not.toBe(npc.id);
    expect(next.id).not.toBe(cancelled.id);
  }, 15000);

  it.each(editableAreas)('$id で壁・固い物・他NPC・調べる場所・入口・到着・目印・到達不能を拒否する', area => {
    const model = new WorldEditorModel(world), before = model.document;
    const candidateBase = model.createNpc('friend', area.id);
    const wallIndex = area.ground.findIndex(isSolidGround);
    const wall = wallIndex >= 0 ? { x: wallIndex % area.width, y: Math.floor(wallIndex / area.width) } : undefined;
    const solidObject = initial.objects.find(object => object.areaId === area.id && object.solid);
    const otherNpc = initial.interactions.find(item => item.areaId === area.id && item.kind === 'npc');
    const otherInteraction = initial.interactions.find(item => item.areaId === area.id && item.kind !== 'npc');
    const portal = initial.portals.find(door => door.areaId === area.id)?.from;
    const arrival = initial.portals.find(door => door.to.areaId === area.id)?.to;

    const targets: [string, { x: number; y: number } | undefined][] = [
      ['wall', wall],
      ['solid-object', solidObject],
      ['portal', portal],
      ['arrival', arrival],
    ];
    if (otherNpc) targets.push(['other-npc', otherNpc]);
    if (otherInteraction) targets.push(['other-interaction', otherInteraction]);
    if (area.kind === 'outdoor') {
      for (const [name, point] of Object.entries({
        schoolGate: LANDMARKS.schoolGate,
        stationFront: LANDMARKS.stationFront,
        parkPlaza: LANDMARKS.parkPlaza,
        shoppingStreet: LANDMARKS.shoppingStreet,
      })) targets.push([`landmark:${name}`, point]);
    }

    for (const [kind, tile] of targets) {
      expect(tile, `Missing ${kind} fixture in ${area.id}`).toBeDefined();
      const candidate = { ...candidateBase, x: tile!.x, y: tile!.y };
      const issues = model.issues(model.npcCandidate(candidate, true));
      expect(issues.length, `${kind} should be rejected in ${area.id}`).toBeGreaterThan(0);
      expect(() => model.commit(model.npcCandidate(candidate, true)), `${kind} commit in ${area.id}`).toThrow();
      expect(model.document).toEqual(before);
    }

    if (area.kind === 'indoor' && arrival) {
      const sealModel = new WorldEditorModel(world);
      const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]]
        .map(([dx, dy]) => ({ x: arrival.x + dx, y: arrival.y + dy }))
        .filter(point => {
          const tile = area.ground[point.y * area.width + point.x];
          if (point.x < 0 || point.y < 0 || point.x >= area.width || point.y >= area.height || isSolidGround(tile)) return false;
          return !initial.portals.some(door => door.areaId === area.id &&
            point.x >= door.from.x && point.x < door.from.x + (door.from.w ?? 1) && point.y === door.from.y);
        });
      expect(neighbors.length).toBeGreaterThan(0);
      let rejectedCut = false;
      for (const point of neighbors) {
        const blocker = { ...sealModel.createNpc('friend', area.id), x: point.x, y: point.y };
        const beforeSeal = sealModel.document;
        const candidate = sealModel.npcCandidate(blocker, true);
        const issues = sealModel.issues(candidate);
        // 棚や元の客がいるため、隣接マスを全部塞ぐ前に最後の迂回路を失う部屋もある。
        if (issues.includes('出入口や調べる場所への通路を保ってください')) {
          const disconnected = sealModel.runtime(sealModel.document, [area.id]);
          const room = disconnected.areas.get(area.id)!;
          disconnected.areas.set(area.id, toRuntime({ ...room.def, interactions: [...room.def.interactions, blocker] }));
          expect(validateWorld(disconnected, { railLinks: TRAIN_NETWORK.railLinks() }).some(issue => issue.startsWith('Unreachable'))).toBe(true);
          expect(() => sealModel.commit(candidate)).toThrow('通路');
          expect(sealModel.document).toEqual(beforeSeal);
          rejectedCut = true;
          break;
        }
        expect(issues, `${area.id} at ${point.x},${point.y}`).toEqual([]);
        sealModel.commit(candidate);
        expect(validateWorld(sealModel.runtime(sealModel.document, [area.id]), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);
      }
      expect(rejectedCut, `${area.id} must reject a placement that disconnects the arrival route`).toBe(true);
    }
  }, 15000);
});
