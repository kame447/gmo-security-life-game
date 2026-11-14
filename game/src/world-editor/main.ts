import './style.css';
import { DEFAULT_APPEARANCE } from '../core/appearance';
import { feetAtTile } from '../core/coords';
import type { EditorDocument, EditorObject, EditorInteraction } from '../editor/types';
import { canonicalJSON } from '../editor/schema';
import { Controls, DIRECTION_KEYS } from '../input/controls';
import { Game } from '../session/game';
import { Renderer, type RenderCamera } from '../render/renderer';
import { FURNITURE, furnitureById, furnitureVariant, nextFacing } from '../render/furniture/catalog';
import { furnitureThumbnail } from '../render/furniture/sprites';
import { personThumbnail } from '../render/people/thumbnails';
import { AREA_FACTORIES, buildWorld, isSolidTile } from '../world';
import { staleLayouts } from '../world/layouts';
import { HOME_AREA, WorldEditorModel } from './model';
import { hitItem } from './hit-test';
import { surfaceModule } from './surface-catalog';
import { EDITABLE_PEOPLE, npcEvents } from './npc';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const workspace = $('#workspace'), scene = $<HTMLCanvasElement>('#scene'), overlay = $<HTMLCanvasElement>('#overlay');
const renderer = new Renderer(scene), model = new WorldEditorModel(buildWorld()), controls = new Controls();
let world = model.runtime(), activeArea = HOME_AREA, selected: string | undefined, game: Game | undefined;
let selectedNpc: string | undefined, npcDraft=false;
let npcPlacement: EditorInteraction | undefined;
let npcDrag: { npc: EditorInteraction; adding: boolean; offsetX: number; offsetY: number } | undefined;
let npcGhost: { npc: EditorInteraction; adding: boolean; document: EditorDocument; valid: boolean } | undefined;
let ghost: { object: EditorObject; adding: boolean; document: EditorDocument; valid: boolean } | undefined;
let placement: EditorObject | undefined, surface: string | undefined, paint: EditorDocument | undefined;
let drag: { object: EditorObject; adding: boolean; offsetX: number; offsetY: number } | undefined;
let pan: { x: number; y: number; cx: number; cy: number } | undefined;
let pinch: { distance: number; zoom: number; x: number; y: number } | undefined;
let space = false, canSave = false, saveBusy = false, catalogTab = 'furniture';
const pointers = new Map<number, { x: number; y: number }>();
const camera: RenderCamera = { centerX: 128, centerY: 96, zoom: 3 };
const stale=staleLayouts(AREA_FACTORIES.map(create=>create()));
const savedCameras = new Map<string, RenderCamera>();
const categories: Record<string,string> = { seat:'いす・ソファ', table:'つくえ', bed:'ベッド', storage:'たな・収納', kitchen:'台所・家電', shop:'みせの什器', decor:'かざり・植物', wall:'窓・壁かけ' };
const status = (text: string) => { $('#status').textContent = text; };
const editing = () => !saveBusy && !npcDraft && !game && activeArea === HOME_AREA;
function local(e: { clientX: number; clientY: number }) { const r = workspace.getBoundingClientRect(); return { x:e.clientX-r.left,y:e.clientY-r.top }; }
function areaPoint(e: { clientX: number; clientY: number }) { const p = local(e); return renderer.screenToArea(p.x,p.y); }
function toScreen(x: number, y: number) {
  const origin = renderer.screenToArea(0,0), unit = renderer.screenToArea(1,1);
  return { x:(x-origin.x)/(unit.x-origin.x), y:(y-origin.y)/(unit.y-origin.y) };
}
function inside(e: { clientX: number; clientY: number }) { const p=local(e);return p.x>=0&&p.y>=0&&p.x<workspace.clientWidth&&p.y<workspace.clientHeight; }
function refresh() { world=model.runtime();ghost=undefined;npcGhost=undefined;paint=undefined;update(); }
function attempt(fn: () => void) { try { fn(); refresh(); status(''); } catch(error) { status((error as Error).message); update(); } }
function update() {
  const o = selected ? (ghost?.object.id===selected?ghost.object:model.object(selected)) : undefined;
  const npc=selectedNpc?(npcGhost?.npc.id===selectedNpc?npcGhost.npc:model.npc(selectedNpc)):undefined;
  $('#properties').hidden=(!o&&!npc)||!!game||activeArea!==HOME_AREA;
  $('#npc-properties').hidden=!npc;
  if (o) {
    $('#object-name').textContent = furnitureById(o.catalogId ?? '')?.name ?? ({desk:'学習づくえ',lowtable:'ローテーブル',sofa:'ソファ'}[o.kind] ?? o.kind);
    $('#object-position').textContent=`位置 ${o.x}, ${o.y}　足元 ${o.w}×${o.h}　向き ${o.facing ?? 'down'}`;
    $('#object-id').textContent=`ID ${o.id}（変更できません）`;
    $('#object-json').textContent=canonicalJSON(o);
    const reason=model.protectedReason(o.id);$('#protection').textContent=reason;
    $<HTMLButtonElement>('#delete').disabled=!editing()||!!reason||!!placement;
    $<HTMLButtonElement>('#rotate').disabled=!editing()||!o.catalogId;
    $<HTMLButtonElement>('#duplicate').disabled=!editing()||!o.catalogId||!!placement;
  }
  if(npc){
    $('#object-name').textContent=npc.name;$('#object-position').textContent=`位置 ${npc.x}, ${npc.y}　足元 1×1`;
    $('#object-id').textContent=`ID ${npc.id}（変更できません）`;$('#object-json').textContent=canonicalJSON(npc);
    const reason=model.npcProtectedReason(npc.id);$('#protection').textContent=reason;
    $<HTMLButtonElement>('#delete').disabled=!editing()||!!reason||!!npcPlacement;$<HTMLButtonElement>('#rotate').disabled=!editing();$<HTMLButtonElement>('#duplicate').disabled=true;
    if(!npcDraft){$<HTMLInputElement>('#npc-name').value=npc.name;$<HTMLSelectElement>('#npc-facing').value=npc.facing??'down';
      $<HTMLTextAreaElement>('#npc-lines').value=npc.lines.join('\n');$<HTMLInputElement>('#npc-sprite').value=npc.sprite??'';}
    $<HTMLInputElement>('#npc-event-key').value=npc.eventKey;
    for(const field of document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('#npc-properties input,#npc-properties textarea,#npc-properties select'))field.disabled=saveBusy||!!game||!!npcPlacement||activeArea!==HOME_AREA;
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-npc-sprite]')){button.disabled=saveBusy||!!game||!!npcPlacement;button.setAttribute('aria-pressed',String(button.dataset.npcSprite===$<HTMLInputElement>('#npc-sprite').value));}
    for(const button of ['#npc-apply','#npc-revert'])$<HTMLButtonElement>(button).disabled=!npcDraft||saveBusy||!!game;
    const events=npcEvents(npc);$('#npc-event-note').textContent=events.length?`この人には条件つきのイベントの会話が${events.length}件あります。条件を満たすとそちらが出ます。ここで編集するのは、ふだんの会話です。`:'';
    $('#npc-events').replaceChildren();for(const event of events){const li=document.createElement('li');li.textContent=event.title;$('#npc-events').append(li);}
  }
  $<HTMLButtonElement>('#undo').disabled=!editing()||!model.session.canUndo;
  $<HTMLButtonElement>('#redo').disabled=!editing()||!model.session.canRedo;
  $<HTMLButtonElement>('#save').disabled=!editing()||!canSave||!model.dirty;
  $('#dirty').textContent=`未保存 ${model.dirty+Number(npcDraft)}`;$('#zoom').textContent=`${camera.zoom*100}%`;
  $('#location').textContent=activeArea===HOME_AREA?'じぶんのいえ':'まち（表示のみ）';
  $('#outside').textContent=activeArea===HOME_AREA?'← まちへ':'へやを開く';
  $<HTMLButtonElement>('#outside').disabled=saveBusy||npcDraft;
  $<HTMLButtonElement>('#play').disabled=saveBusy||npcDraft;
  $('#play').textContent=game?'編集に戻る':'▶ 歩いて確かめる';
  $('#catalog').hidden=!!game;$('#play-controls').hidden=!game;
  $('#stop-placement').hidden=!placement&&!npcPlacement&&!surface;
}
function cancelGesture() { placement=undefined;npcPlacement=undefined;drag=undefined;npcDrag=undefined;npcGhost=undefined;pan=undefined;paint=undefined;ghost=undefined;world=model.runtime();update(); }
function openArea(id: string) {
  savedCameras.set(activeArea,{...camera});cancelGesture();activeArea=id;selected=undefined;selectedNpc=undefined;
  Object.assign(camera,savedCameras.get(id) ?? (id===HOME_AREA?{centerX:128,centerY:96,zoom:3}:{centerX:35*16,centerY:31*16,zoom:3}));
  status(id===HOME_AREA?'':'この段階では、まちは表示のみです。家をダブルクリックすると部屋へ入れます');update();workspace.focus();
}
function preview(object: EditorObject, adding: boolean) {
  const candidate=model.candidate(object,adding), errors=model.issues(candidate);
  ghost={object,adding,document:candidate,valid:!errors.length};world=model.runtime(candidate);
  status(errors[0]??'離すと配置できます');update();
}
function previewNpc(npc: EditorInteraction, adding = false){
  const candidate=model.npcCandidate(npc,adding),errors=model.issues(candidate);
  npcGhost={npc,adding,document:candidate,valid:!errors.length};world=model.runtime(candidate);status(errors[0]??'離すと配置できます');update();
}
function startNpcPlacement(npc: EditorInteraction){
  cancelGesture();surface=undefined;npcPlacement=npc;selected=undefined;selectedNpc=npc.id;
  const area=world.areas.get(HOME_AREA)!;
  for(let y=1;y<area.height-1;y++)for(let x=1;x<area.width-1;x++){
    const candidate={...npc,x,y};if(!model.issues(model.npcCandidate(candidate,true)).length){npcPlacement=candidate;previewNpc(candidate,true);return;}
  }
  previewNpc(npc,true);
}
function startPlacement(object: EditorObject) {
  cancelGesture();surface=undefined;placement=object;selected=object.id;selectedNpc=undefined;
  const area=world.areas.get(HOME_AREA)!;
  for(let y=1;y<area.height-1;y++) for(let x=1;x<area.width-1;x++) {
    const candidate={...object,x,y};if(!model.issues(model.candidate(candidate,true)).length){placement=candidate;preview(candidate,true);return;}
  }
  preview(object,true);
}
function setZoom(zoom: number, anchor = { x:workspace.clientWidth/2,y:workspace.clientHeight/2 }) {
  if(game)return;
  const point=renderer.screenToArea(anchor.x,anchor.y), dpr=window.devicePixelRatio||1;
  camera.zoom=Math.max(1,Math.min(6,zoom));
  camera.centerX=point.x-(anchor.x-workspace.clientWidth/2)*dpr/camera.zoom;
  camera.centerY=point.y-(anchor.y-workspace.clientHeight/2)*dpr/camera.zoom;update();
}
function catalogue() {
  const list=$('#catalog-items');list.replaceChildren();
  $('#furniture-tab').setAttribute('aria-pressed',String(catalogTab==='furniture'));
  $('#surface-tab').setAttribute('aria-pressed',String(catalogTab==='surface'));
  $('#people-tab').setAttribute('aria-pressed',String(catalogTab==='people'));
  $('#category').hidden=catalogTab!=='furniture';
  const entries=catalogTab==='furniture'?FURNITURE.filter(o=>$<HTMLSelectElement>('#category').value==='all'||o.category===$<HTMLSelectElement>('#category').value):catalogTab==='people'?EDITABLE_PEOPLE:(surfaceModule?.SURFACES??[]);
  for(const entry of entries) {
    const button=document.createElement('button');button.type='button';
    if(catalogTab==='people')button.dataset.personId=entry.id;else button.dataset.catalogId=entry.id;
    button.append(catalogTab==='furniture'?furnitureThumbnail(entry.id):catalogTab==='people'?personThumbnail(entry.id,'down',48):surfaceModule!.surfaceThumbnail(entry.id));
    const name=document.createElement('span');name.textContent=entry.name;button.append(name);list.append(button);
    const choose=()=>{if(!editing())return;if(catalogTab==='surface'){cancelGesture();surface=entry.id;status('塗る場所をドラッグしてください');update();}
      else if(catalogTab==='people')startNpcPlacement(model.createNpc(entry.id));else startPlacement(model.create(entry.id));};
    button.addEventListener('pointerdown',e=>{e.preventDefault();choose();if(!editing())return;if(npcPlacement)npcDrag={npc:npcPlacement,adding:true,offsetX:0,offsetY:0};
      else if(placement)drag={object:placement,adding:true,offsetX:Math.floor(placement.w/2),offsetY:Math.floor(placement.h/2)};});
    button.addEventListener('click',e=>{if(e.detail===0)choose();});
  }
  if(!entries.length){const p=document.createElement('p');p.textContent='このカタログは準備中です';list.append(p);}
}
for(const [category,name] of Object.entries(categories)){if(!FURNITURE.some(f=>f.category===category))continue;const o=document.createElement('option');o.value=category;o.textContent=name;$('#category').append(o);}
$('#category').addEventListener('change',catalogue);
$('#furniture-tab').onclick=()=>{if(saveBusy||npcDraft)return;catalogTab='furniture';surface=undefined;cancelGesture();catalogue();};
$('#surface-tab').onclick=()=>{if(saveBusy||npcDraft)return;catalogTab='surface';cancelGesture();catalogue();};
$('#people-tab').onclick=()=>{if(saveBusy||npcDraft)return;catalogTab='people';surface=undefined;cancelGesture();catalogue();};
$('#stop-placement').onclick=()=>{surface=undefined;cancelGesture();status('');};
function brush(e: PointerEvent) {
  if(!paint||!surface)return;const p=areaPoint(e),x=Math.floor(p.x/16),y=Math.floor(p.y/16),area=paint.areas.find(a=>a.id===HOME_AREA)!;
  if(x<0||y<0||x>=area.width||y>=area.height)return;
  const id=y*area.width+x;
  const previous=area.surfaces?structuredClone(area.surfaces):undefined;
  area.surfaces??={palette:[],cells:Array(area.width*area.height).fill(0)};
  if(!area.surfaces.palette.includes(surface))area.surfaces.palette.push(surface);
  area.surfaces.cells[id]=area.surfaces.palette.indexOf(surface)+1;
  const errors=model.issues(paint);
  if(errors.length){if(previous)area.surfaces=previous;else delete area.surfaces;status('床の柄は床に、壁紙は奥の壁に塗ってください');}
  else{world=model.runtime(paint);status('離すと塗った範囲を確定します');}
}
workspace.addEventListener('pointerdown',e=>{
  if((e.target as HTMLElement).closest('aside,button,details,#walk-dialog')||game||npcDraft)return;
  if((ghost&&!placement)||(npcGhost&&!npcPlacement)){ghost=undefined;npcGhost=undefined;world=model.runtime();}
  workspace.focus();pointers.set(e.pointerId,local(e));workspace.setPointerCapture(e.pointerId);
  if(pointers.size===2){cancelGesture();const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},anchor=renderer.screenToArea(mid.x,mid.y);pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:camera.zoom,x:anchor.x,y:anchor.y};return;}
  if(editing()&&surface){paint=model.document;brush(e);return;}
  const point=areaPoint(e),hit=hitItem(world.areas.get(activeArea)!,point.x,point.y);
  if(editing()&&placement){placement={...placement,x:Math.floor(point.x/16),y:Math.floor(point.y/16)};drag={object:placement,adding:true,offsetX:0,offsetY:0};preview(placement,true);return;}
  if(editing()&&npcPlacement){npcPlacement={...npcPlacement,x:Math.floor(point.x/16),y:Math.floor(point.y/16)};npcDrag={npc:npcPlacement,adding:true,offsetX:0,offsetY:0};previewNpc(npcPlacement,true);return;}
  if(editing()&&hit?.table==='objects'&&!space&&e.button!==1){selected=hit.id;selectedNpc=undefined;const o=model.object(hit.id)!;drag={object:o,adding:false,offsetX:Math.floor(point.x/16)-o.x,offsetY:Math.floor(point.y/16)-o.y};update();return;}
  if(editing()&&hit?.table==='interactions'&&!space&&e.button!==1){selected=undefined;selectedNpc=hit.id;const npc=model.npc(hit.id)!;npcDrag={npc,adding:false,offsetX:Math.floor(point.x/16)-npc.x,offsetY:Math.floor(point.y/16)-npc.y};update();return;}
  selected=undefined;selectedNpc=undefined;
  pan={x:e.clientX,y:e.clientY,cx:camera.centerX,cy:camera.centerY};update();
});
window.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,local(e));
  if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()],dpr=window.devicePixelRatio||1;
    camera.zoom=Math.max(1,Math.min(6,Math.round(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance)));
    camera.centerX=pinch.x-((a.x+b.x)/2-workspace.clientWidth/2)*dpr/camera.zoom;
    camera.centerY=pinch.y-((a.y+b.y)/2-workspace.clientHeight/2)*dpr/camera.zoom;update();return;}
  if(paint){brush(e);return;}
  if(pan){const scale=camera.zoom/(window.devicePixelRatio||1);camera.centerX=pan.cx-(e.clientX-pan.x)/scale;camera.centerY=pan.cy-(e.clientY-pan.y)/scale;return;}
  if(npcDrag&&inside(e)){const p=areaPoint(e);previewNpc({...npcDrag.npc,x:Math.floor(p.x/16)-npcDrag.offsetX,y:Math.floor(p.y/16)-npcDrag.offsetY},npcDrag.adding);return;}
  if(drag&&inside(e)){const p=areaPoint(e);preview({...drag.object,x:Math.floor(p.x/16)-drag.offsetX,y:Math.floor(p.y/16)-drag.offsetY},drag.adding);}
});
window.addEventListener('pointerup',e=>{
  pointers.delete(e.pointerId);
  if(pinch){if(pointers.size<2)pinch=undefined;return;}
  if(paint){const candidate=paint;paint=undefined;attempt(()=>model.commit(candidate));}
  else if(npcDrag&&npcGhost&&inside(e)){npcPlacement=undefined;if(npcGhost.valid){const candidate=npcGhost.document;attempt(()=>model.commit(candidate));}else{world=model.runtime();npcGhost=undefined;update();}}
  else if(drag&&ghost&&inside(e)){if(ghost.valid){const candidate=ghost.document;placement=undefined;attempt(()=>model.commit(candidate));}else{placement=undefined;world=model.runtime();ghost=undefined;update();}}
  drag=undefined;npcDrag=undefined;pan=undefined;
});
window.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch=undefined;cancelGesture();controls.clear();});
workspace.addEventListener('dblclick',e=>{if(activeArea!=='town-main'||game)return;const p=areaPoint(e),hit=hitItem(world.areas.get(activeArea)!,p.x,p.y);if(hit&&world.areas.get(activeArea)!.objects.find(o=>o.id===hit.id)?.facilityId==='home-family')openArea(HOME_AREA);});
workspace.addEventListener('wheel',e=>{if(game)return;e.preventDefault();if(e.ctrlKey||e.metaKey)setZoom(camera.zoom+(e.deltaY<0?1:-1),local(e));else{camera.centerX+=e.deltaX*(window.devicePixelRatio||1)/camera.zoom;camera.centerY+=e.deltaY*(window.devicePixelRatio||1)/camera.zoom;}},{passive:false});
$('#outside').onclick=()=>{if(!game)openArea(activeArea===HOME_AREA?'town-main':HOME_AREA);};
$('#zoom-in').onclick=()=>setZoom(camera.zoom+1);$('#zoom-out').onclick=()=>setZoom(camera.zoom-1);
$('#undo').onclick=()=>{cancelGesture();attempt(()=>model.session.undo());};$('#redo').onclick=()=>{cancelGesture();attempt(()=>model.session.redo());};
$('#rotate').onclick=()=>{
  if(selectedNpc){if(npcPlacement){const directions=['down','left','up','right'] as const;
      npcPlacement={...npcPlacement,facing:directions[(directions.indexOf(npcPlacement.facing??'down')+1)%4]};previewNpc(npcPlacement,true);}
    else attempt(()=>model.rotateNpc(selectedNpc!));return;}
  const o=placement??(selected?model.object(selected):undefined);if(!o?.catalogId)return;
  const facing=nextFacing(o.catalogId,o.facing),variant=furnitureVariant(o.catalogId,facing)!;
  const rotated={...o,facing,w:variant.w,h:variant.h};
  if(placement){placement=rotated;if(drag)drag.object=rotated;preview(rotated,true);}
  else {const candidate=model.candidate(rotated);if(model.issues(candidate).length)preview(rotated,false);else attempt(()=>model.commit(candidate));}
};
$('#duplicate').onclick=()=>{if(selected)try{startPlacement(model.duplicate(selected));}catch(error){status((error as Error).message);}};
$('#delete').onclick=()=>{if(selectedNpc)attempt(()=>{model.removeNpc(selectedNpc!);selectedNpc=undefined;});else if(selected)attempt(()=>{model.remove(selected!);selected=undefined;});};
for(const person of EDITABLE_PEOPLE){
  const button=document.createElement('button');button.type='button';button.dataset.npcSprite=person.id;button.title=person.name;button.setAttribute('aria-label',person.name);
  button.append(personThumbnail(person.id,'down',48));
  button.onclick=()=>{if(saveBusy||game||npcPlacement||!selectedNpc)return;$<HTMLInputElement>('#npc-sprite').value=person.id;npcDraft=true;update();};
  $('#npc-sprites').append(button);
}
for(const selector of ['#npc-name','#npc-facing','#npc-lines'])$(selector).addEventListener(selector==='#npc-facing'?'change':'input',()=>{
  if(saveBusy||game||!selectedNpc)return;npcDraft=true;status('「変更を反映」で入力を確定します');update();
});
$('#npc-apply').onclick=()=>{
  if(saveBusy||game||!selectedNpc||!npcDraft)return;
  attempt(()=>{model.updateNpc(selectedNpc!,{name:$<HTMLInputElement>('#npc-name').value,
    facing:$<HTMLSelectElement>('#npc-facing').value as EditorInteraction['facing'],
    sprite:$<HTMLInputElement>('#npc-sprite').value,
    lines:$<HTMLTextAreaElement>('#npc-lines').value.replace(/\r\n?/g,'\n').split('\n')});npcDraft=false;});
};
$('#npc-revert').onclick=()=>{npcDraft=false;refresh();status('入力を取り消しました');};
$('#npc-properties').addEventListener('keydown',e=>{
  if(e.isComposing||e.keyCode===229)return;
  if(e.code==='Escape'&&npcDraft){e.preventDefault();e.stopPropagation();$('#npc-revert').click();}
});
$('#play').onclick=()=>{
  controls.clear();cancelGesture();
  if(game){game=undefined;refresh();}
  else{game=new Game(world,{phoneClock:()=>0,phoneEpochClock:()=>0});const entry=[...world.areas.values()].flatMap(a=>a.def.portals).find(p=>p.to.areaId===activeArea)?.to;
    if(entry)game.player={areaId:activeArea,...feetAtTile(entry.x,entry.y),facing:entry.facing};status('矢印・WASDで歩く／Z・Space・Enterで話す／Escで編集へ');}
  update();workspace.focus();
};
$('#walk-action').onclick=()=>{controls.clear();game?.action();};$('#walk-dialog').onclick=()=>game?.action();
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')){
  button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);controls.press(`touch-${e.pointerId}`,button.dataset.direction as 'up');};
  button.onpointerup=button.onpointercancel=e=>{controls.release(`touch-${e.pointerId}`);};
}
window.addEventListener('keydown',e=>{
  if(e.isComposing||e.keyCode===229)return;
  if($<HTMLDialogElement>('#save-confirm').open||((e.target as HTMLElement).closest('input,select,textarea')))return;
  if(game){if(e.code==='Escape'){$('#play').click();e.preventDefault();return;}if((e.target as HTMLElement).closest('button'))return;
    if(DIRECTION_KEYS[e.code]){controls.press(e.code,DIRECTION_KEYS[e.code]);e.preventDefault();}else if(e.code.startsWith('Shift'))controls.pressRun(e.code);
    else if(['KeyZ','Space','Enter'].includes(e.code)&&!e.repeat){controls.clear();game.action();e.preventDefault();}return;}
  if(e.code==='Escape'){surface=undefined;selected=undefined;selectedNpc=undefined;npcDraft=false;cancelGesture();status('');return;}
  if(!editing()||(e.target as HTMLElement).closest('button,summary'))return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();(e.shiftKey?$('#redo'):$('#undo')).click();}
  else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();$('#redo').click();}
  else if((e.ctrlKey||e.metaKey)&&e.code==='KeyD'){e.preventDefault();$('#duplicate').click();}
  else if(e.code==='KeyR'&&!e.repeat){e.preventDefault();$('#rotate').click();}
  else if(['Delete','Backspace'].includes(e.code)){e.preventDefault();$('#delete').click();}
  else if(e.code==='Space'){space=true;e.preventDefault();}
});
window.addEventListener('keyup',e=>{controls.release(e.code);if(e.code==='Space')space=false;});
window.addEventListener('blur',()=>{controls.clear();space=false;});document.addEventListener('visibilitychange',()=>controls.clear());

