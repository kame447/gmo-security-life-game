import {describe,expect,it} from 'vitest';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {assertInteriorEdit} from '../src/world-editor/policy';
import {areaNpcs,EDITABLE_PEOPLE,npcBadges,npcEvents} from '../src/world-editor/npc';
import {prepareSave} from '../src/world-editor/persistence';
import {areaEditPolicy,isEditableArea} from '../src/world-editor/world-policy';
import {buildWorld,validateWorld} from '../src/world';
import {TRAIN_NETWORK} from '../src/travel/network';
import {areaLayout} from '../src/world/layouts/index';
import type {EditorInteraction} from '../src/editor/types';
import {Game} from '../src/session/game';
import {feetAtTile} from '../src/core/coords';
import {LifeEventDirector} from '../src/events/director';
import {LifeState} from '../src/events/life-state';
import {CHILDHOOD_SAMPLE_EVENTS} from '../src/events/samples/childhood';

const id='home-mother';
describe('実ワールドの既存NPCの編集',()=>{
  it('母を2マス動かし、向き/名前/通常会話を変更してもIDとイベントを保つ',()=>{
    const model=new WorldEditorModel(buildWorld()),source=model.npc(id,undefined,HOME_AREA)!;
    model.updateNpc(id,{y:source.y+2},HOME_AREA);model.rotateNpc(id,HOME_AREA);
    model.updateNpc(id,{name:'検証用の表示名',lines:['編集したふだんの会話です。','2行目も保ちます。']},HOME_AREA);
    expect(model.npc(id,undefined,HOME_AREA)).toMatchObject({id,eventKey:'home.mother',kind:'npc',solid:true,x:13,y:6,facing:'up',name:'検証用の表示名'});
    expect(model.npc(id,undefined,HOME_AREA)!.lines).toEqual(['編集したふだんの会話です。','2行目も保ちます。']);
    expect(validateWorld(model.runtime(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
    model.session.undo();expect(model.npc(id,undefined,HOME_AREA)!.lines).toEqual(source.lines);model.session.redo();expect(model.npc(id,undefined,HOME_AREA)!.name).toBe('検証用の表示名');
  });
  it('元NPCの削除/キー変更/自己キーへの付替え/種類/足元/衝突変更を独立した方針でも拒否する',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;
    expect(model.npcProtectedReason(id,HOME_AREA)).toContain('消せません');
    for(const patch of [{eventKey:'invented.event'},{eventKey:`npc.${id}`},{kind:'object'},{solid:false},{w:2}]){
      const after=model.document;Object.assign(after.interactions.find(i=>i.id===id)!,patch);
      expect(()=>assertInteriorEdit(before,after,HOME_AREA)).toThrow();expect(model.document).toEqual(before);
    }
    const deleted=model.document;deleted.interactions=deleted.interactions.filter(i=>i.id!==id);
    expect(()=>assertInteriorEdit(before,deleted,HOME_AREA)).toThrow();
  });
  it('壁/家具/調べる場所/入口/到着位置、不正な名前/会話/見た目への変更は履歴も不変',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;
    for(const[x,y]of [[0,2],[10,3],[5,8],[7,11],[7,10]]){
      expect(()=>model.updateNpc(id,{x,y},HOME_AREA)).toThrow();expect(model.document).toEqual(before);expect(model.session.canUndo).toBe(false);
    }
    for(const patch of [{name:''},{lines:[]},{lines:[' ']},{sprite:'player'},{sprite:'unregistered-person'}]){
      expect(()=>model.updateNpc(id,patch,HOME_AREA)).toThrow();expect(model.document).toEqual(before);
    }
  });
  it('通れる敷物には置け、他エリア/既存家具/タブレットのリンクを変えない',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;model.updateNpc(id,{x:4,y:7},HOME_AREA);
    expect(model.npc(id,undefined,HOME_AREA)).toMatchObject({x:4,y:7});expect(model.document.objects).toEqual(before.objects);
    expect(model.document.interactions.filter(i=>i.id!==id)).toEqual(before.interactions.filter(i=>i.id!==id));
    expect(model.document.portals).toEqual(before.portals);expect(validateWorld(model.runtime(),{railLinks:TRAIN_NETWORK.railLinks()})).toEqual([]);
  });
  it('試し歩きは編集した通常会話、実イベントの条件前/1回目/後は既存の分岐どおり',()=>{
    const model=new WorldEditorModel(buildWorld());model.updateNpc(id,{y:6,name:'検証用の表示名',lines:['編集したふだんの会話です。']},HOME_AREA);
    const world=model.runtime(),mother=model.npc(id,undefined,HOME_AREA)!,events=npcEvents(mother),definitions=structuredClone(CHILDHOOD_SAMPLE_EVENTS);
    expect(events).toHaveLength(2);
    const talk=(director?:LifeEventDirector)=>{
      const game=new Game(world,{sink:director,phoneClock:()=>0,phoneEpochClock:()=>0});
      game.player={areaId:HOME_AREA,...feetAtTile(mother.x,mother.y+1),facing:'up'};
      expect(game.facingInteraction()?.id).toBe(id);game.action();return game;
    };
    expect(talk().dialog?.lines).toEqual(mother.lines);
    expect(talk(new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS)).dialog?.lines).toEqual(mother.lines);
    for(const choiceId of ['tap','ask-parent']){
      const state=new LifeState();state.record('sample.tablet-ad',choiceId);
      const director=new LifeEventDirector(CHILDHOOD_SAMPLE_EVENTS,state),expected=director.available('home.mother')!;
      expect(expected).toBeDefined();const game=talk(director);expect(game.dialog?.lines).toEqual(expected.intro);
      expect(game.dialog?.speaker).toBe(mother.name);
      for(let line=0;line<expected.intro.length;line++)game.action();
      expect(game.dialog).toBeNull();game.action();expect(game.dialog?.lines).toEqual(mother.lines);
    }
    expect(CHILDHOOD_SAMPLE_EVENTS).toEqual(definitions);
  });
});

