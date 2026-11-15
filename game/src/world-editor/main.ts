import './style.css';
import { DEFAULT_APPEARANCE } from '../core/appearance';
import { feetAtTile } from '../core/coords';
import type { EditorDocument, EditorObject, EditorInteraction } from '../editor/types';
import { canonicalJSON } from '../editor/schema';
import { Controls, DIRECTION_KEYS } from '../input/controls';
import { Game } from '../session/game';
import { Renderer, type RenderCamera } from '../render/renderer';
import { FURNITURE, furnitureById } from '../render/furniture/catalog';
import { objectRotationReason, rotatedObjectVariant } from '../render/furniture/rotation';
import { furnitureThumbnail } from '../render/furniture/sprites';
import { personThumbnail } from '../render/people/thumbnails';
import { outdoorForObject, OUTDOOR } from '../render/outdoor/catalog';
import { outdoorThumbnail } from '../render/outdoor/thumbnails';
import { AREA_FACTORIES, buildWorld, isSolidTile } from '../world';
import { staleLayouts } from '../world/layouts';
import { HOME_AREA, WorldEditorModel } from './model';
import { hitItem } from './hit-test';
import { surfaceModule } from './surface-catalog';
import { areaNpcs, editablePerson, EDITABLE_PEOPLE, npcBadges, npcEvents, type NpcBadge } from './npc';
import { changedAreaIds, isEditableArea } from './world-policy';
import { OutdoorModel } from './outdoor';
import { resolveLandmarks } from '../world/landmark-resolve';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const workspace = $('#workspace'), scene = $<HTMLCanvasElement>('#scene'), overlay = $<HTMLCanvasElement>('#overlay');
const renderer = new Renderer(scene), model = new WorldEditorModel(buildWorld()), controls = new Controls();
const TOWN_AREA='town-main',outdoor=new OutdoorModel(model,TOWN_AREA);
let world = model.runtime(), activeArea = HOME_AREA, selected: string | undefined, game: Game | undefined;
let selectedNpc: string | undefined, npcDraft=false;
let npcListOpen = !window.matchMedia('(max-width:700px), (max-height:470px)').matches, npcListKey = '';
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
let overview=false;
const canvasView={x:0,y:0,scale:1},validationTimes:number[]=[];
const stale=staleLayouts(AREA_FACTORIES.map(create=>create()));
const savedCameras = new Map<string, RenderCamera>();
const savedOverviews=new Map<string,boolean>(),savedTabs=new Map<string,string>();
let returnToTown:{objectId:string;camera:RenderCamera;overview:boolean}|undefined;
const categories: Record<string,string> = { seat:'いす・ソファ', table:'つくえ', bed:'ベッド', storage:'たな・収納', kitchen:'台所・家電', shop:'みせの什器', decor:'かざり・植物', wall:'窓・壁かけ' };
const status = (text: string) => { $('#status').textContent = text; };
const editableArea=(id:string)=>isEditableArea(model.document,id);
const editing = () => !saveBusy && !npcDraft && !game && editableArea(activeArea);
const viewWorld=(document=model.document)=>model.runtime(document,[...new Set([activeArea,...changedAreaIds(model.initial,document)])]);
const objectAt=(id:string,document?:EditorDocument)=>model.object(id,document,activeArea);
const npcAt=(id:string,document?:EditorDocument)=>model.npc(id,document,activeArea);
const objectCandidate=(object:EditorObject,adding=false)=>activeArea===TOWN_AREA?outdoor.candidate(object,adding):model.candidate(object,adding);
const objectIssues=(document:EditorDocument)=>activeArea===TOWN_AREA?outdoor.issues(document):model.issues(document);
const objectMoveReason=(id:string)=>!editableArea(activeArea)?'このエリアは表示のみです':activeArea===TOWN_AREA?outdoor.readOnlyReason(id):'';
const objectDeleteReason=(id:string)=>activeArea===TOWN_AREA?outdoor.protectedReason(id):model.protectedReason(id);
function entrance(object:EditorObject){return object.facilityId?world.areas.get(object.areaId)?.def.portals.find(p=>p.facilityId===object.facilityId&&p.to.areaId!==object.areaId):undefined;}
function local(e: { clientX: number; clientY: number }) { const r = workspace.getBoundingClientRect(); return { x:e.clientX-r.left,y:e.clientY-r.top }; }
function screenArea(x:number,y:number){return renderer.screenToArea((x-canvasView.x)/canvasView.scale,(y-canvasView.y)/canvasView.scale);}
function areaPoint(e: { clientX: number; clientY: number }) { const p = local(e); return screenArea(p.x,p.y); }
function toScreen(x: number, y: number) {
  const origin = renderer.screenToArea(0,0), unit = renderer.screenToArea(1,1);
  return { x:(x-origin.x)/(unit.x-origin.x)*canvasView.scale+canvasView.x, y:(y-origin.y)/(unit.y-origin.y)*canvasView.scale+canvasView.y };
}
function inside(e: { clientX: number; clientY: number }) { const p=local(e);return p.x>=0&&p.y>=0&&p.x<workspace.clientWidth&&p.y<workspace.clientHeight; }
function refresh() { world=viewWorld();ghost=undefined;npcGhost=undefined;paint=undefined;update(); }
function attempt(fn: () => void) { try { fn(); refresh(); status(''); } catch(error) { status((error as Error).message); update(); } }
const BADGE_CLASSES: Record<NpcBadge, string> = {
  'もとからいる人': 'npc-badge-original',
  '置いた人': 'npc-badge-placed',
  '店員': 'npc-badge-clerk',
  'イベントあり': 'npc-badge-event',
};