let savePayload: unknown;
let writing = false;
const saveDialog=$<HTMLDialogElement>('#save-confirm');
const requestSave=async(route:string,payload:unknown)=>{
  const r=await fetch(`/__world-editor/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-World-Editor':'1'},body:JSON.stringify(payload)});
  const result=await r.json();if(!r.ok)throw new Error(result.error??'保存できませんでした');return result;
};
$('#save').onclick=async()=>{
  if(!editing()||!canSave||!model.dirty)return;
  saveBusy=true;
  try{cancelGesture();savePayload={areaId:HOME_AREA,changes:model.session.exportChanges()};
    const preview=await requestSave('preview',savePayload);$('#save-target').textContent=preview.target;$('#changes').replaceChildren();
    for(const change of preview.summary){const li=document.createElement('li');li.textContent=`${({add:'追加',delete:'削除',move:'移動',update:'変更'} as Record<string,string>)[change.type]} ${change.id}`;$('#changes').append(li);}
    $('#save-error').textContent='';saveDialog.showModal();
  }catch(error){saveBusy=false;savePayload=undefined;update();status((error as Error).message);}
};
saveDialog.addEventListener('cancel',e=>{if(writing)e.preventDefault();});
saveDialog.addEventListener('close',()=>{if(!writing){saveBusy=false;savePayload=undefined;update();}});
$('#save-cancel').onclick=()=>{if(!writing)saveDialog.close();};
$('#save-download').onclick=()=>{const url=URL.createObjectURL(new Blob([canonicalJSON(savePayload)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='home-layout-changes.json';link.click();URL.revokeObjectURL(url);};
$('#save-commit').onclick=async()=>{
  if(writing||!saveBusy||!saveDialog.open||!savePayload)return;
  const button=$<HTMLButtonElement>('#save-commit'),cancel=$<HTMLButtonElement>('#save-cancel');
  writing=true;button.disabled=true;cancel.disabled=true;
  try{await requestSave('save',savePayload);model.markSaved();saveDialog.close();status('配置を保存しました');}
  catch(error){$('#save-error').textContent=(error as Error).message;}
  finally{writing=false;saveBusy=saveDialog.open;button.disabled=false;cancel.disabled=false;update();}
};
void fetch('/__world-editor/status').then(r=>r.json()).then(r=>{canSave=!!r.enabled&&!stale.length&&!matchMedia('(max-width:700px)').matches&&navigator.maxTouchPoints===0;update();if(stale.length)status('生成元が変わっています。配置の移行を確認するまで保存できません');else if(!canSave)status('スマホでは編集と試し歩きまで使えます。保存はPCで行います');}).catch(()=>{status('この起動方法ではファイルへ保存できません');});

function overlays() {
  const c=overlay.getContext('2d')!,dpr=window.devicePixelRatio||1;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,workspace.clientWidth,workspace.clientHeight);
  if(game)return;const area=world.areas.get(activeArea)!,layers=new Set([...document.querySelectorAll<HTMLInputElement>('[data-layer]:checked')].map(i=>i.dataset.layer));
  const box=(x:number,y:number,w:number,h:number,color:string)=>{const p=toScreen(x*16,y*16),q=toScreen((x+w)*16,(y+h)*16);c.fillStyle=color;c.fillRect(p.x,p.y,q.x-p.x,q.y-p.y);};
  if(layers.has('collision'))for(let y=0;y<area.height;y++)for(let x=0;x<area.width;x++)if(isSolidTile(area,x,y))box(x,y,1,1,'#c74e3d66');
  if(layers.has('portals'))for(const p of area.def.portals)box(p.from.x,p.from.y,p.from.w??1,1,'#4bbce299');
  if(layers.has('reachable')){
    const incoming=[...world.areas.values()].flatMap(a=>a.def.portals).find(p=>p.to.areaId===activeArea)?.to??world.start;
    const seen=new Set<number>(),queue=[{x:incoming.x,y:incoming.y}];
    for(let i=0;i<queue.length;i++){const p=queue[i],index=p.y*area.width+p.x;if(p.x<0||p.y<0||p.x>=area.width||p.y>=area.height||seen.has(index)||isSolidTile(area,p.x,p.y))continue;seen.add(index);const at=toScreen((p.x+.5)*16,(p.y+.5)*16);c.fillStyle='#32d77c';c.beginPath();c.arc(at.x,at.y,2.5,0,Math.PI*2);c.fill();if(area.portalAt.has(index))continue;queue.push({x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1});}
  }
  if(layers.has('grid')){c.strokeStyle='#e4f3ec33';c.lineWidth=1;for(let x=0;x<=area.width;x++){const a=toScreen(x*16,0),b=toScreen(x*16,area.height*16);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}for(let y=0;y<=area.height;y++){const a=toScreen(0,y*16),b=toScreen(area.width*16,y*16);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}
  if(layers.has('ids')){c.font='11px system-ui';for(const item of [...area.interactions,...area.def.portals.map(p=>({id:p.id,...p.from}))]){const p=toScreen(item.x*16,item.y*16);c.fillStyle='#20303be6';c.fillRect(p.x,p.y-14,c.measureText(item.id).width+8,16);c.fillStyle='#ffe5a0';c.fillText(item.id,p.x+4,p.y-2);}}
  const o=ghost?.object??(selected?model.object(selected):undefined);
  if(o&&activeArea===HOME_AREA){box(o.x,o.y,o.w,o.h,ghost?(ghost.valid?'#3bc87866':'#e15e5266'):'#ffffff18');const p=toScreen(o.x*16,o.y*16),q=toScreen((o.x+o.w)*16,(o.y+o.h)*16);c.strokeStyle=ghost?(ghost.valid?'#6bff9c':'#ff857b'):'#fff';c.lineWidth=2;c.setLineDash([5,3]);c.strokeRect(p.x,p.y,q.x-p.x,q.y-p.y);c.setLineDash([]);}
  const npc=npcGhost?.npc??(selectedNpc?model.npc(selectedNpc):undefined);
  if(npc&&activeArea===HOME_AREA){box(npc.x,npc.y,1,1,npcGhost?(npcGhost.valid?'#3bc87866':'#e15e5266'):'#ffffff18');const p=toScreen(npc.x*16,npc.y*16),q=toScreen((npc.x+1)*16,(npc.y+1)*16);c.strokeStyle=npcGhost?(npcGhost.valid?'#6bff9c':'#ff857b'):'#fff';c.lineWidth=2;c.setLineDash([5,3]);c.strokeRect(p.x,p.y,q.x-p.x,q.y-p.y);c.setLineDash([]);}
}
function resize(){renderer.resize(workspace.clientWidth,workspace.clientHeight,window.devicePixelRatio||1);overlay.width=scene.width;overlay.height=scene.height;overlay.style.width=scene.style.width;overlay.style.height=scene.style.height;}
new ResizeObserver(resize).observe(workspace);resize();
let previous=performance.now(),accumulator=0;
function frame(now:number){accumulator+=Math.min(.25,(now-previous)/1000);previous=now;
  while(accumulator>=1/120){if(game)game.update(1/120,controls.state());accumulator-=1/120;}
  const view=game?{area:game.area,player:game.player,appearance:game.appearance,moving:game.moving,walkTime:game.walkTime,dialog:game.dialog,
    camera:{centerX:game.player.x,centerY:game.player.y,zoom:camera.zoom},instant:true}:{area:world.areas.get(activeArea)!,player:{...feetAtTile(0,0),facing:'down' as const},appearance:DEFAULT_APPEARANCE,moving:false,walkTime:0,dialog:{},camera,hidePlayer:true,instant:true};
  renderer.draw(view,now/1000);overlays();
  $('#walk-dialog').hidden=!game?.dialog;if(game?.dialog){$('#walk-dialog strong').textContent=game.dialog.speaker;$('#walk-dialog p').textContent=game.dialog.lines[game.dialog.index];}
  requestAnimationFrame(frame);
}
Object.defineProperty(window,'__worldEditor',{value:{model,renderer,camera,toScreen,get game(){return game;},get activeArea(){return activeArea;},get ghost(){return ghost;},get npcGhost(){return npcGhost;}}});
catalogue();update();requestAnimationFrame(frame);