function legalNearbyMove(model: WorldEditorModel, npc: EditorInteraction) {
  const area = model.document.areas.find(candidate => candidate.id === npc.areaId)!;
  for (let distance = 1; distance <= 4; distance++) {
    for (const [dx, dy] of [[0, distance], [distance, 0], [0, -distance], [-distance, 0]]) {
      const moved = { ...npc, x: npc.x + dx, y: npc.y + dy };
      if (moved.x < 1 || moved.y < 1 || moved.x >= area.width - 1 || moved.y >= area.height - 1) continue;
      if (!model.issues(model.npcCandidate(moved)).length) return { x: moved.x, y: moved.y };
    }
  }
  throw new Error(`No legal nearby move for ${npc.id} in ${npc.areaId}`);
}

function editableNpcAreaIds() {
  const initial = new WorldEditorModel(buildWorld()).initial;
  return initial.areas.filter(area => isEditableArea(initial, area.id)).map(area => area.id);
}

describe('実ワールド全エリアの既存NPC回帰（N1）', () => {
  it('実ワールドから全NPCを数え、編集対象と読み取り専用屋外の境界を保つ（N1）', () => {
    const world = buildWorld(), initial = new WorldEditorModel(world).initial;
    const readonlyPopulated = initial.areas.filter(area =>
      !isEditableArea(initial, area.id) && initial.interactions.some(item => item.areaId === area.id && item.kind === 'npc'));
    expect(readonlyPopulated.map(area => area.id)).toEqual(['town-neighbor']);
    let totalNpcs = 0, editableNpcs = 0;
    for (const area of initial.areas) {
      const people = initial.interactions.filter(item => item.areaId === area.id && item.kind === 'npc');
      totalNpcs += people.length;
      if (isEditableArea(initial, area.id)) {
        editableNpcs += people.length;
        if (area.kind === 'indoor') expect(areaEditPolicy(initial, area.id), area.id).toBe(assertInteriorEdit);
      } else {
        expect(area.id).toBe('town-neighbor');
        expect(area.kind).toBe('outdoor');
      }
    }
    expect(totalNpcs).toBeGreaterThanOrEqual(10);
    expect(initial.areas).toHaveLength(14);
    // Eight new visitors across the seven shops join the original sixteen editable people.
    expect(editableNpcs).toBe(24);
    expect(totalNpcs).toBe(25);
    expect(editableNpcAreaIds()).toEqual(initial.areas.filter(area => isEditableArea(initial, area.id)).map(area => area.id));
  });

  it.each(editableNpcAreaIds())('%s の全実NPCで5種類の編集・Undo/Redo・保護・不正入力拒否・保存キー不変が通る', areaId => {
    const world = buildWorld(), initial = new WorldEditorModel(world).initial;
    const editableAreas = initial.areas.filter(area => isEditableArea(initial, area.id));
    expect(editableAreas.length).toBe(initial.areas.length - 1);
    const area = editableAreas.find(area => area.id === areaId)!;
    expect(area).toBeDefined();
    const people = initial.interactions.filter(item => item.areaId === area.id && item.kind === 'npc');
    for (const original of people) {
      const model = new WorldEditorModel(world), moved = legalNearbyMove(model, original);
      model.updateNpc(original.id, moved, area.id);
      model.rotateNpc(original.id, area.id);
      const appearance = EDITABLE_PEOPLE.find(person => person.id !== original.sprite)!.id;
      model.updateNpc(original.id, {
        name: `${original.name}・回帰`,
        lines: ['全エリア回帰の通常会話です。'],
        sprite: appearance,
      }, area.id);
      const edited = model.npc(original.id, undefined, area.id)!;
      expect(edited).toMatchObject({
        id: original.id,
        eventKey: original.eventKey,
        kind: original.kind,
        solid: original.solid,
        x: moved.x,
        y: moved.y,
        name: `${original.name}・回帰`,
        lines: ['全エリア回帰の通常会話です。'],
        sprite: appearance,
      });
      expect(edited.w).toBe(original.w);
      expect(edited.h).toBe(original.h);
      expect(edited.facing).not.toBe(original.facing ?? 'down');
      expect(validateWorld(model.runtime(model.document, [area.id]), { railLinks: TRAIN_NETWORK.railLinks() })).toEqual([]);

      model.session.undo();
      expect(model.npc(original.id, undefined, area.id)!.name).toBe(original.name);
      model.session.undo();
      model.session.undo();
      expect(model.npc(original.id, undefined, area.id)).toEqual(original);
      model.session.redo();
      model.session.redo();
      model.session.redo();
      expect(model.npc(original.id, undefined, area.id)).toEqual(edited);

      const guard = new WorldEditorModel(world), before = guard.document;
      for (const patch of [
        { id: `${original.id}-tamper` },
        { eventKey: 'tampered.event' },
        { eventKey: `npc.${original.id}` },
        { kind: 'object' },
        { w: 2 },
        { h: 2 },
        { solid: false },
      ]) {
        const tampered = guard.document;
        Object.assign(tampered.interactions.find(item => item.id === original.id)!, patch);
        expect(() => guard.commit(tampered), `${original.id} ${JSON.stringify(patch)}`).toThrow();
        expect(guard.document).toEqual(before);
        expect(guard.session.canUndo).toBe(false);
      }
      expect(guard.npcProtectedReason(original.id, area.id)).toContain('消せません');
      expect(() => guard.removeNpc(original.id, area.id)).toThrow(/消せません/);
      expect(guard.document).toEqual(before);
      expect(guard.session.canUndo).toBe(false);

      for (const invalid of [{ name: '' }, { lines: [] }, { lines: [' '] }, { sprite: 'player' }, { sprite: 'unregistered-person' }]) {
        expect(() => guard.updateNpc(original.id, invalid, area.id)).toThrow();
        expect(guard.document).toEqual(before);
        expect(guard.session.canUndo).toBe(false);
      }
    }

    const keyModel = new WorldEditorModel(world);
    keyModel.updateNpc('home-mother', { name: '鍵の比較', lines: ['通常会話'] }, HOME_AREA);
    const beforeLayout = areaLayout(HOME_AREA)!;
    const afterLayout = JSON.parse(prepareSave({ changes: keyModel.session.exportChanges() }, world).text);
    const keyShape = (layout: typeof beforeLayout) => ({
      root: Object.keys(layout).sort(),
      area: Object.keys(layout.area).sort(),
      npc: Object.keys(layout.interactions.find(item => item.id === 'home-mother')!).sort(),
    });
    expect(keyShape(afterLayout)).toEqual(keyShape(beforeLayout));
  }, 15000);
});

