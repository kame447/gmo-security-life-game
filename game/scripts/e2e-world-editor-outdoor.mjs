/** Native UI regression. Every save and restart uses a disposable game copy. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cp,mkdir,mkdtemp,readdir,readFile,realpath,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'slg-outdoor-editor-e2e-'))),root=path.join(temp,'game');
const output=process.env.SLG_SHOTS||path.join(temp,'shots');assert.ok(path.isAbsolute(output));await mkdir(output,{recursive:true});
const port=Number(process.env.SLG_OUTDOOR_EDITOR_PORT||5382);assert.ok(Number.isSafeInteger(port)&&port>1023&&port<65536);
const origin=`http://127.0.0.1:${port}`,directory='data/world/areas',town='town-main',home='home-family-interior';
const treeId='town-tree-15-34',shopId='town-shop-51-47',houseId='town-house-32-27',plantId='home-family-interior-plant-14-9';
const original=new Map();for(const name of await readdir(path.join(source,directory)))if(name.endsWith('.json'))original.set(name,await readFile(path.join(source,directory,name),'utf8'));
await cp(source,root,{recursive:true,filter:file=>!['node_modules','dist'].some(name=>{const p=path.relative(source,file);return p===name||p.startsWith(`${name}/`);})});
await symlink(path.join(source,'node_modules'),path.join(root,'node_modules'),'dir');
let server,serverOutput='',browser,passed=0;
const pass=name=>{passed++;console.log('PASS',name);};
async function start(){serverOutput='';server=spawn(process.execPath,[path.join(source,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,NO_COLOR:'1'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>serverOutput+=b);server.stderr.on('data',b=>serverOutput+=b);
 const deadline=Date.now()+20000;while(Date.now()<deadline){if(server.exitCode!==null)throw new Error(serverOutput);try{if(serverOutput.includes('Local:')&&(await fetch(`${origin}/world-editor.html`)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server timeout: ${serverOutput}`);}
async function stop(){if(!server||server.exitCode!==null)return;const current=server,done=new Promise(resolve=>current.once('exit',resolve));current.kill('SIGTERM');await done;}
const doc=page=>page.evaluate(()=>window.__worldEditor.model.document);
const object=(page,id)=>page.evaluate(id=>window.__worldEditor.model.document.objects.find(o=>o.id===id),id);
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function ready(s){await s.page.goto(`${origin}/world-editor.html`);await s.page.waitForFunction(()=>window.__worldEditor?.renderer.stats.chunksDrawn>0);await frames(s.page);}
async function session(viewport,touch=false){const context=await browser.newContext({viewport,hasTouch:touch,acceptDownloads:false,serviceWorkers:'block'}),errors=[],blocked=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||u.protocol==='data:')return route.continue();blocked.push(u.href);return route.abort();});
 await context.routeWebSocket('**',socket=>{if(new URL(socket.url()).origin===origin.replace('http','ws'))socket.connectToServer();else{blocked.push(socket.url());void socket.close();}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('download',download=>{errors.push('Unexpected download');void download.cancel();});context.on('page',popup=>{if(popup!==page)errors.push('Unexpected popup');});page.on('dialog',dialog=>{errors.push('Unexpected dialog');void dialog.dismiss();});
 const cdp=touch?await context.newCDPSession(page):undefined;
 const fingers=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p.x,y:p.y,id:i+1,radiusX:2,radiusY:2}))});
 return{context,page,errors,blocked,cdp,fingers,touch,click:selector=>touch?page.locator(selector).tap():page.locator(selector).click()};}
async function close(s){await s.cdp?.detach();await s.context.close();assert.deepEqual(s.errors,[]);assert.deepEqual(s.blocked,[]);}
async function enterTown(s){await s.click('#outside');await s.page.waitForFunction(()=>window.__worldEditor.activeArea==='town-main');await frames(s.page);}
async function focus(s,target){
 for(let n=0;n<100;n++){
  const delta=await s.page.evaluate(target=>{const app=window.__worldEditor,p=app.toScreen(target.x,target.y),w=document.querySelector('#workspace');return{x:p.x-w.clientWidth*(w.clientWidth<500?.25:.35),y:p.y-w.clientHeight*.45};},target);
  if(Math.abs(delta.x)<3&&Math.abs(delta.y)<3)return;
  const r=await s.page.locator('#workspace').boundingBox();
  if(s.touch){const dx=-Math.sign(delta.x)*Math.min(Math.abs(delta.x),r.width*.12),dy=-Math.sign(delta.y)*Math.min(Math.abs(delta.y),r.height*.18);
   const a={x:r.x+r.width*.15,y:r.y+r.height*.5},b={x:r.x+r.width*.32,y:a.y};
   await s.fingers('touchStart',[a,b]);await s.fingers('touchMove',[{x:a.x+dx,y:a.y+dy},{x:b.x+dx,y:b.y+dy}]);await s.fingers('touchEnd',[]);
  }else{await s.page.mouse.move(r.x+15,r.y+r.height*.4);await s.page.mouse.wheel(delta.x,delta.y);}
  await frames(s.page);
 }throw new Error(`Could not pan to ${JSON.stringify(target)}`);
}
async function focusObject(s,id){const o=await object(s.page,id);assert.ok(o,`Missing object ${id}`);await focus(s,{x:(o.x+o.w/2)*16,y:(o.y+o.h/2)*16});}
async function point(page,id){return page.evaluate(async id=>{
 const app=window.__worldEditor,documentData=app.model.document,o=documentData.objects.find(o=>o.id===id);if(!o)throw new Error(`Missing ${id}`);
 const{objectSprite}=await import('/src/render/sprites.ts'),{hitItem}=await import('/src/world-editor/hit-test.ts'),{changedAreaIds}=await import('/src/world-editor/world-policy.ts');
 const world=app.model.runtime(documentData,[...new Set(['home-family-interior',...changedAreaIds(app.model.initial,documentData)])]),area=world.areas.get(o.areaId),sprite=objectSprite(o),pixels=sprite.canvas.getContext('2d').getImageData(0,0,sprite.canvas.width,sprite.canvas.height).data;
 const r=document.querySelector('#workspace').getBoundingClientRect(),candidates=[];
 for(let y=0;y<sprite.canvas.height;y++)for(let x=0;x<sprite.canvas.width;x++)if(pixels[(y*sprite.canvas.width+x)*4+3])candidates.push({x,y,score:Math.abs(x-sprite.canvas.width/2)+Math.abs(y-(sprite.canvas.height-7))});
 candidates.sort((a,b)=>a.score-b.score);
 for(const p of candidates){const wx=o.x*16+sprite.ox+p.x+.5,wy=o.y*16+sprite.oy+p.y+.5,screen=app.toScreen(wx,wy),x=screen.x+r.x,y=screen.y+r.y;
  if(screen.x<0||screen.y<0||screen.x>=r.width||screen.y>=r.height||document.elementFromPoint(x,y)?.closest('aside'))continue;
  if(hitItem(area,wx,wy)?.id===id)return{x,y,object:o};
 }throw new Error(`No exposed opaque artwork for ${id}`);
 },id);}
async function select(s,id){await focusObject(s,id);const p=await point(s.page,id);if(s.touch)await s.page.touchscreen.tap(p.x,p.y);else await s.page.mouse.click(p.x,p.y);
 await s.page.locator('#properties').waitFor({state:'visible'});assert.equal(await s.page.locator('#object-id').textContent(),`ID ${id}（変更できません）`);}
async function drag(s,id,x,y,expected=true){await focusObject(s,id);const p=await point(s.page,id),delta=await s.page.evaluate(({dx,dy})=>{const a=window.__worldEditor.toScreen(0,0),b=window.__worldEditor.toScreen(dx*16,dy*16);return{x:b.x-a.x,y:b.y-a.y};},{dx:x-p.object.x,dy:y-p.object.y});
 if(s.touch){await s.fingers('touchStart',[p]);for(let n=1;n<=8;n++){await s.fingers('touchMove',[{x:p.x+delta.x*n/8,y:p.y+delta.y*n/8}]);await s.page.waitForTimeout(20);}await s.fingers('touchEnd',[]);}
 else{await s.page.mouse.move(p.x,p.y);await s.page.mouse.down();await s.page.mouse.move(p.x+delta.x,p.y+delta.y,{steps:8});await s.page.mouse.up();}
 if(expected)await s.page.waitForFunction(({id,x,y})=>{const o=window.__worldEditor.model.document.objects.find(o=>o.id===id);return o?.x===x&&o?.y===y;},{id,x,y});await frames(s.page);
}
async function save(s,areaIds){await s.click('#save');await s.page.locator('#save-confirm').waitFor({state:'visible'});
 const targets=await s.page.locator('#save-files li').allTextContents();assert.equal(targets.length,areaIds.length);for(const id of areaIds)assert.ok(targets.some(text=>text.includes(`${id}.json`)),JSON.stringify(targets));
 await s.click('#save-commit');await s.page.locator('#save-confirm').waitFor({state:'hidden'});await s.page.waitForFunction(()=>window.__worldEditor.model.dirty===0);
 for(const id of areaIds)JSON.parse(await readFile(path.join(root,directory,`${id}.json`),'utf8'));return targets;
}
async function restart(s,expected){await close(s);await stop();await start();const fresh=await session({width:1280,height:800});await ready(fresh);assert.deepEqual(await doc(fresh.page),expected);return fresh;}
async function press(s,key,delay){if(!s.touch)return s.page.keyboard.press(key,{delay});const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[key],r=await s.page.locator(`[data-direction="${direction}"]`).boundingBox();
 await s.fingers('touchStart',[{x:r.x+r.width/2,y:r.y+r.height/2}]);await s.page.waitForTimeout(delay);await s.fingers('touchEnd',[]);}
async function walk(s,target){const route=await s.page.evaluate(async target=>{const game=window.__worldEditor.game,{findPath}=await import('/src/world/index.ts');return findPath(game.area,{x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)},target);},target);assert.ok(route,`No path to ${JSON.stringify(target)}`);
 for(const tile of route)for(const axis of ['x','y']){const value=tile[axis]*16+(axis==='x'?8:14);let reached=false;
  for(let n=0;n<45;n++){const p=await s.page.evaluate(()=>({...window.__worldEditor.game.player}));if(p.areaId!==target.areaId)return;const delta=value-p[axis];if(Math.abs(delta)<=2){reached=true;break;}
   await press(s,axis==='x'?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp'),Math.min(70,Math.max(20,(Math.abs(delta)-1)/72*1000)));
  }assert.ok(reached,`Walking stopped before ${JSON.stringify({target,tile,axis})}`);
 }
}
const playerTile=page=>page.evaluate(()=>{const p=window.__worldEditor.game.player;return{areaId:p.areaId,x:Math.floor(p.x/16),y:Math.floor((p.y-4)/16)};});
async function visitShop(s,x){await s.click('#play');assert.deepEqual(await playerTile(s.page),{areaId:town,x,y:53});
 await s.page.locator('#workspace').focus();await walk(s,{areaId:town,x,y:52});assert.equal((await playerTile(s.page)).areaId,'shop-konbini-interior');
 const exit=await s.page.evaluate(()=>window.__worldEditor.game.area.def.portals.find(p=>p.id==='konbini-exit'));await walk(s,{areaId:'shop-konbini-interior',...exit.from});assert.deepEqual(await playerTile(s.page),{areaId:town,x,y:53});await s.click('#play');}
async function roomRoundtrip(s,id,double=false){await select(s,id);const before=await doc(s.page),view=await s.page.evaluate(()=>({...window.__worldEditor.camera})),dirty=await s.page.locator('#dirty').innerText();
 if(double){const p=await point(s.page,id);await s.page.mouse.dblclick(p.x,p.y);}else await s.click('#enter-interior');
 await s.page.waitForFunction(()=>window.__worldEditor.activeArea==='shop-konbini-interior');assert.match(await s.page.locator('#location').innerText(),/表示のみ/);
 await s.click('#outside');await s.page.waitForFunction(()=>window.__worldEditor.activeArea==='town-main');await frames(s.page);
 assert.deepEqual(await s.page.evaluate(()=>({...window.__worldEditor.camera})),view);assert.deepEqual(await doc(s.page),before);assert.equal(await s.page.locator('#dirty').innerText(),dirty);assert.equal(await s.page.locator('#object-id').textContent(),`ID ${id}（変更できません）`);
}
async function place(s,entryId,x,y){await s.click(`[data-outdoor-id="${entryId}"]`);const id=await s.page.evaluate(()=>window.__worldEditor.ghost.object.id);await focus(s,{x:x*16+8,y:y*16+8});
 const p=await s.page.evaluate(({x,y})=>{const p=window.__worldEditor.toScreen(x*16+8,y*16+8),r=document.querySelector('#workspace').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});
 if(s.touch)await s.page.touchscreen.tap(p.x,p.y);else await s.page.mouse.click(p.x,p.y);return id;
}

try{
 await start();browser=await chromium.launch({headless:true,args:['--disable-background-networking','--disable-gpu-vsync','--disable-frame-rate-limit']});
 let s=await session({width:1280,height:800});await ready(s);await enterTown(s);
 assert.equal(await s.page.locator('[data-outdoor-id]').count(),18);await s.click('#buildings-tab');assert.equal(await s.page.locator('[data-outdoor-id]').count(),19);await s.click('#props-tab');pass('S2-1: town opens from generated data with 37 actual-art outdoor thumbnails');
 await s.click('#overview');await frames(s.page);const full=await s.page.evaluate(()=>{const app=window.__worldEditor,c=document.querySelector('#scene'),w=document.querySelector('#workspace'),r=c.getBoundingClientRect(),box=w.getBoundingClientRect();return{overview:app.overview,width:c.width,height:c.height,inside:r.x>=box.x-1&&r.y>=box.y-1&&r.right<=box.right+1&&r.bottom<=box.bottom+1,chunks:app.renderer.stats.chunksDrawn};});
 assert.equal(full.overview,true);assert.ok(full.width>=2048&&full.height>=1280&&full.inside&&full.chunks>0);await s.page.screenshot({path:path.join(output,'desktop-town-overview.png')});await s.click('#zoom-in');await frames(s.page);pass('whole-town view keeps the game Renderer and maps its full canvas into the workspace');
 const beforeTree=await object(s.page,treeId);assert.deepEqual([beforeTree.x,beforeTree.y],[15,34]);await drag(s,treeId,17,34);assert.equal((await object(s.page,treeId)).id,treeId);
 let expected=await doc(s.page);const treeTargets=await save(s,[town]);assert.match(treeTargets[0],/新しく作る/);s=await restart(s,expected);pass('S2-2: tree moves two tiles, saves and reloads with its stable ID');
 await s.page.goto(`${origin}/`);await s.page.waitForFunction(()=>!!window.__slg?.game);assert.equal(await s.page.evaluate(id=>window.__slg.game.area.objects.find(o=>o.id===id).x,treeId),17);await ready(s);await enterTown(s);pass('normal game uses the saved outdoor tree');
 const beforeShop=await doc(s.page);await drag(s,shopId,50,47);let moved=await doc(s.page);assert.equal(moved.portals.find(p=>p.id==='konbini-enter').from.x,53);assert.equal(moved.portals.find(p=>p.id==='konbini-exit').to.x,53);
 await s.click('#undo');assert.deepEqual(await doc(s.page),beforeShop);await s.click('#redo');assert.deepEqual(await doc(s.page),moved);pass('S2-3: one building drag moves entry/return and one undo restores the entire group');
 await s.page.screenshot({path:path.join(output,'desktop-building-linked.png')});
 await roomRoundtrip(s,shopId,true);pass('S2-10: double-click room entry and return preserve building selection, view and unsaved history');
 await visitShop(s,53);assert.deepEqual(await doc(s.page),moved);pass('S2-4: trial walk enters the shop and returns to the moved door front');
 expected=await doc(s.page);const shopTargets=await save(s,[town,'shop-konbini-interior']);assert.ok(shopTargets.some(t=>t.includes('shop-konbini-interior')&&t.includes('新しく作る')));s=await restart(s,expected);await enterTown(s);pass('S2-4: confirmed save writes town and shop files and reloads the complete document');
 await drag(s,houseId,32,28);moved=await doc(s.page);assert.deepEqual(moved.start,{areaId:town,x:35,y:33,facing:'down'});
 expected=moved;await save(s,[home,town]);s=await restart(s,expected);
 await s.page.goto(`${origin}/`);await s.page.waitForFunction(()=>!!window.__slg?.game);
 const newGameState=await s.page.evaluate(async()=>{const{LANDMARKS}=await import('/src/world/index.ts');const game=window.__slg.game;return{start:game.world.start,front:LANDMARKS.homeFront,player:{x:Math.floor(game.player.x/16),y:Math.floor((game.player.y-4)/16)}};});
 assert.deepEqual(newGameState.start,{areaId:town,x:35,y:33,facing:'down'});assert.deepEqual(newGameState.front,{x:35,y:33});assert.deepEqual(newGameState.player,{x:35,y:33});await s.page.screenshot({path:path.join(output,'desktop-game-new-start.png')});await ready(s);pass('S2-5: moving home south saves a matching landmark, world start and new-game position');
 await drag(s,plantId,13,9);const homePending=await doc(s.page);await enterTown(s);assert.equal((await doc(s.page)).objects.find(o=>o.id===plantId).x,13);
 await drag(s,shopId,51,47);expected=await doc(s.page);assert.equal(expected.objects.find(o=>o.id===plantId).x,13);
 await save(s,[home,'shop-konbini-interior',town]);s=await restart(s,expected);assert.notDeepEqual(expected,homePending);await enterTown(s);pass('S2-17: unsaved home and town edits share one history and save all three files together');
 await select(s,'town-station-12-59');const fixed=await doc(s.page);for(const id of ['#delete','#duplicate','#rotate'])assert.equal(await s.page.locator(id).isDisabled(),true);assert.match(await s.page.locator('#protection').innerText(),/駅/);
 await drag(s,'town-station-12-59',13,59,false);assert.deepEqual(await doc(s.page),fixed);pass('station selection explains why movement, rotation and deletion are unavailable');
 await s.click('#props-tab');const added=await place(s,'tree-green',15,34);assert.match(added,/^town-main-tree-[1-9][0-9]*$/);assert.equal((await object(s.page,added)).x,15);
 await s.click('#delete');assert.equal(await object(s.page,added),undefined);await s.click('#undo');assert.equal((await object(s.page,added)).id,added);await s.click('#redo');assert.equal(await object(s.page,added),undefined);pass('outdoor catalog placement/delete/undo/redo retain the issued ID');
 const timings=await s.page.evaluate(()=>window.__worldEditor.validationTimes);assert.ok(timings.length>0);assert.ok(timings.every(ms=>ms<=50),`Validation exceeded 50ms: ${JSON.stringify(timings)}`);console.log('VALIDATION_MS',JSON.stringify(timings));pass('S2-13: candidate derivation and whole-world validation stay within 50ms per changed tile');
 const finalDocument=await doc(s.page);assert.deepEqual(finalDocument,expected);const savedFiles=Object.fromEntries(await Promise.all((await readdir(path.join(root,directory))).filter(n=>n.endsWith('.json')).map(async name=>[name,await readFile(path.join(root,directory,name),'utf8')])));await close(s);
 for(const[name,viewport]of[['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
  const mobile=await session(viewport,true);await ready(mobile);assert.deepEqual(await doc(mobile.page),finalDocument);await enterTown(mobile);await mobile.click('#zoom-out');await mobile.click('#zoom-out');await frames(mobile.page);
  await drag(mobile,treeId,15,34);const treeChanged=await doc(mobile.page);assert.equal(treeChanged.objects.find(o=>o.id===treeId).x,15);pass(`${name} S2-2/S2-15: native two-finger navigation and one-finger two-tile tree drag`);
  await drag(mobile,shopId,50,47);const changed=await doc(mobile.page);assert.equal(changed.portals.find(p=>p.id==='konbini-enter').from.x,53);assert.equal(changed.portals.find(p=>p.id==='konbini-exit').to.x,53);
  await mobile.click('#undo');assert.deepEqual(await doc(mobile.page),treeChanged);await mobile.click('#redo');assert.deepEqual(await doc(mobile.page),changed);pass(`${name} S2-3/S2-15: touch building drag and atomic undo/redo preserve the tree edit`);
  await roomRoundtrip(mobile,shopId);await mobile.page.screenshot({path:path.join(output,`${name}-town-edited.png`)});pass(`${name} S2-10: room button and return keep the selected building and view`);
  await visitShop(mobile,53);assert.equal(await mobile.page.locator('#save').isDisabled(),true);await mobile.page.screenshot({path:path.join(output,`${name}-town-after-walk.png`)});pass(`${name}: touch trial walk uses the moved shop entry and return`);
  for(const[file,bytes]of Object.entries(savedFiles))assert.equal(await readFile(path.join(root,directory,file),'utf8'),bytes);await ready(mobile);assert.deepEqual(await doc(mobile.page),finalDocument);await close(mobile);pass(`${name}: PC-only saving and reload preserve every saved file`);
 }
 assert.deepEqual((await readdir(path.join(source,directory))).filter(n=>n.endsWith('.json')).sort(),[...original.keys()].sort());for(const[name,bytes]of original)assert.equal(await readFile(path.join(source,directory,name),'utf8'),bytes);
 pass('source layouts, existing previews and all contexts remain free of writes/errors/external attempts/downloads');console.log(`SUMMARY ${passed}/${passed} PASS`,JSON.stringify({output}));
}catch(error){console.error('FAIL',error);console.error(serverOutput);process.exitCode=1;}
finally{await browser?.close();await stop();if(!process.exitCode)await rm(temp,{recursive:true,force:true});else console.error('Failure copy preserved:',root);}