function selectNpcFromList(entry: EditorInteraction) {
  if (saveBusy || npcDraft || game) {
    if (npcDraft) status('入力中の変更を反映するか取り消してから選び直してください');
    return;
  }
  cancelGesture();
  surface = undefined;
  selected = undefined;
  selectedNpc = entry.id;
  if (overview) {
    overview = false;
    camera.zoom = Math.max(camera.zoom, 3);
    resize();
  }
  camera.centerX = entry.x * 16 + 8;
  camera.centerY = entry.y * 16 + 8;
  update();
}

function renderNpcList(npcs: EditorInteraction[]) {
  $('#npc-list-title').textContent = `このエリアの人（${npcs.length}）`;
  const empty = $('#npc-list-empty');
  empty.hidden = npcs.length > 0;
  empty.textContent = npcs.length ? '' : editableArea(activeArea)
    ? 'このエリアに人はいません。「人」のタブから置けます'
    : 'このエリアに人はいません';
  const nextKey = [
    activeArea,
    selectedNpc ?? '',
    String(npcDraft),
    ...npcs.map(entry => [entry.id, entry.name, entry.sprite ?? '', entry.x, entry.y, entry.eventKey].join('\0')),
  ].join('\n');
  if (nextKey === npcListKey) return;
  npcListKey = nextKey;
  const list = $('#npc-list');
  list.replaceChildren();
  for (const entry of npcs) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'npc-row';
    button.dataset.npcListId = entry.id;
    button.setAttribute('aria-pressed', String(entry.id === selectedNpc));
    button.classList.toggle('locked', npcDraft && entry.id !== selectedNpc);
    const spriteId = editablePerson(entry.sprite ?? '')?.id ?? 'friend';
    const body = document.createElement('div');
    body.className = 'npc-row-body';
    const head = document.createElement('div');
    head.className = 'npc-row-head';
    const name = document.createElement('span');
    name.className = 'npc-row-name';
    name.textContent = entry.name;
    const pos = document.createElement('span');
    pos.className = 'npc-row-pos';
    pos.textContent = `${entry.x}, ${entry.y}`;
    head.append(name, pos);
    const badges = document.createElement('div');
    badges.className = 'npc-badges';
    for (const label of npcBadges(entry)) {
      const badge = document.createElement('span');
      badge.className = `npc-badge ${BADGE_CLASSES[label]}`;
      badge.textContent = label;
      badges.append(badge);
    }
    body.append(head, badges);
    button.append(personThumbnail(spriteId, 'down', 32), body);
    button.onclick = () => selectNpcFromList(entry);
    li.append(button);
    list.append(li);
  }
}

