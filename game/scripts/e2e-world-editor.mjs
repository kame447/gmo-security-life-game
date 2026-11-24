/** Parent/CI runs this headless. All saves and restarts use an isolated game copy. */
import assert from 'node:assert/strict';
import { gameplayUrl } from './lib/gameplay-url.mjs';
import { spawn } from 'node:child_process';
import { cp,mkdir,mkdtemp,readFile,realpath,symlink,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'slg-world-editor-e2e-'))),root=path.join(temp,'game');
const output=process.env.SLG_SHOTS||path.join(temp,'shots');assert.ok(path.isAbsolute(output));await mkdir(output,{recursive:true});
const port=Number(process.env.SLG_WORLD_EDITOR_PORT||5380);assert.ok(Number.isSafeInteger(port)&&port>1023&&port<65536);
const origin=`http://127.0.0.1:${port}`,layoutFile='data/world/areas/home-family-interior.json';
const original=await readFile(path.join(source,layoutFile),'utf8');
await cp(source,root,{recursive:true,filter:file=>!['node_modules','dist'].some(name=>{const p=path.relative(source,file);return p===name||p.startsWith(`${name}/`);})});
await symlink(path.join(source,'node_modules'),path.join(root,'node_modules'),'dir');
let server,serverOutput='',browser,passed=0;
const pass=name=>{passed++;console.log('PASS',name);};
async function start(){serverOutput='';server=spawn(process.execPath,[path.join(source,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,NO_COLOR:'1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>serverOutput+=b);server.stderr.on('data',b=>serverOutput+=b);
 const deadline=Date.now()+20000;while(Date.now()<deadline){if(server.exitCode!==null)throw new Error(serverOutput);try{if(serverOutput.includes('Local:')&&(await fetch(`${origin}/world-editor.html`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Server timeout: ${serverOutput}`);}
async function stop(){if(!server||server.exitCode!==null)return;const p=server,done=new Promise(r=>p.once('exit',r));p.kill('SIGTERM');await done;}
const documentOf=page=>page.evaluate(()=>window.__worldEditor.model.document);
const saveTimeLeft=deadline=>{const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Save timeout');return remaining;};
async function savedEditorSnapshot(page,deadline){
 while(Date.now()<deadline){
  try{
   await page.waitForFunction(()=>window.__worldEditor?.model?.dirty===0,undefined,{timeout:saveTimeLeft(deadline)});
   saveTimeLeft(deadline);
   const snapshot=await page.evaluate(()=>{const model=window.__worldEditor?.model;return model?{dirty:model.dirty,document:model.document}:null;});
   saveTimeLeft(deadline);
   if(snapshot)return snapshot;
  }catch(error){if(!String(error.message).includes('Execution context was destroyed'))throw error;}
 }
 throw new Error('Save timeout');
}
const ready=async page=>{await page.goto(`${origin}/world-editor.html`);await page.waitForFunction(()=>window.__worldEditor?.renderer.stats.chunksDrawn>0);await page.locator('#workspace').focus();};
async function session(viewport,touch=false){const context=await browser.newContext({viewport,hasTouch:touch,acceptDownloads:false,serviceWorkers:'block'});const errors=[],blocked=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.protocol==='data:')return route.continue();blocked.push(u.href);return route.abort();});
 await context.routeWebSocket('**',socket=>{if(new URL(socket.url()).origin===origin.replace('http','ws'))socket.connectToServer();else{blocked.push(socket.url());void socket.close();}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('download',d=>{errors.push('Unexpected download');void d.cancel();});
 return {context,page,errors,blocked};}
async function point(page,id){return page.evaluate(async id=>{
 const app=window.__worldEditor,o=app.model.object(id,undefined,app.activeArea);if(!o)throw new Error(`Missing ${id}`);
 const{objectSprite}=await import('/src/render/sprites.ts'),s=objectSprite(o),data=s.canvas.getContext('2d').getImageData(0,0,s.canvas.width,s.canvas.height).data;
 let best;for(let y=0;y<s.canvas.height;y++)for(let x=0;x<s.canvas.width;x++)if(data[(y*s.canvas.width+x)*4+3]){
  const score=Math.abs(x-s.canvas.width/2)+Math.abs(y-(s.canvas.height-7));if(!best||score<best.score)best={x,y,score};}
 const p=app.toScreen(o.x*16+s.ox+best.x+.5,o.y*16+s.oy+best.y+.5),rect=document.querySelector('#workspace').getBoundingClientRect();
 return {...p,x:p.x+rect.x,y:p.y+rect.y,object:o};
 },id);}
async function move(page,id,x,y){const p=await point(page,id),q=await page.evaluate(({dx,dy})=>{const a=window.__worldEditor.toScreen(0,0),b=window.__worldEditor.toScreen(dx*16,dy*16);return{x:b.x-a.x,y:b.y-a.y};},{dx:x-p.object.x,dy:y-p.object.y});
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+q.x,p.y+q.y,{steps:8});await page.mouse.up();
 await page.waitForFunction(({id,x,y})=>{const app=window.__worldEditor,o=app.model.object(id,undefined,app.activeArea);return o?.x===x&&o?.y===y;},{id,x,y});}
async function tilePoint(page,x,y){return page.evaluate(({x,y})=>{const p=window.__worldEditor.toScreen(x*16+8,y*16+8),r=document.querySelector('#workspace').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});}
async function select(page,id){const p=await point(page,id);await page.mouse.click(p.x,p.y);await page.locator('#properties').waitFor({state:'visible'});}
async function holdRequest(context,pattern){let release,started;const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>started=resolve);
 const handler=async route=>{started();await gate;await route.continue();};await context.route(pattern,handler);
 return{started:seen,release,remove:()=>context.unroute(pattern,handler)};}
async function walk(page,target,gameName='editor'){
 const route=await page.evaluate(async({target,gameName})=>{const game=gameName==='editor'?window.__worldEditor.game:window.__slg.game;const{findPath}=await import('/src/world/index.ts');return findPath(game.area,{x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)},target);},{target,gameName});assert.ok(route,'No walking route');
 for(const tile of route)for(const axis of ['x','y']){const value=tile[axis]*16+(axis==='x'?8:14);let reached=false;
  for(let n=0;n<45;n++){const p=await page.evaluate(gameName=>({...((gameName==='editor'?window.__worldEditor.game:window.__slg.game).player)}),gameName);
   if(p.areaId!==target.areaId&&target.areaId){return;}
   const delta=value-p[axis];if(Math.abs(delta)<=2){reached=true;break;}
   const key=axis==='x'?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp');
   await page.keyboard.press(key,{delay:Math.min(70,Math.max(20,(Math.abs(delta)-1)/72*1000))});
  }assert.ok(reached,`Walking stopped before ${JSON.stringify({tile,axis,target})}`);
 }
}
async function actOn(page,id){const target=await page.evaluate(async id=>{const game=window.__worldEditor.game,i=game.area.interactions.find(i=>i.id===id),{findPath}=await import('/src/world/index.ts');
 const from={x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)};
 for(const[dx,dy,key]of[[0,1,'ArrowUp'],[-1,0,'ArrowRight'],[0,-1,'ArrowDown'],[1,0,'ArrowLeft']]){const t={x:i.x+dx,y:i.y+dy};if(findPath(game.area,from,t))return{...t,key,areaId:game.player.areaId};}return null;},id);assert.ok(target);
 await walk(page,target);await page.keyboard.press(target.key,{delay:35});assert.equal(await page.evaluate(()=>window.__worldEditor.game.facingInteraction()?.id),id);await page.keyboard.press('KeyZ');}

try{
 await start();browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-gpu-vsync','--disable-frame-rate-limit']});
 const s=await session({width:1280,height:800}),{page}=s;await ready(page);
 assert.equal(await page.locator('[data-layer]:checked').count(),0);assert.equal(await page.locator('[data-catalog-id]').count(),16);pass('actual renderer and sixteen furniture thumbnails');
 const pixels=await page.evaluate(async()=>{const app=window.__worldEditor,actual=document.querySelector('#scene'),host=document.querySelector('#workspace'),canvas=document.createElement('canvas');const{Renderer}=await import('/src/render/renderer.ts');const{DEFAULT_APPEARANCE}=await import('/src/core/appearance.ts');
 const r=new Renderer(canvas);r.resize(host.clientWidth,host.clientHeight,devicePixelRatio);r.draw({area:app.model.runtime().areas.get('home-family-interior'),player:{x:8,y:14,facing:'down'},appearance:DEFAULT_APPEARANCE,moving:false,walkTime:0,dialog:{},camera:{...app.camera},hidePlayer:true,instant:true},0);
 const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return{equal:a.length===b.length&&a.every((v,i)=>v===b[i]),length:a.length};});assert.equal(pixels.equal,true);assert.ok(pixels.length>1000);pass('editor pixels equal an independent game Renderer');
 await page.screenshot({path:path.join(output,'desktop-editor.png')});
 const sofa='home-family-interior-sofa-1-9',desk='home-family-interior-lowtable-5-8';
 await move(page,sofa,2,9);assert.equal((await documentOf(page)).objects.find(o=>o.id===sofa).x,2);pass('sprite drag commits at a tile');
 await page.locator('#undo').click();assert.equal((await documentOf(page)).objects.find(o=>o.id===sofa).x,1);await page.locator('#redo').click();assert.equal((await documentOf(page)).objects.find(o=>o.id===sofa).x,2);pass('move undo and redo');
 await select(page,desk);assert.equal(await page.locator('#delete').isDisabled(),true);await page.keyboard.press('Delete');assert.ok((await documentOf(page)).objects.some(o=>o.id===desk));pass('linked furniture deletion is disabled');
 await move(page,desk,4,2);await page.locator('#rotate').click();const rotated=await documentOf(page),d=rotated.objects.find(o=>o.id===desk),interaction=rotated.interactions.find(i=>i.id==='home-tablet');assert.deepEqual([d.x,d.y,d.w,d.h],[4,2,1,2]);assert.deepEqual([interaction.x,interaction.y,interaction.w,interaction.h],[4,2,1,2]);pass('desk rotation and interaction move atomically');
 await page.locator('[data-catalog-id="chair-wood"]').click();const chair=await page.evaluate(()=>window.__worldEditor.ghost.object.id);let p=await tilePoint(page,8,6);await page.mouse.click(p.x,p.y);assert.ok((await documentOf(page)).objects.some(o=>o.id===chair));pass('catalog placement uses the game artwork');
 await page.locator('#rotate').click();assert.equal((await documentOf(page)).objects.find(o=>o.id===chair).facing,'left');await page.locator('#duplicate').click();const copied=await page.evaluate(()=>window.__worldEditor.ghost.object.id);p=await tilePoint(page,9,6);await page.mouse.click(p.x,p.y);assert.notEqual(copied,chair);await page.locator('#delete').click();assert.ok(!(await documentOf(page)).objects.some(o=>o.id===copied));await page.locator('#undo').click();assert.ok((await documentOf(page)).objects.some(o=>o.id===copied));await page.locator('#redo').click();pass('rotation duplicate delete undo redo');
 await page.locator('[data-catalog-id="chair-wood"]').click();const invalid=await page.evaluate(()=>window.__worldEditor.ghost.object.id);p=await tilePoint(page,7,10);await page.mouse.click(p.x,p.y);assert.ok(!(await documentOf(page)).objects.some(o=>o.id===invalid));pass('arrival obstruction is refused');
 await page.locator('#surface-tab').click();assert.equal(await page.locator('[data-catalog-id]').count(),10);await page.locator('[data-catalog-id="floor-wood-dark"]').click();p=await tilePoint(page,8,4);await page.mouse.click(p.x,p.y);await page.locator('#stop-placement').click();const painted=await documentOf(page);assert.ok(painted.areas.find(a=>a.id==='home-family-interior').surfaces.cells[4*16+8]>0);pass('floor and wall surface catalog and painting');
 await page.locator('#layers summary').click();for(const layer of ['collision','portals','reachable','grid','ids'])await page.locator(`[data-layer="${layer}"]`).check();await page.locator('#layers summary').click();await page.screenshot({path:path.join(output,'desktop-overlays.png')});await page.locator('#layers summary').click();for(const layer of ['collision','portals','reachable','grid','ids'])await page.locator(`[data-layer="${layer}"]`).uncheck();await page.locator('#layers summary').click();pass('all overlays are optional layers over the real scene');
 const storage=await page.evaluate(()=>({...localStorage}));await page.locator('#play').click();await page.locator('#workspace').focus();await actOn(page,'home-mother');await page.locator('#walk-dialog').waitFor({state:'visible'});assert.match(await page.locator('#walk-dialog').innerText(),/おかあさん/);await page.keyboard.press('KeyZ');
 const exit=await page.evaluate(()=>window.__worldEditor.game.area.def.portals.find(p=>p.id==='home-exit'));await walk(page,{...exit.from,areaId:'home-family-interior'});assert.equal(await page.evaluate(()=>window.__worldEditor.game.player.areaId),'town-main');await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>({...localStorage})),storage);pass('walk mother conversation and exit without player save writes');
 const target=path.join(root,layoutFile),before=await readFile(target,'utf8'),pendingDocument=await documentOf(page),pendingDirty=await page.evaluate(()=>window.__worldEditor.model.dirty);
 assert.ok(pendingDirty>0);const pendingPreview=await holdRequest(s.context,'**/__world-editor/preview');
 try{await page.locator('#save').click();await pendingPreview.started;assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.locator('#play').isDisabled(),true);assert.equal(await page.locator('#outside').isDisabled(),true);
  await page.locator('#workspace').focus();await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('Delete');await page.locator('#furniture-tab').click();await page.locator('[data-catalog-id="chair-wood"]').click();
  assert.deepEqual(await documentOf(page),pendingDocument);assert.equal(await page.evaluate(()=>window.__worldEditor.model.dirty),pendingDirty);
 }finally{pendingPreview.release();}
 await page.locator('#save-confirm').waitFor({state:'visible'});await pendingPreview.remove();await page.locator('#save-cancel').click();
 assert.deepEqual(await documentOf(page),pendingDocument);assert.equal(await page.evaluate(()=>window.__worldEditor.model.dirty),pendingDirty);assert.equal(await readFile(target,'utf8'),before);pass('preview wait blocks edits and cancellation preserves unsaved changes');
 await page.locator('#save').click();await page.locator('#save-confirm').waitFor({state:'visible'});assert.match(await page.locator('#save-target').innerText(),/home-family-interior.json/);await page.locator('#save-cancel').click();assert.equal(await readFile(target,'utf8'),before);pass('save confirmation cancellation preserves file bytes');
 await page.locator('#save').click();await page.locator('#save-confirm').waitFor({state:'visible'});const pendingWrite=await holdRequest(s.context,'**/__world-editor/save');
 try{await page.locator('#save-commit').click();await pendingWrite.started;assert.equal(await page.locator('#save-cancel').isDisabled(),true);await page.keyboard.press('Escape');
  const cancel=await page.locator('#save-cancel').boundingBox();await page.mouse.click(cancel.x+cancel.width/2,cancel.y+cancel.height/2);await page.keyboard.press('ControlOrMeta+z');
  assert.equal(await page.evaluate(()=>document.querySelector('#save-confirm').open),true);assert.deepEqual(await documentOf(page),pendingDocument);assert.equal(await page.evaluate(()=>window.__worldEditor.model.dirty),pendingDirty);pass('pending write refuses Escape and cancel without discarding edits');
 }finally{pendingWrite.release();}
 const deadline=Date.now()+15000;while(await readFile(target,'utf8')===before){if(Date.now()>deadline)throw new Error('Save timeout');await new Promise(r=>setTimeout(r,50));}const saved=await readFile(target,'utf8');await page.locator('#save-confirm').waitFor({state:'hidden',timeout:saveTimeLeft(deadline)});await pendingWrite.remove();const savedSnapshot=await savedEditorSnapshot(page,deadline);assert.equal(savedSnapshot.dirty,0);assert.deepEqual(savedSnapshot.document,pendingDocument);assert.equal(JSON.parse(saved).objects.find(o=>o.id===desk).facing,'left');pass('confirmed save changes only the area JSON');
 for(const headers of [{Origin:'https://invalid.example','Content-Type':'application/json','X-World-Editor':'1'},{Origin:origin,'Content-Type':'text/plain','X-World-Editor':'1'},{Origin:origin,'Content-Type':'application/json'}])assert.equal((await fetch(`${origin}/__world-editor/save`,{method:'POST',headers,body:'{}'})).status,403);
 assert.equal((await fetch(`${origin}/__world-editor/save`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-World-Editor':'1'},body:JSON.stringify({areaId:'../../outside',changes:{}})})).status,400);assert.equal(await readFile(target,'utf8'),saved);pass('write origin content type header and output scope guards');
 // Close the live HMR client before intentionally stopping its development server.
 await s.context.close();assert.deepEqual(s.errors,[]);assert.deepEqual(s.blocked,[]);
 await stop();await start();const restarted=await session({width:1280,height:800}),freshPage=restarted.page;
 await freshPage.goto(gameplayUrl(`${origin}/`));await freshPage.waitForFunction(()=>!!window.__slg?.game);const entry=await freshPage.evaluate(()=>window.__slg.game.area.def.portals.find(p=>p.id==='home-enter'));await walk(freshPage,{...entry.from,areaId:'town-main'},'game');assert.equal(await freshPage.evaluate(()=>window.__slg.game.player.areaId),'home-family-interior');assert.equal(await freshPage.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id).x,sofa),2);assert.equal(await freshPage.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id).facing,desk),'left');await ready(freshPage);assert.deepEqual(await documentOf(freshPage),pendingDocument);assert.equal(await freshPage.evaluate(()=>window.__worldEditor.model.dirty),0);pass('server restart and real game home entry use the saved arrangement');
 await restarted.context.close();assert.deepEqual(restarted.errors,[]);assert.deepEqual(restarted.blocked,[]);
 for(const[name,viewport]of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
  const mobile=await session(viewport,true),page=mobile.page;await ready(page);await page.screenshot({path:path.join(output,`${name}-editor.png`)});
  await page.locator('#zoom-out').click();await page.locator('#zoom-out').click();const from=await point(page,sofa),delta=await page.evaluate(()=>{const a=window.__worldEditor.toScreen(0,0),b=window.__worldEditor.toScreen(16,0);return b.x-a.x;});
  const cdp=await mobile.context.newCDPSession(page);const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p.x,y:p.y,id:i+1,radiusX:2,radiusY:2}))});
  await touch('touchStart',[from]);for(let n=1;n<=8;n++){await touch('touchMove',[{x:from.x+delta*n/8,y:from.y}]);await page.waitForTimeout(20);}await touch('touchEnd',[]);assert.equal((await documentOf(page)).objects.find(o=>o.id===sofa).x,from.object.x+1);pass(`${name}: one-finger furniture drag`);
  const doc=await documentOf(page),bounds=await page.locator('#workspace').boundingBox(),a={x:bounds.x+25,y:bounds.y+25},b={x:bounds.x+100,y:bounds.y+25};const prior=await page.evaluate(()=>({...window.__worldEditor.camera}));
  await touch('touchStart',[a,b]);await touch('touchMove',[{x:a.x+10,y:a.y+10},{x:b.x+90,y:b.y+10}]);await page.waitForTimeout(70);const enlarged=await page.evaluate(()=>({...window.__worldEditor.camera}));assert.notEqual(enlarged.zoom,prior.zoom);await touch('touchMove',[a,b]);await touch('touchEnd',[]);assert.deepEqual(await documentOf(page),doc);pass(`${name}: two-finger zoom/pan leaves authoring data unchanged`);
  assert.equal(await page.locator('#save').isDisabled(),true);await page.locator('#play').click();
  const beforeWalk=await page.evaluate(()=>({...window.__worldEditor.game.player})),up=await page.locator('[data-direction="up"]').boundingBox();
  await touch('touchStart',[{x:up.x+up.width/2,y:up.y+up.height/2}]);await page.waitForTimeout(130);await touch('touchEnd',[]);
  assert.ok(await page.evaluate(y=>window.__worldEditor.game.player.y<y-2,beforeWalk.y));
  await page.locator('#walk-action').tap();await page.locator('#play').tap();assert.deepEqual(mobile.errors,[]);assert.deepEqual(mobile.blocked,[]);await cdp.detach();await mobile.context.close();pass(`${name}: touch play and PC-only save`);
 }
 const roomsSession=await session({width:1280,height:800}),rp=roomsSession.page;await ready(rp);
 const areaValues=await rp.locator('#area-select option').evaluateAll(opts=>opts.map(o=>o.value));
 assert.equal(areaValues.length,14);
 assert.deepEqual(areaValues.filter(v=>v!=='town-main'),['home-family-2f','home-family-interior','school-classroom-interior','shop-bakery-interior','shop-bookstore-interior','shop-cafe-interior','shop-candy-interior','shop-greengrocer-interior','shop-konbini-interior','shop-pharmacy-interior','station-main-interior','station-neighbor-interior','town-neighbor']);
 // Edit school-classroom-interior: place & 4-dir rotate chair-wood, check wall item lock reason, rotate legacy sdesk & tdesk, paint floor.
 await rp.locator('#area-select').selectOption('school-classroom-interior');
 await rp.waitForFunction(()=>window.__worldEditor.activeArea==='school-classroom-interior');
 assert.equal(await rp.locator('#location').innerText(),'きょうしつ');
 const classDesk='school-classroom-interior-sdesk-2-8',classTdesk='school-classroom-interior-tdesk-8-2';
 await select(rp,'school-classroom-interior-blackboard-5-0');
 assert.equal(await rp.locator('#rotate').isDisabled(),true);
 assert.match(await rp.locator('#protection').innerText(),/壁に掛ける物は奥の壁向きだけのため回せません/);
 await select(rp,'school-classroom-interior-window-2-0');
 assert.equal(await rp.locator('#rotate').isDisabled(),true);
 assert.match(await rp.locator('#protection').innerText(),/壁に掛ける物は奥の壁向きだけのため回せません/);
 await select(rp,classTdesk);assert.equal(await rp.locator('#rotate').isDisabled(),false);
 await rp.locator('#rotate').click();
 assert.deepEqual(await rp.evaluate(id=>{const o=window.__worldEditor.model.object(id,undefined,'school-classroom-interior');return{facing:o.facing,w:o.w,h:o.h,kind:o.kind,hasCatalog:Boolean(o.catalogId)};},classTdesk),{facing:'left',w:1,h:2,kind:'tdesk',hasCatalog:false});
 await rp.locator('[data-catalog-id="chair-wood"]').click();
 const classChair=await rp.evaluate(()=>window.__worldEditor.ghost.object.id);
 let pt=await tilePoint(rp,3,9);await rp.mouse.click(pt.x,pt.y);
 const chairFacings=[await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'school-classroom-interior').facing,classChair)];
 for(let i=0;i<4;i++){await rp.locator('#rotate').click();chairFacings.push(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'school-classroom-interior').facing,classChair));}
 assert.deepEqual(chairFacings,['down','left','up','right','down']);
 await rp.locator('#rotate').click();await rp.locator('#rotate').click();
 await select(rp,classDesk);assert.equal(await rp.locator('#rotate').isDisabled(),false);
 const deskCycle=[await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'school-classroom-interior').facing??'down',classDesk)];
 for(let i=0;i<4;i++){await rp.locator('#rotate').click();deskCycle.push(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'school-classroom-interior').facing,classDesk));}
 assert.deepEqual(deskCycle,['down','left','up','right','down']);
 await rp.locator('#rotate').click();await rp.locator('#rotate').click();
 await move(rp,classDesk,3,8);
 assert.equal(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'school-classroom-interior').facing,classDesk),'up');
 await rp.locator('#surface-tab').click();await rp.locator('[data-catalog-id="floor-wood-dark"]').click();
 pt=await tilePoint(rp,6,9);await rp.mouse.click(pt.x,pt.y);await rp.locator('#stop-placement').click();
 await rp.screenshot({path:path.join(output,'desktop-classroom-edited.png')});pass('classroom edits: chair + legacy sdesk/tdesk rotation, wall item reason, surface paint');
 // Edit shop-bookstore-interior: rotate retail fixtures + linked interactions + style preservation.
 await rp.locator('#area-select').selectOption('shop-bookstore-interior');
 await rp.waitForFunction(()=>window.__worldEditor.activeArea==='shop-bookstore-interior');
 assert.equal(await rp.locator('#location').innerText(),'ほんや');
 const bookMag='shop-bookstore-interior-magazines',bookPicture='shop-bookstore-interior-picture-books',bookEast='shop-bookstore-interior-back-books-east';
 await select(rp,bookMag);assert.equal(await rp.locator('#rotate').isDisabled(),false);
 await rp.locator('#rotate').click();
 assert.deepEqual(await rp.evaluate(id=>{const d=window.__worldEditor.model.document,o=d.objects.find(p=>p.id===id),link=d.interactions.find(i=>i.objectId===id);return{facing:o.facing,w:o.w,h:o.h,lw:link.w,lh:link.h,kind:o.kind,hasCatalog:Boolean(o.catalogId)};},bookMag),{facing:'left',w:1,h:3,lw:1,lh:3,kind:'bookstore-magazine-rack',hasCatalog:false});
 await select(rp,bookPicture);await rp.locator('#rotate').click();await rp.locator('#rotate').click();
 assert.deepEqual(await rp.evaluate(id=>{const d=window.__worldEditor.model.document,o=d.objects.find(p=>p.id===id),link=d.interactions.find(i=>i.objectId===id);return{facing:o.facing,w:o.w,h:o.h,lw:link.w,lh:link.h};},bookPicture),{facing:'up',w:3,h:2,lw:3,lh:2});
 await select(rp,bookEast);await rp.locator('#rotate').click();
 assert.deepEqual(await rp.evaluate(id=>{const o=window.__worldEditor.model.object(id,undefined,'shop-bookstore-interior');return{facing:o.facing,w:o.w,h:o.h,style:o.style};},bookEast),{facing:'left',w:1,h:4,style:'b'});
 // Edit shop-candy-interior: select Type B candy-hanging-rack, verify restriction reason appears while #rotate stays enabled, and cycle down -> left -> right -> down.
 await rp.locator('#area-select').selectOption('shop-candy-interior');
 await rp.waitForFunction(()=>window.__worldEditor.activeArea==='shop-candy-interior');
 assert.equal(await rp.locator('#location').innerText(),'だがしや');
 const candyRack='shop-candy-interior-hanging-rack';
 await select(rp,candyRack);
 assert.equal(await rp.locator('#rotate').isDisabled(),false);
 assert.match(await rp.locator('#protection').innerText(),/壁に付ける物なので、奥向きにはできません/);
 await rp.screenshot({path:path.join(output,'desktop-candy-type-b-selected.png')});
 const readCandyRack=()=>rp.evaluate(id=>{const o=window.__worldEditor.model.object(id,undefined,'shop-candy-interior');const i=window.__worldEditor.model.document.interactions.find(p=>p.objectId===id);return{facing:o.facing??'down',w:o.w,h:o.h,iw:i?.w,ih:i?.h};},candyRack);
 const candyCycle=[await readCandyRack()];
 for(const expectedFacing of ['left','right','down']){
  await rp.locator('#rotate').click();
  assert.equal(await rp.locator('#rotate').isDisabled(),false);
  assert.match(await rp.locator('#protection').innerText(),/壁に付ける物なので、奥向きにはできません/);
  assert.match(await rp.locator('#object-position').innerText(),new RegExp(`向き ${expectedFacing}`));
  if(expectedFacing==='left')await rp.screenshot({path:path.join(output,'desktop-candy-type-b-left.png')});
  candyCycle.push(await readCandyRack());
 }
 assert.deepEqual(candyCycle,[
  {facing:'down',w:3,h:1,iw:3,ih:1},
  {facing:'left',w:1,h:3,iw:1,ih:3},
  {facing:'right',w:1,h:3,iw:1,ih:3},
  {facing:'down',w:3,h:1,iw:3,ih:1},
 ]);
 pass('candy shop Type B restriction reason and 3-direction rotation cycle');
 // Edit shop-konbini-interior: verify shop-floor non-rotatable reason, place chair-wood, intentional rug+table overlap, trial walk + exit portal, and multi-room atomic save.
 await rp.locator('#area-select').selectOption('shop-konbini-interior');
 await rp.waitForFunction(()=>window.__worldEditor.activeArea==='shop-konbini-interior');
 assert.equal(await rp.locator('#location').innerText(),'コンビニ');
 const konbiniFloor='shop-konbini-interior-shop-floor-1-1';
 pt=await tilePoint(rp,10,8);await rp.mouse.click(pt.x,pt.y);await rp.locator('#properties').waitFor({state:'visible'});
 assert.match(await rp.locator('#object-id').textContent()??'',new RegExp(konbiniFloor));
 assert.equal(await rp.locator('#rotate').isDisabled(),true);
 assert.match(await rp.locator('#protection').innerText(),/床の下地のため回せません/);
 await rp.locator('#furniture-tab').click();await rp.locator('[data-catalog-id="chair-wood"]').click();
 const shopChair=await rp.evaluate(()=>window.__worldEditor.ghost.object.id);
 pt=await tilePoint(rp,3,8);await rp.mouse.click(pt.x,pt.y);await rp.locator('#rotate').click();
 await rp.locator('[data-catalog-id="rug-large"]').click();pt=await tilePoint(rp,8,5);await rp.mouse.click(pt.x,pt.y);
 const addedRug=await rp.evaluate(()=>window.__worldEditor.model.document.objects.find(o=>o.areaId==='shop-konbini-interior'&&o.catalogId==='rug-large')?.id);
 assert.ok(addedRug,'rug-large should place cleanly in shop-konbini-interior');
 await rp.locator('[data-catalog-id="table-low"]').click();pt=await tilePoint(rp,8,5);await rp.mouse.click(pt.x,pt.y);
 const addedTable=await rp.evaluate(()=>window.__worldEditor.model.document.objects.find(o=>o.areaId==='shop-konbini-interior'&&o.catalogId==='table-low')?.id);
 assert.ok(addedTable,'table-low should intentionally overlap rug-large');
 await rp.locator('#undo').click();assert.equal(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'shop-konbini-interior'),addedTable),undefined);
 await rp.locator('#redo').click();assert.ok(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'shop-konbini-interior'),addedTable));
 const konbiniShelf=await rp.evaluate(()=>window.__worldEditor.model.document.objects.find(o=>o.areaId==='shop-konbini-interior'&&o.kind==='konbini-snack-shelf')?.id);
 assert.ok(konbiniShelf,'konbini-snack-shelf present');
 const konbiniBefore=await rp.evaluate(id=>{const o=window.__worldEditor.model.object(id,undefined,'shop-konbini-interior');return{w:o.w,h:o.h};},konbiniShelf);
 await select(rp,konbiniShelf);await rp.locator('#rotate').click();
 assert.deepEqual(await rp.evaluate(id=>{const o=window.__worldEditor.model.object(id,undefined,'shop-konbini-interior');return{facing:o.facing,w:o.w,h:o.h};},konbiniShelf),{facing:'left',w:konbiniBefore.h,h:konbiniBefore.w});
 await rp.screenshot({path:path.join(output,'desktop-konbini-edited.png')});
 await rp.locator('#play').click();await rp.locator('#workspace').focus();
 assert.equal(await rp.evaluate(()=>window.__worldEditor.game.player.areaId),'shop-konbini-interior');
 const konbiniExit=await rp.evaluate(()=>window.__worldEditor.game.area.def.portals.find(p=>p.id==='konbini-exit'));
 await walk(rp,{...konbiniExit.from,areaId:'shop-konbini-interior'});
 assert.equal(await rp.evaluate(()=>window.__worldEditor.game.player.areaId),'town-main');
 await rp.keyboard.press('Escape');
 await rp.locator('#area-select').selectOption('shop-cafe-interior');
 await rp.waitForFunction(()=>window.__worldEditor.activeArea==='shop-cafe-interior');
 const cafeChair='shop-cafe-interior-chair-nw-l';
 assert.equal(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'shop-cafe-interior').facing,cafeChair),'right');
 await select(rp,cafeChair);await rp.locator('#rotate').click();
 assert.equal(await rp.evaluate(id=>window.__worldEditor.model.object(id,undefined,'shop-cafe-interior').facing,cafeChair),'down');
 await rp.screenshot({path:path.join(output,'desktop-cafe-edited.png')});
 const multiDoc=await documentOf(rp);
 await rp.locator('#save').click();await rp.locator('#save-confirm').waitFor({state:'visible'});
 const savedNames=await rp.locator('#save-files li').allTextContents();
 assert.ok(savedNames.some(t=>t.includes('school-classroom-interior.json'))&&savedNames.some(t=>t.includes('shop-bookstore-interior.json'))&&savedNames.some(t=>t.includes('shop-konbini-interior.json'))&&savedNames.some(t=>t.includes('shop-cafe-interior.json')),JSON.stringify(savedNames));
 const multiDeadline=Date.now()+15000;await rp.locator('#save-commit').click();await rp.locator('#save-confirm').waitFor({state:'hidden',timeout:saveTimeLeft(multiDeadline)});
 const multiSnapshot=await savedEditorSnapshot(rp,multiDeadline);assert.equal(multiSnapshot.dirty,0);assert.deepEqual(multiSnapshot.document,multiDoc);
 const savedClassroom=JSON.parse(await readFile(path.join(root,'data/world/areas/school-classroom-interior.json'),'utf8'));
 const savedBookstore=JSON.parse(await readFile(path.join(root,'data/world/areas/shop-bookstore-interior.json'),'utf8'));
 const savedKonbini=JSON.parse(await readFile(path.join(root,'data/world/areas/shop-konbini-interior.json'),'utf8'));
 const savedCafe=JSON.parse(await readFile(path.join(root,'data/world/areas/shop-cafe-interior.json'),'utf8'));
 assert.ok(savedClassroom.objects.some(o=>o.id===classChair));
 const savedDesk=savedClassroom.objects.find(o=>o.id===classDesk);
 const savedTdesk=savedClassroom.objects.find(o=>o.id===classTdesk);
 assert.deepEqual(savedDesk,{id:classDesk,kind:'sdesk',facing:'up',x:3,y:8,w:1,h:1,solid:true,layer:'sorted'});
 assert.deepEqual(savedTdesk,{id:classTdesk,kind:'tdesk',facing:'left',x:8,y:2,w:1,h:2,solid:true,layer:'sorted'});
 assert.equal(savedDesk.catalogId,undefined);assert.equal(savedTdesk.catalogId,undefined);
 assert.deepEqual(savedBookstore.objects.find(o=>o.id===bookMag),{id:bookMag,kind:'bookstore-magazine-rack',facing:'left',x:2,y:8,w:1,h:3,solid:true,layer:'sorted'});
 assert.equal(savedBookstore.objects.find(o=>o.id===bookPicture).facing,'up');
 assert.deepEqual(savedBookstore.objects.find(o=>o.id===bookEast),{id:bookEast,kind:'bookstore-tall-shelf',style:'b',facing:'left',x:6,y:1,w:1,h:4,solid:true,layer:'sorted'});
 assert.ok(savedKonbini.objects.some(o=>o.id===shopChair));
 assert.ok(savedKonbini.objects.some(o=>o.id===addedTable));
 assert.deepEqual((()=>{const o=savedKonbini.objects.find(p=>p.id===konbiniShelf);return{facing:o.facing,w:o.w,h:o.h};})(),{facing:'left',w:konbiniBefore.h,h:konbiniBefore.w});
 assert.equal(savedCafe.objects.find(o=>o.id===cafeChair).facing,'down');
 await roomsSession.context.close();assert.deepEqual(roomsSession.errors,[]);assert.deepEqual(roomsSession.blocked,[]);
 await stop();await start();
 const verifyRooms=await session({width:1280,height:800}),vp=verifyRooms.page;
 await ready(vp);assert.deepEqual(await documentOf(vp),multiDoc);
 await vp.goto(gameplayUrl(`${origin}/`));await vp.waitForFunction(()=>!!window.__slg?.game);
 const marks=await vp.evaluate(async()=>({...(await import('/src/world/index.ts')).LANDMARKS}));
 await walk(vp,{...marks.schoolDoorFront,areaId:'town-main'},'game');
 await walk(vp,{x:marks.schoolDoorFront.x,y:marks.schoolDoorFront.y-1,areaId:'town-main'},'game');
 assert.equal(await vp.evaluate(()=>window.__slg.game.player.areaId),'school-classroom-interior');
 assert.equal(await vp.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id)?.facing,classChair),'up');
 assert.equal(await vp.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id)?.facing,classDesk),'up');
 assert.deepEqual(await vp.evaluate(id=>{const o=window.__slg.game.area.objects.find(p=>p.id===id);return{facing:o?.facing,w:o?.w,h:o?.h};},classTdesk),{facing:'left',w:1,h:2});
 await vp.screenshot({path:path.join(output,'desktop-game-classroom-edited.png')});
 await walk(vp,{x:4,y:9,areaId:'school-classroom-interior'},'game');
 const schoolExit=await vp.evaluate(()=>window.__slg.game.area.def.portals.find(p=>p.id==='school-exit').from);
 await walk(vp,{...schoolExit,areaId:'school-classroom-interior'},'game');
 assert.equal(await vp.evaluate(()=>window.__slg.game.player.areaId),'town-main');
 const bookstoreDoor=await vp.evaluate(()=>window.__slg.game.area.def.portals.find(p=>p.id==='bookstore-enter').from);
 await walk(vp,{x:bookstoreDoor.x,y:bookstoreDoor.y+1,areaId:'town-main'},'game');
 await walk(vp,{x:bookstoreDoor.x,y:bookstoreDoor.y,areaId:'town-main'},'game');
 assert.equal(await vp.evaluate(()=>window.__slg.game.player.areaId),'shop-bookstore-interior');
 assert.deepEqual(await vp.evaluate(id=>{const a=window.__slg.game.area,o=a.objects.find(p=>p.id===id),l=a.interactions.find(i=>i.id==='shop-bookstore-interior-magazines-inspect');return{facing:o?.facing,w:o?.w,h:o?.h,lw:l?.w,lh:l?.h};},bookMag),{facing:'left',w:1,h:3,lw:1,lh:3});
 assert.equal(await vp.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id)?.facing,bookPicture),'up');
 assert.deepEqual(await vp.evaluate(id=>{const o=window.__slg.game.area.objects.find(p=>p.id===id);return{facing:o?.facing,w:o?.w,h:o?.h,style:o?.style};},bookEast),{facing:'left',w:1,h:4,style:'b'});
 const bookstoreExit=await vp.evaluate(()=>window.__slg.game.area.def.portals.find(p=>p.id==='bookstore-exit').from);
 await walk(vp,{...bookstoreExit,areaId:'shop-bookstore-interior'},'game');
 assert.equal(await vp.evaluate(()=>window.__slg.game.player.areaId),'town-main');
 await walk(vp,{...marks.konbiniDoorFront,areaId:'town-main'},'game');
 await walk(vp,{x:marks.konbiniDoorFront.x,y:marks.konbiniDoorFront.y-1,areaId:'town-main'},'game');
 assert.equal(await vp.evaluate(()=>window.__slg.game.player.areaId),'shop-konbini-interior');
 assert.ok(await vp.evaluate(id=>window.__slg.game.area.objects.some(o=>o.id===id),shopChair));
 assert.ok(await vp.evaluate(id=>window.__slg.game.area.objects.some(o=>o.id===id),addedTable));
 assert.deepEqual(await vp.evaluate(id=>{const o=window.__slg.game.area.objects.find(p=>p.id===id);return{facing:o?.facing,w:o?.w,h:o?.h};},konbiniShelf),{facing:'left',w:konbiniBefore.h,h:konbiniBefore.w});
 await vp.screenshot({path:path.join(output,'desktop-game-konbini-edited.png')});
 await verifyRooms.context.close();assert.deepEqual(verifyRooms.errors,[]);assert.deepEqual(verifyRooms.blocked,[]);
 pass('all existing indoor areas edit, multi-save, restart, walk and reflect in real game');
 assert.equal(await readFile(path.join(source,layoutFile),'utf8'),original);pass('original project and all previews remain unchanged');
 console.log(`SUMMARY ${passed}/${passed} PASS`,JSON.stringify({output}));
}catch(error){console.error('FAIL',error);console.error(serverOutput);process.exitCode=1;}
finally{await browser?.close();await stop();if(!process.exitCode)await rm(temp,{recursive:true,force:true});else console.error('Failure copy preserved:',root);}
