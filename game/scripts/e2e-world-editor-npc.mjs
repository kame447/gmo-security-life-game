/** Headless NPC regression. Writes and server restarts use only a disposable game copy. */
import assert from 'node:assert/strict';
import { gameplayUrl } from './lib/gameplay-url.mjs';
import {spawn} from 'node:child_process';
import {cp,mkdir,mkdtemp,readdir,readFile,realpath,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'slg-npc-editor-e2e-'))),root=path.join(temp,'game');
const output=process.env.SLG_SHOTS||path.join(temp,'shots');assert.ok(path.isAbsolute(output));await mkdir(output,{recursive:true});
const port=Number(process.env.SLG_NPC_EDITOR_PORT||5381);assert.ok(Number.isSafeInteger(port)&&port>1023&&port<65536);
const origin=`http://127.0.0.1:${port}`,areaId='home-family-interior',motherId='home-mother',layoutFile=`data/world/areas/${areaId}.json`;
const sourceFiles=new Map();for(const name of await readdir(path.join(source,'data/world/areas')))
 if(name.endsWith('.json'))sourceFiles.set(name,await readFile(path.join(source,'data/world/areas',name),'utf8'));
await cp(source,root,{recursive:true,filter:file=>!['node_modules','dist'].some(name=>{const p=path.relative(source,file);return p===name||p.startsWith(`${name}/`);})});
await symlink(path.join(source,'node_modules'),path.join(root,'node_modules'),'dir');
let server,serverOutput='',browser,passed=0;
const pass=name=>{passed++;console.log('PASS',name);};
async function start(){
 serverOutput='';server=spawn(process.execPath,[path.join(source,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,NO_COLOR:'1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>serverOutput+=b);server.stderr.on('data',b=>serverOutput+=b);
 const deadline=Date.now()+20000;while(Date.now()<deadline){if(server.exitCode!==null)throw new Error(serverOutput);
  try{if(serverOutput.includes('Local:')&&(await fetch(`${origin}/world-editor.html`)).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server timeout: ${serverOutput}`);
}
async function stop(){if(!server||server.exitCode!==null)return;const current=server,done=new Promise(resolve=>current.once('exit',resolve));current.kill('SIGTERM');await done;}
const documentOf=page=>page.evaluate(()=>window.__worldEditor.model.document);
const npcOf=(page,id,area)=>page.evaluate(({id,area})=>{const app=window.__worldEditor;return app.model.npc(id,undefined,area??app.activeArea);},{id,area});
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function ready(page){await page.goto(`${origin}/world-editor.html`);await page.waitForFunction(()=>window.__worldEditor?.renderer.stats.chunksDrawn>0);await frames(page);}
async function session(viewport,touch=false){
 const context=await browser.newContext({viewport,hasTouch:touch,acceptDownloads:false,serviceWorkers:'block'}),errors=[],blocked=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.protocol==='data:')return route.continue();blocked.push(u.href);return route.abort();});
 await context.routeWebSocket('**',socket=>{if(new URL(socket.url()).origin===origin.replace('http','ws'))socket.connectToServer();else{blocked.push(socket.url());void socket.close();}});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('download',download=>{errors.push('Unexpected download');void download.cancel();});
 context.on('page',popup=>{if(popup!==page)errors.push('Unexpected popup');});page.on('dialog',dialog=>{errors.push('Unexpected dialog');void dialog.dismiss();});
 const cdp=touch?await context.newCDPSession(page):undefined;
 const fingers=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((point,i)=>({x:point.x,y:point.y,id:i+1,radiusX:2,radiusY:2}))});
 const click=selector=>touch?page.locator(selector).tap():page.locator(selector).click();
 return{context,page,errors,blocked,cdp,fingers,click,touch};
}
async function close(s){await s.cdp?.detach();await s.context.close();assert.deepEqual(s.errors,[]);assert.deepEqual(s.blocked,[]);}
async function point(page,id){
 return page.evaluate(async id=>{
  const app=window.__worldEditor,npc=app.model.npc(id,undefined,app.activeArea);if(!npc)throw new Error(`Missing NPC ${id}`);
  const{characterSprite}=await import('/src/render/sprites.ts'),{feetAtTile}=await import('/src/core/coords.ts'),{hitItem}=await import('/src/world-editor/hit-test.ts');
  const sprite=characterSprite(npc.sprite,npc.facing,0),pixels=sprite.canvas.getContext('2d').getImageData(0,0,sprite.canvas.width,sprite.canvas.height).data;
  const feet=feetAtTile(npc.x,npc.y),rect=document.querySelector('#workspace').getBoundingClientRect(),area=app.model.runtime().areas.get(npc.areaId);let best;
  for(let y=0;y<sprite.canvas.height;y++)for(let x=0;x<sprite.canvas.width;x++)if(pixels[(y*sprite.canvas.width+x)*4+3]){
   const wx=feet.x+sprite.ox+x+.5,wy=feet.y+sprite.oy+y+.5,p=app.toScreen(wx,wy),sx=p.x+rect.x,sy=p.y+rect.y;
   if(p.x<0||p.y<0||p.x>=rect.width||p.y>=rect.height||hitItem(area,wx,wy)?.id!==id||document.elementFromPoint(sx,sy)?.closest('aside'))continue;
   const score=Math.abs(x-sprite.canvas.width/2)+Math.abs(y-(sprite.canvas.height-7));if(!best||score<best.score)best={x:sx,y:sy,score};
  }
  if(!best)throw new Error(`NPC artwork is not exposed for interaction: ${id}`);return{...best,npc};
 },id);
}
async function select(s,id){
 const p=await point(s.page,id);if(s.touch)await s.page.touchscreen.tap(p.x,p.y);else await s.page.mouse.click(p.x,p.y);
 await s.page.locator('#npc-properties').waitFor({state:'visible'});
 assert.equal(await s.page.locator('#object-id').textContent(),`ID ${id}（変更できません）`);
 assert.equal(await s.page.locator('#npc-name').inputValue(),p.npc.name);
}
async function move(s,id,x,y){
 const p=await point(s.page,id),delta=await s.page.evaluate(({dx,dy})=>{const a=window.__worldEditor.toScreen(0,0),b=window.__worldEditor.toScreen(dx*16,dy*16);return{x:b.x-a.x,y:b.y-a.y};},{dx:x-p.npc.x,dy:y-p.npc.y});
 if(s.touch){await s.fingers('touchStart',[p]);for(let n=1;n<=8;n++){await s.fingers('touchMove',[{x:p.x+delta.x*n/8,y:p.y+delta.y*n/8}]);await s.page.waitForTimeout(20);}await s.fingers('touchEnd',[]);}
 else{await s.page.mouse.move(p.x,p.y);await s.page.mouse.down();await s.page.mouse.move(p.x+delta.x,p.y+delta.y,{steps:8});await s.page.mouse.up();}
 await s.page.waitForFunction(({id,x,y})=>{const app=window.__worldEditor,npc=app.model.npc(id,undefined,app.activeArea);return npc?.x===x&&npc?.y===y;},{id,x,y});
}
async function place(s,sprite,x,y){
 await s.click(`[data-person-id="${sprite}"]`);const npc=await s.page.evaluate(()=>window.__worldEditor.npcGhost.npc);
 const p=await s.page.evaluate(({x,y})=>{const p=window.__worldEditor.toScreen(x*16+8,y*16+8),r=document.querySelector('#workspace').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});
 if(s.touch)await s.page.touchscreen.tap(p.x,p.y);else await s.page.mouse.click(p.x,p.y);return npc;
}
async function edit(s,{name,lines,sprite}){
 await s.page.locator('#npc-name').fill(name);await s.page.locator('#npc-lines').fill(lines.join('\n'));
 if(sprite)await s.click(`[data-npc-sprite="${sprite}"]`);await s.click('#npc-apply');
 assert.equal(await s.page.locator('#npc-apply').isDisabled(),true);
}
async function press(s,key,delay){
 if(!s.touch){await s.page.keyboard.press(key,{delay});return;}
 const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[key],r=await s.page.locator(`[data-direction="${direction}"]`).boundingBox();
 await s.fingers('touchStart',[{x:r.x+r.width/2,y:r.y+r.height/2}]);await s.page.waitForTimeout(delay);await s.fingers('touchEnd',[]);
}
async function walk(s,target,gameName='editor'){
 const route=await s.page.evaluate(async({target,gameName})=>{
  const game=gameName==='editor'?window.__worldEditor.game:window.__slg.game,{findPath}=await import('/src/world/index.ts');
  return findPath(game.area,{x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)},target);
 },{target,gameName});assert.ok(route,`No walking route to ${JSON.stringify(target)}`);
 for(const tile of route)for(const axis of ['x','y']){const value=tile[axis]*16+(axis==='x'?8:14);let reached=false;
  for(let n=0;n<45;n++){
   const player=await s.page.evaluate(gameName=>({...((gameName==='editor'?window.__worldEditor.game:window.__slg.game).player)}),gameName);
   if(player.areaId!==target.areaId&&target.areaId)return;
   const delta=value-player[axis];if(Math.abs(delta)<=2){reached=true;break;}
   const key=axis==='x'?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp');
   await press(s,key,Math.min(70,Math.max(20,(Math.abs(delta)-1)/72*1000)));
  }assert.ok(reached,`Walking stopped before ${JSON.stringify({tile,axis,target})}`);
 }
}
async function talk(s,id){
 const target=await s.page.evaluate(async id=>{
  const game=window.__worldEditor.game,npc=game.area.interactions.find(npc=>npc.id===id),{findPath}=await import('/src/world/index.ts');
  const from={x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)};
  for(const[dx,dy,key]of[[0,1,'ArrowUp'],[-1,0,'ArrowRight'],[0,-1,'ArrowDown'],[1,0,'ArrowLeft']]){
   const tile={x:npc.x+dx,y:npc.y+dy};if(findPath(game.area,from,tile))return{...tile,key,areaId:game.player.areaId};}return null;
 },id);assert.ok(target);await walk(s,target);await press(s,target.key,35);
 assert.equal(await s.page.evaluate(()=>window.__worldEditor.game.facingInteraction()?.id),id);
 if(s.touch)await s.click('#walk-action');else await s.page.keyboard.press('KeyZ');await s.page.locator('#walk-dialog').waitFor({state:'visible'});
}
async function save(s){
 const target=path.join(root,layoutFile),before=await readFile(target,'utf8');assert.equal(await s.page.locator('#save').isDisabled(),false);
 await s.click('#save');await s.page.locator('#save-confirm').waitFor({state:'visible'});assert.match(await s.page.locator('#save-target').innerText(),/home-family-interior.json/);
 await s.click('#save-commit');await s.page.locator('#save-confirm').waitFor({state:'hidden'});await s.page.waitForFunction(()=>window.__worldEditor?.model.dirty===0);
 const saved=await readFile(target,'utf8');assert.notEqual(saved,before);return JSON.parse(saved);
}
async function restart(s,expected){await close(s);await stop();await start();const next=await session({width:1280,height:800});await ready(next.page);assert.deepEqual(await documentOf(next.page),expected);return next;}

try{
 await start();browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-gpu-vsync','--disable-frame-rate-limit']});
 let s=await session({width:1280,height:800});await ready(s.page);const initial=await documentOf(s.page),sourceMother=await npcOf(s.page,motherId);
 const listOrder=async(page,area=areaId)=>page.evaluate(area=>Array.from(document.querySelectorAll('[data-npc-list-id]')).map(b=>b.dataset.npcListId),area);
 const docNpcOrder=async(page,area)=>page.evaluate(area=>window.__worldEditor.model.document.interactions.filter(i=>i.areaId===area&&i.kind==='npc').map(i=>i.id),area);
 const rowBadges=async(page,id)=>page.evaluate(id=>Array.from(document.querySelectorAll(`[data-npc-list-id="${id}"] .npc-badge`)).map(el=>el.textContent),id);
 assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,areaId));
 assert.deepEqual(await rowBadges(s.page,motherId),['もとからいる人','イベントあり']);
 await s.page.locator('#area-select').selectOption('town-main');await frames(s.page);
 assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,'town-main'));
 assert.equal((await listOrder(s.page)).length,6);
 assert.ok(!(await rowBadges(s.page,'candy-shopkeeper')).includes('店員'));
 await s.page.evaluate(()=>{window.__worldEditor.camera.centerX=32;window.__worldEditor.camera.centerY=32;});await frames(s.page);
 const offscreenBefore=await s.page.evaluate(()=>{const npc=window.__worldEditor.model.npc('station-staff',undefined,'town-main');const p=window.__worldEditor.toScreen(npc.x*16+8,npc.y*16+8),r=document.querySelector('#workspace').getBoundingClientRect();return{x:p.x,y:p.y,w:r.width,h:r.height};});
 assert.ok(offscreenBefore.x<0||offscreenBefore.x>offscreenBefore.w||offscreenBefore.y<0||offscreenBefore.y>offscreenBefore.h);
 await s.click('[data-npc-list-id="station-staff"]');
 assert.equal(await s.page.locator('#npc-name').inputValue(),'駅員さん');
 assert.match(await s.page.locator('#object-id').textContent(),/station-staff/);
 assert.equal(await s.page.locator('[data-npc-list-id="station-staff"]').getAttribute('aria-pressed'),'true');
 const focusedAfter=await s.page.evaluate(()=>{const npc=window.__worldEditor.model.npc('station-staff',undefined,'town-main');const p=window.__worldEditor.toScreen(npc.x*16+8,npc.y*16+8),r=document.querySelector('#workspace').getBoundingClientRect();return{x:p.x,y:p.y,w:r.width,h:r.height};});
 assert.ok(focusedAfter.x>=0&&focusedAfter.x<=focusedAfter.w&&focusedAfter.y>=0&&focusedAfter.y<=focusedAfter.h);
 await s.page.locator('#area-select').selectOption('shop-konbini-interior');await frames(s.page);
 assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,'shop-konbini-interior'));
 assert.deepEqual(await rowBadges(s.page,'konbini-clerk'),['もとからいる人','店員']);
 await s.page.locator('#area-select').selectOption(areaId);await frames(s.page);
 assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,areaId));
 pass('NPC list follows area switches, shows badges, and selects/pans camera to off-screen NPC');
 assert.equal(await s.page.locator('[data-catalog-id]').count(),16);await select(s,motherId);
 assert.equal(await s.page.locator('#npc-events li').count(),2);assert.match(await s.page.locator('#npc-event-note').innerText(),/ふだんの会話/);
 assert.equal(await s.page.locator('#npc-lines').isEditable(),true);assert.equal(await s.page.locator('#npc-event-key').getAttribute('readonly'),'');
 assert.equal(await s.page.locator('#delete').isDisabled(),true);pass('mother artwork selects the protected NPC and explains two conditional events');
 await move(s,motherId,sourceMother.x,sourceMother.y+2);await s.click('#rotate');
 assert.deepEqual([...(await npcOf(s.page,motherId)).lines],sourceMother.lines);assert.equal((await npcOf(s.page,motherId)).facing,'up');pass('mother moves two tiles and rotates using the actual artwork');
 const draftName='編集したおかあさん',draftLines=['保存後も出るふだんの会話です。'];
 await s.page.locator('#npc-name').fill(draftName);await s.page.locator('#npc-lines').fill(draftLines.join('\n'));
 const draftDocument=await documentOf(s.page),draftLabel=await s.page.locator('#dirty').innerText();
 for(const selector of ['#npc-name','#npc-lines','#npc-apply'])for(const kind of ['isComposing','keyCode']){
  const result=await s.page.evaluate(({selector,kind})=>{
   const field=document.querySelector(selector),name=document.querySelector('#npc-name'),lines=document.querySelector('#npc-lines');
   const event=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true,isComposing:kind==='isComposing'});
   if(kind==='keyCode')Object.defineProperty(event,'keyCode',{value:229});
   field.dispatchEvent(event);return{name:name.value,lines:lines.value,sameNode:name===document.querySelector('#npc-name')&&lines===document.querySelector('#npc-lines'),prevented:event.defaultPrevented};
  },{selector,kind});
  assert.deepEqual(result,{name:draftName,lines:draftLines.join('\n'),sameNode:true,prevented:false});
  assert.deepEqual(await documentOf(s.page),draftDocument);assert.equal(await s.page.locator('#dirty').innerText(),draftLabel);
 }pass('DOM composition Escape keeps both form values and draft state in six form/window cases');
 await s.page.locator('#npc-lines').press('Escape');assert.equal(await s.page.locator('#npc-name').inputValue(),sourceMother.name);
 assert.equal(await s.page.locator('#npc-lines').inputValue(),sourceMother.lines.join('\n'));assert.equal(await s.page.locator('#npc-apply').isDisabled(),true);pass('ordinary Escape explicitly cancels the form draft');
 await edit(s,{name:draftName,lines:draftLines,sprite:'teacher'});const editedMother=await npcOf(s.page,motherId);
 assert.deepEqual(editedMother,{...sourceMother,y:sourceMother.y+2,facing:'up',sprite:'teacher',name:draftName,lines:draftLines});
 await s.click('#undo');assert.equal((await npcOf(s.page,motherId)).name,sourceMother.name);await s.click('#redo');assert.deepEqual(await npcOf(s.page,motherId),editedMother);pass('name conversation and appearance apply as one undoable edit without changing the event key');
 const spriteIds=await s.page.evaluate(async()=>{
  const {EDITABLE_PEOPLE}=await import('/src/world-editor/npc.ts');
  return EDITABLE_PEOPLE.map(person=>person.id).sort();
 });
 assert.ok(spriteIds.includes('grandma-reading-seated')&&spriteIds.includes('friend-seated'));
 const spriteChoices=await s.page.locator('[data-npc-sprite]').evaluateAll(entries=>entries.map(entry=>entry.dataset.npcSprite).sort());
 assert.deepEqual(spriteChoices,spriteIds);assert.equal(await s.page.locator('[data-npc-sprite="player"]').count(),0);
 const beforeDelete=await documentOf(s.page);await s.page.locator('#workspace').focus();await s.page.keyboard.press('Delete');assert.deepEqual(await documentOf(s.page),beforeDelete);pass('player appearance and protected mother deletion are unavailable');
 const expectedMother=await documentOf(s.page),savedMother=await save(s);assert.deepEqual(savedMother.interactions.find(i=>i.id===motherId),(({areaId:_,...npc})=>npc)(editedMother));
 s=await restart(s,expectedMother);pass('saved mother survives server restart with the complete document unchanged');
 await s.page.goto(gameplayUrl(`${origin}/`));await s.page.waitForFunction(()=>!!window.__slg?.game);
 const entry=await s.page.evaluate(()=>window.__slg.game.area.def.portals.find(p=>p.id==='home-enter'));await walk(s,{...entry.from,areaId:'town-main'},'game');
 assert.equal(await s.page.evaluate(()=>window.__slg.game.player.areaId),areaId);
 assert.deepEqual(await s.page.evaluate(id=>window.__slg.game.area.interactions.find(i=>i.id===id),motherId),(({areaId:_,...npc})=>npc)(editedMother));pass('normal game enters the saved home and loads the edited mother');
 await ready(s.page);const storage=await s.page.evaluate(()=>({...localStorage}));await s.click('#play');await s.page.locator('#workspace').focus();await talk(s,motherId);
 assert.equal(await s.page.locator('#walk-dialog strong').innerText(),draftName);assert.equal(await s.page.locator('#walk-dialog p').innerText(),draftLines[0]);await s.page.screenshot({path:path.join(output,'desktop-mother-talk.png')});
 await s.click('#play');assert.deepEqual(await s.page.evaluate(()=>({...localStorage})),storage);pass('trial walk speaks the edited ordinary line without changing the player save');
 await s.click('#people-tab');
 const thumbnails=await s.page.locator('[data-person-id]').evaluateAll(entries=>entries.map(entry=>entry.dataset.personId).sort());
 assert.deepEqual(thumbnails,spriteIds);assert.equal(await s.page.locator('[data-person-id="player"]').count(),0);
 await s.click('[data-person-id="friend"]');const cancelled=await s.page.evaluate(()=>window.__worldEditor.npcGhost.npc.id);await s.click('#stop-placement');assert.deepEqual(await documentOf(s.page),expectedMother);pass('game-art people thumbnails and cancelled placement leave the document unchanged');
 const placed=await place(s,'friend',4,7);assert.notEqual(placed.id,cancelled);assert.match(placed.id,/^home-family-interior-npc-[1-9][0-9]*$/);
 assert.equal((await npcOf(s.page,placed.id)).eventKey,`npc.${placed.id}`);await edit(s,{name:'新しく置いた人',lines:['追加した人の会話です。'],sprite:'grandma'});
 assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,areaId));assert.deepEqual(await rowBadges(s.page,placed.id),['置いた人']);
 pass('new person receives a unique ID own event key and editable appearance/name/dialogue');
 await s.click('#delete');assert.equal(await npcOf(s.page,placed.id),undefined);assert.deepEqual(await listOrder(s.page),[motherId]);
 await s.click('#undo');assert.equal((await npcOf(s.page,placed.id)).eventKey,`npc.${placed.id}`);assert.deepEqual(await listOrder(s.page),await docNpcOrder(s.page,areaId));
 await s.click('#redo');assert.equal(await npcOf(s.page,placed.id),undefined);assert.deepEqual(await listOrder(s.page),[motherId]);pass('new person deletion undo and redo preserve the same ID and key');
 const retained=await place(s,'cat',4,7);assert.notEqual(retained.id,placed.id);assert.notEqual(retained.id,cancelled);await edit(s,{name:'保存して開き直す人',lines:['追加して保存した会話です。']});
 const beforeInvalid=await documentOf(s.page),invalid=await place(s,'friend',7,10);assert.equal(await npcOf(s.page,invalid.id),undefined);assert.deepEqual(await documentOf(s.page),beforeInvalid);pass('deleted IDs are not reused and an arrival-blocking placement is refused');
 await select(s,retained.id);await s.page.screenshot({path:path.join(output,'desktop-new-person.png')});const expectedAdded=await documentOf(s.page);await save(s);s=await restart(s,expectedAdded);
 await select(s,motherId);await s.page.locator('#npc-name').fill('下書き保護名');await s.click(`[data-npc-list-id="${retained.id}"]`);
 assert.equal(await s.page.locator('#npc-name').inputValue(),'下書き保護名');assert.match(await s.page.locator('#object-id').textContent(),new RegExp(motherId));
 assert.equal(await s.page.locator(`[data-npc-list-id="${motherId}"]`).getAttribute('aria-pressed'),'true');
 await s.click('#npc-revert');await s.click(`[data-npc-list-id="${retained.id}"]`);assert.equal(await s.page.locator('#npc-name').inputValue(),'保存して開き直す人');
 pass('draft guard keeps edited form values when clicking another NPC row');
 await select(s,retained.id);assert.equal(await s.page.locator('#delete').isDisabled(),false);assert.equal(await s.page.locator('#npc-name').inputValue(),'保存して開き直す人');pass('placed person survives save/reopen and remains deletable');
 await s.click('#delete');const expectedDeleted=await documentOf(s.page);assert.ok(!expectedDeleted.catalogs.eventKeys.includes(`npc.${retained.id}`));await save(s);s=await restart(s,expectedDeleted);
 assert.equal(await npcOf(s.page,retained.id),undefined);assert.deepEqual(await npcOf(s.page,motherId),editedMother);pass('deleting a reopened person saves again without leaving a stale event key');
 const finalDocument=await documentOf(s.page),finalBytes=await readFile(path.join(root,layoutFile),'utf8');await close(s);
 for(const[name,viewport]of[['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
  const mobile=await session(viewport,true);await ready(mobile.page);assert.deepEqual(await documentOf(mobile.page),finalDocument);
  if(name==='portrait'){
   await mobile.click('#entity-list-toggle');
   const overflow=await mobile.page.evaluate(()=>{const props=document.querySelector('#properties'),list=document.querySelector('#entity-list'),items=Array.from(list.querySelectorAll('.npc-row')).map(b=>b.getBoundingClientRect());const pr=props.getBoundingClientRect(),lr=list.getBoundingClientRect();return{propsScrollW:props.scrollWidth,propsClientW:props.clientWidth,propsLeft:pr.left,propsRight:pr.right,listScrollW:list.scrollWidth,listClientW:list.clientWidth,listRight:lr.right,itemCount:items.length,maxItemRight:Math.max(...items.map(r=>r.right))};});
   assert.equal(overflow.itemCount,(await docNpcOrder(mobile.page,areaId)).length);
   assert.ok(overflow.propsScrollW<=overflow.propsClientW,`portrait #properties horizontal overflow: ${JSON.stringify(overflow)}`);
   assert.ok(overflow.listScrollW<=overflow.listClientW,`portrait #entity-list horizontal overflow: ${JSON.stringify(overflow)}`);
   assert.ok(overflow.propsLeft>=0&&overflow.propsRight<=390&&overflow.maxItemRight<=390,`portrait list outside 390px: ${JSON.stringify(overflow)}`);
   await mobile.click('#entity-list-toggle');
   pass('portrait: NPC list fits within 390px without horizontal overflow');
  }
  await mobile.click('#zoom-out');await mobile.click('#zoom-out');
  if(name==='portrait'){
   const box=await mobile.page.locator('#workspace').boundingBox(),a={x:box.x+260,y:box.y+30},b={x:box.x+340,y:box.y+30};
   await mobile.fingers('touchStart',[a,b]);await mobile.fingers('touchMove',[{x:a.x-145,y:a.y},{x:b.x-145,y:b.y}]);await mobile.fingers('touchEnd',[]);await frames(mobile.page);
  }
  await move(mobile,motherId,editedMother.x,editedMother.y+2);await mobile.click('#rotate');await edit(mobile,{name:`${name}の表示名`,lines:[`${name}で編集した会話です。`],sprite:'mother'});
  const changed=await npcOf(mobile.page,motherId);assert.equal(changed.y,editedMother.y+2);assert.equal(changed.eventKey,'home.mother');assert.equal(changed.facing,'right');pass(`${name}: touch NPC selection two-tile drag rotation and form apply`);
  assert.equal(await mobile.page.locator('#save').isDisabled(),true);await mobile.page.screenshot({path:path.join(output,`${name}-npc-editor.png`)});
  await mobile.click('#play');await talk(mobile,motherId);assert.equal(await mobile.page.locator('#walk-dialog p').innerText(),`${name}で編集した会話です。`);
  await mobile.page.screenshot({path:path.join(output,`${name}-npc-talk.png`)});await mobile.click('#play');pass(`${name}: touch walking and action speak the edited NPC line`);
  assert.equal(await readFile(path.join(root,layoutFile),'utf8'),finalBytes);await ready(mobile.page);assert.deepEqual(await documentOf(mobile.page),finalDocument);assert.equal(await mobile.page.locator('#save').isDisabled(),true);
  await close(mobile);pass(`${name}: PC-only saving and reload leave disk and saved document unchanged`);
 }
 for(const[name,bytes]of sourceFiles)assert.equal(await readFile(path.join(source,'data/world/areas',name),'utf8'),bytes);
 pass('source area JSON and existing previews remain untouched; all contexts have zero errors/external attempts/downloads');
 console.log(`SUMMARY ${passed}/${passed} PASS`,JSON.stringify({output}));
}catch(error){console.error('FAIL',error);console.error(serverOutput);process.exitCode=1;}
finally{await browser?.close();await stop();if(!process.exitCode)await rm(temp,{recursive:true,force:true});else console.error('Failure copy preserved:',root);}