function update() {
  const o = selected ? (ghost?.object.id===selected?ghost.object:objectAt(selected)) : undefined;
  const npc=selectedNpc?(npcGhost?.npc.id===selectedNpc?npcGhost.npc:npcAt(selectedNpc)):undefined;
  if(selectedNpc&&!npc){selectedNpc=undefined;npcDraft=false;}
  const npcs=areaNpcs(model.document,activeArea);
  const showSelection=Boolean(o||npc),showNpcList=npcListOpen;
  $('#properties').hidden=!!game||(!showSelection&&!showNpcList);
  for(const selector of ['#object-name','#object-position','#selection-actions','#protection','#object-details'])$(selector).hidden=!showSelection;
  $('#npc-list-section').hidden=!showNpcList;
  const listToggle=$<HTMLButtonElement>('#npc-list-toggle');
  listToggle.textContent=`人物一覧 (${npcs.length})`;
  listToggle.setAttribute('aria-pressed',String(npcListOpen));
  listToggle.setAttribute('aria-expanded',String(npcListOpen));
  listToggle.disabled=!!game;
  if(showNpcList&&!game)renderNpcList(npcs);
  $('#npc-properties').hidden=!npc;
  $('#building-properties').hidden=!o||activeArea!==TOWN_AREA||(!o.facilityId&&outdoorForObject(o)?.category!=='building');
  if (o) {
    $('#object-name').textContent = world.facilities.get(o.facilityId??'')?.name??outdoorForObject(o)?.name??furnitureById(o.catalogId ?? '')?.name ?? ({desk:'学習づくえ',lowtable:'ローテーブル',sofa:'ソファ',blackboard:'黒板',window:'まど',tdesk:'教卓',sdesk:'机といす',shelf:'ロッカー',cooler:'冷蔵ケース',magazine:'雑誌ラック',shopshelf:'商品だな',counter:'レジカウンター',bookshelf:'本だな',kitchen:'キッチン',table:'テーブル',bench:'ベンチ'}[o.kind] ?? o.kind);
    $('#object-position').textContent=`位置 ${o.x}, ${o.y}　足元 ${o.w}×${o.h}`+(activeArea===TOWN_AREA?'':`　向き ${o.facing ?? 'down'}`);
    $('#object-id').textContent=`ID ${o.id}（変更できません）`;
    $('#object-json').textContent=canonicalJSON(o);
    const pending=placement?.id===o.id,moveReason=pending?'':objectMoveReason(o.id),reason=pending?'':objectDeleteReason(o.id);
    const rotationReason=activeArea===TOWN_AREA?outdoor.rotationReason(o.id):objectRotationReason(o);
    $('#protection').textContent=[moveReason,reason,rotationReason].filter(Boolean).join('。');
    $<HTMLButtonElement>('#delete').disabled=!editing()||!!reason||pending;
    $<HTMLButtonElement>('#rotate').disabled=!editing()||!!rotationReason;
    $<HTMLButtonElement>('#duplicate').disabled=!editing()||!!reason||!!moveReason||pending||(activeArea!==TOWN_AREA&&!o.catalogId);
    if(activeArea===TOWN_AREA){const door=entrance(o),facility=world.facilities.get(o.facilityId??'');
      const returns=[...world.areas.values()].flatMap(a=>a.def.portals).filter(p=>!!o.facilityId&&p.facilityId===o.facilityId&&p.to.areaId===TOWN_AREA);
      const room=door?world.areas.get(door.to.areaId):undefined;
      $('#building-links').textContent=[facility?`施設：${facility.name}`:'',door?`入口：${door.from.x}, ${door.from.y}`:'',room?`部屋：${room.def.name}`:'',
        ...returns.map(p=>`戻る位置：${p.to.x}, ${p.to.y}`),room?.interactions.length?`中の調べる場所・人：${room.interactions.map(i=>i.name).join('、')}`:'',
        (facility||outdoorForObject(o)?.category==='building')&&!door?'この建物の中は、まだ用意されていません':''].filter(Boolean).join('\n');
      $<HTMLButtonElement>('#enter-interior').disabled=!door||pending||saveBusy||npcDraft||!!game;
    }
  }
  if(npc){
    $('#object-name').textContent=npc.name;$('#object-position').textContent=`位置 ${npc.x}, ${npc.y}　足元 1×1`;
    $('#object-id').textContent=`ID ${npc.id}（変更できません）`;$('#object-json').textContent=canonicalJSON(npc);
    const reason=model.npcProtectedReason(npc.id,activeArea);$('#protection').textContent=reason;
    $<HTMLButtonElement>('#delete').disabled=!editing()||!!reason||!!npcPlacement;$<HTMLButtonElement>('#rotate').disabled=!editing();$<HTMLButtonElement>('#duplicate').disabled=true;
    if(!npcDraft){$<HTMLInputElement>('#npc-name').value=npc.name;$<HTMLSelectElement>('#npc-facing').value=npc.facing??'down';
      $<HTMLTextAreaElement>('#npc-lines').value=npc.lines.join('\n');$<HTMLInputElement>('#npc-sprite').value=npc.sprite??'';}
    $<HTMLInputElement>('#npc-event-key').value=npc.eventKey;
    for(const field of document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('#npc-properties input,#npc-properties textarea,#npc-properties select'))field.disabled=saveBusy||!!game||!!npcPlacement||!editableArea(activeArea);
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-npc-sprite]')){button.disabled=saveBusy||!!game||!!npcPlacement||!editableArea(activeArea);button.setAttribute('aria-pressed',String(button.dataset.npcSprite===$<HTMLInputElement>('#npc-sprite').value));}
    for(const button of ['#npc-apply','#npc-revert'])$<HTMLButtonElement>(button).disabled=!npcDraft||saveBusy||!!game;
    const events=npcEvents(npc);$('#npc-event-note').textContent=events.length?`この人には条件つきのイベントの会話が${events.length}件あります。条件を満たすとそちらが出ます。ここで編集するのは、ふだんの会話です。`:'';
    $('#npc-events').replaceChildren();for(const event of events){const li=document.createElement('li');li.textContent=event.title;$('#npc-events').append(li);}
  }
  $<HTMLButtonElement>('#undo').disabled=saveBusy||npcDraft||!!game||!model.session.canUndo;
  $<HTMLButtonElement>('#redo').disabled=saveBusy||npcDraft||!!game||!model.session.canRedo;
  $<HTMLButtonElement>('#save').disabled=saveBusy||npcDraft||!!game||!canSave||!model.dirty;
  $('#dirty').textContent=`未保存 ${model.dirty+Number(npcDraft)}`;$('#zoom').textContent=overview&&!game?'全体':`${camera.zoom*100}%`;
  $('#location').textContent=(world.areas.get(activeArea)?.def.name??activeArea)+(editableArea(activeArea)?'':'（表示のみ）');
  const areaSelect=$<HTMLSelectElement>('#area-select');areaSelect.value=activeArea;areaSelect.disabled=saveBusy||npcDraft||!!game;
  $('#outside').textContent=activeArea===TOWN_AREA?'じぶんのいえへ':'← まちへ';
  $<HTMLButtonElement>('#outside').disabled=saveBusy||npcDraft;
  $<HTMLButtonElement>('#play').disabled=saveBusy||npcDraft;
  $('#play').textContent=game?'編集に戻る':'▶ 歩いて確かめる';
  $('#catalog').hidden=!!game||!editableArea(activeArea);$('#play-controls').hidden=!game;
  $('#overview').hidden=activeArea!==TOWN_AREA||!!game;$('#landmarks-layer').hidden=activeArea!==TOWN_AREA;
  $('#stop-placement').hidden=!placement&&!npcPlacement&&!surface;
}
function cancelGesture() { placement=undefined;npcPlacement=undefined;drag=undefined;npcDrag=undefined;npcGhost=undefined;pan=undefined;paint=undefined;ghost=undefined;world=viewWorld();update(); }
function openArea(id: string) {
  if(saveBusy||npcDraft||game||!world.areas.has(id))return;
  savedCameras.set(activeArea,{...camera});savedOverviews.set(activeArea,overview);savedTabs.set(activeArea,catalogTab);
  cancelGesture();surface=undefined;activeArea=id;selected=undefined;selectedNpc=undefined;
  const area=world.areas.get(id)!;
  Object.assign(camera,savedCameras.get(id)??(id===TOWN_AREA?{centerX:35*16,centerY:31*16,zoom:3}:{centerX:area.width*8,centerY:area.height*8,zoom:3}));
  overview=savedOverviews.get(id)??false;catalogTab=savedTabs.get(id)??(id===TOWN_AREA?'props':'furniture');
  status(editableArea(id)?'':'このエリアは表示と試し歩きができます');catalogue();update();resize();workspace.focus();
}
function enterRoom(object:EditorObject){
  const door=entrance(object);if(!door||saveBusy||npcDraft||game)return;
  returnToTown={objectId:object.id,camera:{...camera},overview};openArea(door.to.areaId);
}
function backToTown(){
  if(saveBusy||npcDraft||game)return;const previous=returnToTown;openArea(TOWN_AREA);
  if(previous){Object.assign(camera,previous.camera);overview=previous.overview;selected=previous.objectId;update();resize();}
}
function preview(object: EditorObject, adding: boolean) {
  if(ghost&&ghost.adding===adding&&canonicalJSON(ghost.object)===canonicalJSON(object))return;
  const started=performance.now(),candidate=objectCandidate(object,adding), errors=objectIssues(candidate);
  validationTimes.push(performance.now()-started);if(validationTimes.length>120)validationTimes.shift();
  ghost={object,adding,document:candidate,valid:!errors.length};world=viewWorld(candidate);
  status(errors[0]??'離すと配置できます');update();
}
function previewNpc(npc: EditorInteraction, adding = false){
  const candidate=model.npcCandidate(npc,adding),errors=model.issues(candidate);
  npcGhost={npc,adding,document:candidate,valid:!errors.length};world=viewWorld(candidate);status(errors[0]??'離すと配置できます');update();
}
function startNpcPlacement(npc: EditorInteraction){
  cancelGesture();surface=undefined;npcPlacement=npc;selected=undefined;selectedNpc=npc.id;
  const area=world.areas.get(activeArea)!;
  if(activeArea===TOWN_AREA){const candidate={...npc,x:Math.max(0,Math.min(area.width-1,Math.floor(camera.centerX/16))),y:Math.max(0,Math.min(area.height-1,Math.floor(camera.centerY/16)))};
    npcPlacement=candidate;previewNpc(candidate,true);return;}
  for(let y=1;y<area.height-1;y++)for(let x=1;x<area.width-1;x++){
    const candidate={...npc,x,y};if(!model.issues(model.npcCandidate(candidate,true)).length){npcPlacement=candidate;previewNpc(candidate,true);return;}
  }
  previewNpc(npc,true);
}
function startPlacement(object: EditorObject) {
  cancelGesture();surface=undefined;placement=object;selected=object.id;selectedNpc=undefined;
  const area=world.areas.get(activeArea)!;
  if(activeArea===TOWN_AREA){const candidate={...object,x:Math.max(0,Math.min(area.width-object.w,Math.floor(camera.centerX/16))),y:Math.max(0,Math.min(area.height-object.h,Math.floor(camera.centerY/16)))};
    placement=candidate;preview(candidate,true);return;}
  for(let y=1;y<area.height-1;y++) for(let x=1;x<area.width-1;x++) {
    const candidate={...object,x,y};if(!objectIssues(objectCandidate(candidate,true)).length){placement=candidate;preview(candidate,true);return;}
  }
  preview(object,true);
}
function setZoom(zoom: number, anchor = { x:workspace.clientWidth/2,y:workspace.clientHeight/2 }) {
  if(game)return;
  const point=screenArea(anchor.x,anchor.y), dpr=window.devicePixelRatio||1;
  if(overview){overview=false;resize();}
  camera.zoom=Math.max(1,Math.min(6,zoom));
  camera.centerX=point.x-(anchor.x-workspace.clientWidth/2)*dpr/camera.zoom;
  camera.centerY=point.y-(anchor.y-workspace.clientHeight/2)*dpr/camera.zoom;update();
}
function catalogue() {
  const list=$('#catalog-items');list.replaceChildren();
  $('#furniture-tab').setAttribute('aria-pressed',String(catalogTab==='furniture'));
  $('#surface-tab').setAttribute('aria-pressed',String(catalogTab==='surface'));
  $('#people-tab').setAttribute('aria-pressed',String(catalogTab==='people'));
  $('#props-tab').setAttribute('aria-pressed',String(catalogTab==='props'));$('#buildings-tab').setAttribute('aria-pressed',String(catalogTab==='buildings'));
  $('#furniture-tab').hidden=activeArea===TOWN_AREA;$('#surface-tab').hidden=activeArea===TOWN_AREA;
  $('#props-tab').hidden=activeArea!==TOWN_AREA;$('#buildings-tab').hidden=activeArea!==TOWN_AREA;
  $('#category').hidden=catalogTab!=='furniture';
  const outdoorTab=catalogTab==='props'||catalogTab==='buildings';
  const entries=catalogTab==='furniture'?FURNITURE.filter(o=>$<HTMLSelectElement>('#category').value==='all'||o.category===$<HTMLSelectElement>('#category').value):catalogTab==='people'?EDITABLE_PEOPLE:
    outdoorTab?OUTDOOR.filter(entry=>entry.category===(catalogTab==='props'?'prop':'building')):(surfaceModule?.SURFACES??[]);
  for(const entry of entries) {
    const button=document.createElement('button');button.type='button';
    if(catalogTab==='people')button.dataset.personId=entry.id;else if(outdoorTab)button.dataset.outdoorId=entry.id;else button.dataset.catalogId=entry.id;
    button.append(catalogTab==='furniture'?furnitureThumbnail(entry.id):catalogTab==='people'?personThumbnail(entry.id,'down',48):outdoorTab?outdoorThumbnail(entry.id,48):surfaceModule!.surfaceThumbnail(entry.id));
    const name=document.createElement('span');name.textContent=entry.name;button.append(name);list.append(button);
    const choose=()=>{if(!editing())return;if(catalogTab==='surface'){cancelGesture();surface=entry.id;status('塗る場所をドラッグしてください');update();}
      else if(catalogTab==='people')startNpcPlacement(model.createNpc(entry.id,activeArea));else startPlacement(outdoorTab?outdoor.create(entry.id):model.create(entry.id,activeArea));};
    button.addEventListener('pointerdown',e=>{e.preventDefault();choose();if(!editing())return;if(npcPlacement)npcDrag={npc:npcPlacement,adding:true,offsetX:0,offsetY:0};
      else if(placement)drag={object:placement,adding:true,offsetX:Math.floor(placement.w/2),offsetY:Math.floor(placement.h/2)};});
    button.addEventListener('click',e=>{if(e.detail===0)choose();});
  }
  if(!entries.length){const p=document.createElement('p');p.textContent='このカタログは準備中です';list.append(p);}
}
for(const [category,name] of Object.entries(categories)){if(!FURNITURE.some(f=>f.category===category))continue;const o=document.createElement('option');o.value=category;o.textContent=name;$('#category').append(o);}
$('#category').addEventListener('change',catalogue);
// Browsing stays available during save; every placement still requires editing().
$('#furniture-tab').onclick=()=>{if(npcDraft)return;catalogTab='furniture';surface=undefined;cancelGesture();catalogue();};
$('#surface-tab').onclick=()=>{if(npcDraft)return;catalogTab='surface';cancelGesture();catalogue();};
$('#people-tab').onclick=()=>{if(npcDraft)return;catalogTab='people';surface=undefined;cancelGesture();catalogue();};
$('#props-tab').onclick=()=>{if(npcDraft)return;catalogTab='props';surface=undefined;cancelGesture();catalogue();};
$('#buildings-tab').onclick=()=>{if(npcDraft)return;catalogTab='buildings';surface=undefined;cancelGesture();catalogue();};
$('#stop-placement').onclick=()=>{surface=undefined;cancelGesture();status('');};
function brush(e: PointerEvent) {
  if(!paint||!surface)return;const p=areaPoint(e),x=Math.floor(p.x/16),y=Math.floor(p.y/16),area=paint.areas.find(a=>a.id===activeArea)!;
  if(x<0||y<0||x>=area.width||y>=area.height)return;
  const id=y*area.width+x;
  const previous=area.surfaces?structuredClone(area.surfaces):undefined;
  area.surfaces??={palette:[],cells:Array(area.width*area.height).fill(0)};
  if(!area.surfaces.palette.includes(surface))area.surfaces.palette.push(surface);
  area.surfaces.cells[id]=area.surfaces.palette.indexOf(surface)+1;
  const errors=model.issues(paint);
  if(errors.length){if(previous)area.surfaces=previous;else delete area.surfaces;status('床の柄は床に、壁紙は奥の壁に塗ってください');}
  else{world=viewWorld(paint);status('離すと塗った範囲を確定します');}
}
workspace.addEventListener('pointerdown',e=>{
  if((e.target as HTMLElement).closest('aside,button,details,#walk-dialog')||game||npcDraft)return;
  if((ghost&&!placement)||(npcGhost&&!npcPlacement)){ghost=undefined;npcGhost=undefined;world=viewWorld();}
  workspace.focus();pointers.set(e.pointerId,local(e));workspace.setPointerCapture(e.pointerId);
  if(pointers.size===2){cancelGesture();const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},anchor=screenArea(mid.x,mid.y);
    if(overview){overview=false;resize();camera.centerX=anchor.x-(mid.x-workspace.clientWidth/2)*(window.devicePixelRatio||1)/camera.zoom;camera.centerY=anchor.y-(mid.y-workspace.clientHeight/2)*(window.devicePixelRatio||1)/camera.zoom;}
    pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:camera.zoom,x:anchor.x,y:anchor.y};return;}
  if(editing()&&surface){paint=model.document;brush(e);return;}
  const point=areaPoint(e),hit=hitItem(world.areas.get(activeArea)!,point.x,point.y);
  if(editing()&&placement){placement={...placement,x:Math.floor(point.x/16),y:Math.floor(point.y/16)};drag={object:placement,adding:true,offsetX:0,offsetY:0};preview(placement,true);return;}
  if(editing()&&npcPlacement){npcPlacement={...npcPlacement,x:Math.floor(point.x/16),y:Math.floor(point.y/16)};npcDrag={npc:npcPlacement,adding:true,offsetX:0,offsetY:0};previewNpc(npcPlacement,true);return;}
  if(hit?.table==='objects'&&!space&&e.button!==1){selected=hit.id;selectedNpc=undefined;const o=objectAt(hit.id)!,reason=objectMoveReason(hit.id);
    if(editing()&&!reason)drag={object:o,adding:false,offsetX:Math.floor(point.x/16)-o.x,offsetY:Math.floor(point.y/16)-o.y};status(reason);update();return;}
  if(hit?.table==='interactions'&&!space&&e.button!==1){selected=undefined;selectedNpc=hit.id;const npc=npcAt(hit.id)!;
    if(editing())npcDrag={npc,adding:false,offsetX:Math.floor(point.x/16)-npc.x,offsetY:Math.floor(point.y/16)-npc.y};update();return;}
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
  if(pan){const scale=camera.zoom*canvasView.scale/(window.devicePixelRatio||1);camera.centerX=pan.cx-(e.clientX-pan.x)/scale;camera.centerY=pan.cy-(e.clientY-pan.y)/scale;return;}
  if(npcDrag&&inside(e)){const p=areaPoint(e);previewNpc({...npcDrag.npc,x:Math.floor(p.x/16)-npcDrag.offsetX,y:Math.floor(p.y/16)-npcDrag.offsetY},npcDrag.adding);return;}
  if(drag&&inside(e)){const p=areaPoint(e);preview({...drag.object,x:Math.floor(p.x/16)-drag.offsetX,y:Math.floor(p.y/16)-drag.offsetY},drag.adding);}
});
window.addEventListener('pointerup',e=>{
  pointers.delete(e.pointerId);
  if(pinch){if(pointers.size<2)pinch=undefined;return;}
  if(paint){const candidate=paint;paint=undefined;attempt(()=>model.commit(candidate));}
  else if(npcDrag&&npcGhost&&inside(e)){npcPlacement=undefined;if(npcGhost.valid){const candidate=npcGhost.document;attempt(()=>model.commit(candidate));}else{world=viewWorld();npcGhost=undefined;update();}}
  else if(drag&&ghost&&inside(e)){if(ghost.valid){const candidate=ghost.document;placement=undefined;attempt(()=>model.commit(candidate));}else{placement=undefined;world=viewWorld();ghost=undefined;update();}}
  drag=undefined;npcDrag=undefined;pan=undefined;
});
window.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch=undefined;cancelGesture();controls.clear();});
workspace.addEventListener('dblclick',e=>{if(activeArea!==TOWN_AREA||saveBusy||npcDraft||game)return;const p=areaPoint(e),hit=hitItem(world.areas.get(activeArea)!,p.x,p.y);if(hit?.table==='objects'){const object=objectAt(hit.id);if(object)enterRoom(object);}});
workspace.addEventListener('wheel',e=>{if(game)return;e.preventDefault();if(e.ctrlKey||e.metaKey)setZoom(camera.zoom+(e.deltaY<0?1:-1),local(e));else{camera.centerX+=e.deltaX*(window.devicePixelRatio||1)/(camera.zoom*canvasView.scale);camera.centerY+=e.deltaY*(window.devicePixelRatio||1)/(camera.zoom*canvasView.scale);}},{passive:false});
$('#outside').onclick=()=>{if(game)return;if(activeArea!==TOWN_AREA)backToTown();else{const home=world.areas.get(TOWN_AREA)!.objects.find(o=>o.facilityId==='home-family');if(home?.id)enterRoom({...home,id:home.id,areaId:TOWN_AREA});}};
$('#area-select').onchange=()=>{const next=$<HTMLSelectElement>('#area-select').value;if(saveBusy||npcDraft||game||next===activeArea){$<HTMLSelectElement>('#area-select').value=activeArea;return;}returnToTown=undefined;openArea(next);};
$('#enter-interior').onclick=()=>{const object=selected?objectAt(selected):undefined;if(object)enterRoom(object);};
$('#overview').onclick=()=>{if(game)return;const area=world.areas.get(activeArea)!;overview=true;camera.centerX=area.width*8;camera.centerY=area.height*8;camera.zoom=1;resize();update();};
$('#npc-list-toggle').onclick=()=>{if(game)return;npcListOpen=!npcListOpen;update();};
$('#zoom-in').onclick=()=>setZoom(camera.zoom+1);$('#zoom-out').onclick=()=>setZoom(camera.zoom-1);
$('#undo').onclick=()=>{cancelGesture();attempt(()=>model.session.undo());};$('#redo').onclick=()=>{cancelGesture();attempt(()=>model.session.redo());};
$('#rotate').onclick=()=>{
  if(selectedNpc){if(npcPlacement){const directions=['down','left','up','right'] as const;
      npcPlacement={...npcPlacement,facing:directions[(directions.indexOf(npcPlacement.facing??'down')+1)%4]};previewNpc(npcPlacement,true);}
    else attempt(()=>model.rotateNpc(selectedNpc!,activeArea));return;}
  if(activeArea===TOWN_AREA){if(selected)attempt(()=>outdoor.rotate(selected!));return;}
  const o=placement??(selected?model.object(selected,undefined,activeArea):undefined);if(!o)return;
  let next:{facing:'down'|'left'|'up'|'right';w:number;h:number};
  try{next=rotatedObjectVariant(o);}catch(error){status((error as Error).message);return;}
  const rotated={...o,...next};
  if(placement){placement=rotated;if(drag)drag.object=rotated;preview(rotated,true);}
  else {const candidate=model.candidate(rotated);if(model.issues(candidate).length)preview(rotated,false);else attempt(()=>model.commit(candidate));}
};
$('#duplicate').onclick=()=>{if(selected)try{startPlacement(activeArea===TOWN_AREA?outdoor.duplicate(selected):model.duplicate(selected,activeArea));}catch(error){status((error as Error).message);}};
$('#delete').onclick=()=>{if(selectedNpc)attempt(()=>{model.removeNpc(selectedNpc!,activeArea);selectedNpc=undefined;});else if(selected)attempt(()=>{if(activeArea===TOWN_AREA)outdoor.remove(selected!);else model.remove(selected!,activeArea);selected=undefined;});};
for(const person of EDITABLE_PEOPLE){
  const button=document.createElement('button');button.type='button';button.dataset.npcSprite=person.id;button.title=person.name;button.setAttribute('aria-label',person.name);
  button.append(personThumbnail(person.id,'down',48));
  button.onclick=()=>{if(saveBusy||game||npcPlacement||!selectedNpc||!editableArea(activeArea))return;$<HTMLInputElement>('#npc-sprite').value=person.id;npcDraft=true;update();};
  $('#npc-sprites').append(button);
}
for(const selector of ['#npc-name','#npc-facing','#npc-lines'])$(selector).addEventListener(selector==='#npc-facing'?'change':'input',()=>{
  if(saveBusy||game||!selectedNpc||!editableArea(activeArea))return;npcDraft=true;status('「変更を反映」で入力を確定します');update();
});
$('#npc-apply').onclick=()=>{
  if(saveBusy||game||!selectedNpc||!npcDraft||!editableArea(activeArea))return;
  attempt(()=>{model.updateNpc(selectedNpc!,{name:$<HTMLInputElement>('#npc-name').value,
    facing:$<HTMLSelectElement>('#npc-facing').value as EditorInteraction['facing'],
    sprite:$<HTMLInputElement>('#npc-sprite').value,
    lines:$<HTMLTextAreaElement>('#npc-lines').value.replace(/\r\n?/g,'\n').split('\n')},activeArea);npcDraft=false;});
};
$('#npc-revert').onclick=()=>{npcDraft=false;refresh();status('入力を取り消しました');};
$('#npc-properties').addEventListener('keydown',e=>{
  if(e.isComposing||e.keyCode===229)return;
  if(e.code==='Escape'&&npcDraft){e.preventDefault();e.stopPropagation();$('#npc-revert').click();}
});
function trialSpawn(){
  const area=world.areas.get(activeArea)!;
  if(activeArea===TOWN_AREA&&selected){const object=objectAt(selected);if(object?.facilityId){
    const back=[...world.areas.values()].flatMap(a=>a.def.portals).find(p=>p.facilityId===object.facilityId&&p.to.areaId===activeArea)?.to;
    if(back)return back;
  }}
  if(activeArea!==TOWN_AREA){const entry=[...world.areas.values()].flatMap(a=>a.def.portals).find(p=>p.to.areaId===activeArea)?.to;if(entry)return entry;}
  const x=Math.max(0,Math.min(area.width-1,Math.floor(camera.centerX/16))),y=Math.max(0,Math.min(area.height-1,Math.floor(camera.centerY/16)));
  const queue=[{x,y}],seen=new Set<number>();
  for(let n=0;n<queue.length;n++){const p=queue[n];if(p.x<0||p.y<0||p.x>=area.width||p.y>=area.height)continue;
    const index=p.y*area.width+p.x;if(seen.has(index))continue;seen.add(index);
    if(!isSolidTile(area,p.x,p.y)&&!area.portalAt.has(index))return{areaId:activeArea,...p,facing:'down' as const};
    queue.push({x:p.x,y:p.y+1},{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1});
  }
  throw new Error('試し歩きを始める場所が見つかりません');
}
$('#play').onclick=()=>{
  controls.clear();cancelGesture();
  if(game){game=undefined;refresh();}
  else{try{const entry=trialSpawn();game=new Game(world,{phoneClock:()=>0,phoneEpochClock:()=>0});
    game.player={areaId:entry.areaId,...feetAtTile(entry.x,entry.y),facing:entry.facing};status('矢印・WASDで歩く／Z・Space・Enterで話す／Escで編集へ');}
    catch(error){status((error as Error).message);game=undefined;}}
  update();resize();workspace.focus();
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
  if(saveBusy||npcDraft||(e.target as HTMLElement).closest('button,summary'))return;
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();(e.shiftKey?$('#redo'):$('#undo')).click();}
  else if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();$('#redo').click();}
  else if(!editing())return;
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
  if(saveBusy||npcDraft||game||!canSave||!model.dirty)return;
  saveBusy=true;
  try{cancelGesture();savePayload={changes:model.session.exportChanges()};
    const preview=await requestSave('preview',savePayload);$('#save-target').textContent=preview.target;$('#changes').replaceChildren();
    $('#save-files').replaceChildren();for(const target of preview.targets){const li=document.createElement('li');li.textContent=`${target.path}（${target.created?'新しく作る':'更新する'}）`;$('#save-files').append(li);}
    for(const change of preview.summary){const li=document.createElement('li');li.textContent=`${({add:'追加',delete:'削除',move:'移動',update:'変更'} as Record<string,string>)[change.type]} ${change.id}`;$('#changes').append(li);}
    $('#save-error').textContent='';saveDialog.showModal();
  }catch(error){saveBusy=false;savePayload=undefined;update();status((error as Error).message);}
};
saveDialog.addEventListener('cancel',e=>{if(writing)e.preventDefault();});
saveDialog.addEventListener('close',()=>{if(!writing){saveBusy=false;savePayload=undefined;update();}});
$('#save-cancel').onclick=()=>{if(!writing)saveDialog.close();};
$('#save-download').onclick=()=>{const url=URL.createObjectURL(new Blob([canonicalJSON(savePayload)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='world-layout-changes.json';link.click();URL.revokeObjectURL(url);};
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
  const o=ghost?.object??(selected?objectAt(selected):undefined);
  if(o){box(o.x,o.y,o.w,o.h,ghost?(ghost.valid?'#3bc87866':'#e15e5266'):'#ffffff18');const p=toScreen(o.x*16,o.y*16),q=toScreen((o.x+o.w)*16,(o.y+o.h)*16);c.strokeStyle=ghost?(ghost.valid?'#6bff9c':'#ff857b'):'#fff';c.lineWidth=2;c.setLineDash([5,3]);c.strokeRect(p.x,p.y,q.x-p.x,q.y-p.y);c.setLineDash([]);}
  const npc=npcGhost?.npc??(selectedNpc?npcAt(selectedNpc):undefined);
  if(npc){box(npc.x,npc.y,1,1,npcGhost?(npcGhost.valid?'#3bc87866':'#e15e5266'):'#ffffff18');const p=toScreen(npc.x*16,npc.y*16),q=toScreen((npc.x+1)*16,(npc.y+1)*16);c.strokeStyle=npcGhost?(npcGhost.valid?'#6bff9c':'#ff857b'):'#fff';c.lineWidth=2;c.setLineDash([5,3]);c.strokeRect(p.x,p.y,q.x-p.x,q.y-p.y);c.setLineDash([]);}
  if(activeArea===TOWN_AREA&&o?.facilityId){for(const portal of (ghost?.document??model.document).portals.filter(p=>p.facilityId===o.facilityId)){
    if(portal.areaId===TOWN_AREA)box(portal.from.x,portal.from.y,portal.from.w??1,1,'#3eb6ed99');
    if(portal.to.areaId===TOWN_AREA)box(portal.to.x,portal.to.y,1,1,'#48d67f99');
  }}
  if(activeArea===TOWN_AREA&&layers.has('landmarks')){
    const names:Record<string,string>={homeFront:'家の前',schoolDoorFront:'学校の前',konbiniDoorFront:'コンビニの前',schoolGate:'校門',stationFront:'駅前',parkPlaza:'公園',shoppingStreet:'商店街'};
    c.font='12px system-ui';for(const[name,point]of Object.entries(resolveLandmarks([...world.areas.values()].map(a=>a.def)))){
      const p=toScreen((point.x+.5)*16,(point.y+.5)*16);c.fillStyle='#ffd97a';c.beginPath();c.arc(p.x,p.y,4,0,Math.PI*2);c.fill();c.fillText(names[name]??name,p.x+7,p.y-5);
    }
  }
}
function resize(){
  const dpr=window.devicePixelRatio||1;
  if(overview&&!game){const area=world.areas.get(activeArea)!,width=(area.width*16+64)/dpr,height=(area.height*16+64)/dpr;
    renderer.resize(width,height,dpr);canvasView.scale=Math.min(workspace.clientWidth/width,workspace.clientHeight/height);
    canvasView.x=(workspace.clientWidth-width*canvasView.scale)/2;canvasView.y=(workspace.clientHeight-height*canvasView.scale)/2;
    scene.style.width=`${width*canvasView.scale}px`;scene.style.height=`${height*canvasView.scale}px`;
  }else{renderer.resize(workspace.clientWidth,workspace.clientHeight,dpr);canvasView.scale=1;canvasView.x=0;canvasView.y=0;}
  scene.style.left=`${canvasView.x}px`;scene.style.top=`${canvasView.y}px`;scene.style.right='auto';scene.style.bottom='auto';
  overlay.width=Math.round(workspace.clientWidth*dpr);overlay.height=Math.round(workspace.clientHeight*dpr);overlay.style.width=`${workspace.clientWidth}px`;overlay.style.height=`${workspace.clientHeight}px`;
}
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
Object.defineProperty(window,'__worldEditor',{value:{model,renderer,camera,toScreen,get game(){return game;},get activeArea(){return activeArea;},get ghost(){return ghost;},get npcGhost(){return npcGhost;},get validationTimes(){return [...validationTimes];},get overview(){return overview;}}});
for (const area of [...model.document.areas].sort((a, b) => Number(a.kind !== 'indoor') - Number(b.kind !== 'indoor'))) {
  const option = document.createElement('option');
  option.value = area.id;
  option.textContent = `${area.kind === 'indoor' ? '屋内' : '屋外'}: ${area.name}${editableArea(area.id) ? '' : '（表示のみ）'}`;
  $<HTMLSelectElement>('#area-select').append(option);
}
catalogue();update();requestAnimationFrame(frame);
