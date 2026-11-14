import {describe,expect,it} from 'vitest';
import {WorldEditorModel,HOME_AREA} from '../src/world-editor/model';
import {assertInteriorEdit} from '../src/world-editor/policy';
import {npcEvents} from '../src/world-editor/npc';
import {buildWorld,validateWorld} from '../src/world';
import {Game} from '../src/session/game';
import {feetAtTile} from '../src/core/coords';
import {LifeEventDirector} from '../src/events/director';
import {LifeState} from '../src/events/life-state';
import {CHILDHOOD_SAMPLE_EVENTS} from '../src/events/samples/childhood';

const id='home-mother';
describe('実ワールドの既存NPCの編集',()=>{
  it('母を2マス動かし、向き/名前/通常会話を変更してもIDとイベントを保つ',()=>{
    const model=new WorldEditorModel(buildWorld()),source=model.npc(id)!;
    model.updateNpc(id,{y:source.y+2});model.rotateNpc(id);
    model.updateNpc(id,{name:'検証用の表示名',lines:['編集したふだんの会話です。','2行目も保ちます。']});
    expect(model.npc(id)).toMatchObject({id,eventKey:'home.mother',kind:'npc',solid:true,x:13,y:6,facing:'up',name:'検証用の表示名'});
    expect(model.npc(id)!.lines).toEqual(['編集したふだんの会話です。','2行目も保ちます。']);
    expect(validateWorld(model.runtime())).toEqual([]);
    model.session.undo();expect(model.npc(id)!.lines).toEqual(source.lines);model.session.redo();expect(model.npc(id)!.name).toBe('検証用の表示名');
  });
  it('元NPCの削除/キー変更/自己キーへの付替え/種類/足元/衝突変更を独立した方針でも拒否する',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;
    expect(model.npcProtectedReason(id)).toContain('消せません');
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
      expect(()=>model.updateNpc(id,{x,y})).toThrow();expect(model.document).toEqual(before);expect(model.session.canUndo).toBe(false);
    }
    for(const patch of [{name:''},{lines:[]},{lines:[' ']},{sprite:'player'},{sprite:'unregistered-person'}]){
      expect(()=>model.updateNpc(id,patch)).toThrow();expect(model.document).toEqual(before);
    }
  });
  it('通れる敷物には置け、他エリア/既存家具/タブレットのリンクを変えない',()=>{
    const model=new WorldEditorModel(buildWorld()),before=model.document;model.updateNpc(id,{x:4,y:7});
    expect(model.npc(id)).toMatchObject({x:4,y:7});expect(model.document.objects).toEqual(before.objects);
    expect(model.document.interactions.filter(i=>i.id!==id)).toEqual(before.interactions.filter(i=>i.id!==id));
    expect(model.document.portals).toEqual(before.portals);expect(validateWorld(model.runtime())).toEqual([]);
  });
  it('試し歩きは編集した通常会話、実イベントの条件前/1回目/後は既存の分岐どおり',()=>{
    const model=new WorldEditorModel(buildWorld());model.updateNpc(id,{y:6,name:'検証用の表示名',lines:['編集したふだんの会話です。']});
    const world=model.runtime(),mother=model.npc(id)!,events=npcEvents(mother),definitions=structuredClone(CHILDHOOD_SAMPLE_EVENTS);
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