describe('人物一覧とバッジの派生ロジック（N3）', () => {
  it('一覧の件数・順番が現在の文書と一致し、追加・削除・Undo/Redo・エリア切替に追従する', () => {
    const model = new WorldEditorModel(buildWorld());
    const docNpcIds = (areaId: string) =>
      model.document.interactions.filter(item => item.areaId === areaId && item.kind === 'npc').map(npc => npc.id);
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toEqual(docNpcIds(HOME_AREA));
    expect(areaNpcs(model.document, 'town-main').map(npc => npc.id)).toEqual(docNpcIds('town-main'));
    expect(areaNpcs(model.document, 'town-main')).toHaveLength(6);
    expect(areaNpcs(model.document, 'shop-konbini-interior').map(npc => npc.id)).toEqual(docNpcIds('shop-konbini-interior'));

    const placed = { ...model.createNpc('friend', HOME_AREA), x: 4, y: 7, name: '新しい人', lines: ['こんにちは'] };
    model.commit(model.npcCandidate(placed, true));
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toEqual(docNpcIds(HOME_AREA));
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toContain(placed.id);
    expect(areaNpcs(model.document, HOME_AREA)).toHaveLength(2);

    model.removeNpc(placed.id, HOME_AREA);
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toEqual(['home-mother']);

    model.session.undo();
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toEqual(docNpcIds(HOME_AREA));
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toContain(placed.id);
    model.session.redo();
    expect(areaNpcs(model.document, HOME_AREA).map(npc => npc.id)).toEqual(['home-mother']);
  });

  it('もとからいる人・置いた人・店員・イベントありのバッジを返す', () => {
    const model = new WorldEditorModel(buildWorld());
    expect(npcBadges(model.npc('home-mother', undefined, HOME_AREA)!, model.document)).toEqual(['もとからいる人', 'イベントあり']);
    expect(npcBadges(model.npc('konbini-clerk', undefined, 'shop-konbini-interior')!, model.document)).toEqual(['もとからいる人', '店員']);
    expect(npcBadges(model.npc('bakery-indoor-clerk', undefined, 'shop-bakery-interior')!, model.document)).toEqual(['もとからいる人', '店員']);
    expect(npcBadges(model.npc('candy-shopkeeper', undefined, 'town-main')!, model.document)).toEqual(['もとからいる人']);
    expect(npcBadges(model.npc('school-teacher', undefined, 'school-classroom-interior')!, model.document)).toEqual(['もとからいる人']);

    const placed = { ...model.createNpc('clerk', HOME_AREA), x: 4, y: 7, name: '店員風の置いた人', lines: ['メモ'] };
    model.commit(model.npcCandidate(placed, true));
    expect(npcBadges(model.npc(placed.id, undefined, HOME_AREA)!, model.document)).toEqual(['置いた人']);
  });
});
