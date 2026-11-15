/** Headless N5 four-area E2E: home, classroom, catalog store, town -> normal game & mobile touch. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(source, '..');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'slg-npc-four-e2e-')));
const root = path.join(temp, 'game');
const output = process.env.SLG_SHOTS || path.join(os.tmpdir(), 'slg-n5-shots-RosePauling');
assert.ok(path.isAbsolute(output));
await mkdir(output, { recursive: true });

const port = Number(process.env.SLG_NPC_FOUR_PORT || 5661);
assert.ok(Number.isSafeInteger(port) && port >= 5660 && port <= 5669, `Use reserved port 5660-5669, got ${port}`);
const origin = `http://127.0.0.1:${port}`;

async function sourceSnapshot() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  const hashes = {};
  for (const rel of tracked) {
    const data = await readFile(path.join(repoRoot, rel));
    hashes[rel] = createHash('sha256').update(data).digest('hex');
  }
  const areas = {};
  for (const name of (await readdir(path.join(source, 'data/world/areas'))).filter(n => n.endsWith('.json')).sort()) {
    areas[name] = await readFile(path.join(source, 'data/world/areas', name), 'utf8');
  }
  return { hashes, areas };
}

async function runPreflight() {
  const vite = await createViteServer({
    root: source,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: false },
  });
  try {
    const { buildWorld, validateWorld, LANDMARKS } = await vite.ssrLoadModule('/src/world/index.ts');
    const { STORE_CONTACTS } = await vite.ssrLoadModule('/src/data/stores.ts');
    const { validateStoreContacts } = await vite.ssrLoadModule('/src/stores/validate.ts');
    const { clerkVisit } = await vite.ssrLoadModule('/src/shop/clerk-visit.ts');
    const { WorldEditorModel, HOME_AREA } = await vite.ssrLoadModule('/src/world-editor/model.ts');
    const { isEditableArea } = await vite.ssrLoadModule('/src/world-editor/world-policy.ts');
    const { areaNpcs, npcReferences } = await vite.ssrLoadModule('/src/world-editor/npc.ts');

    const world = buildWorld();
    const worldProblems = validateWorld(world);
    const storeProblems = validateStoreContacts(world, STORE_CONTACTS);
    assert.deepEqual(worldProblems, []);
    assert.deepEqual(storeProblems, []);

    const model = new WorldEditorModel(world);
    const editableAreas = model.initial.areas.filter(a => isEditableArea(model.initial, a.id));
    assert.equal(editableAreas.length, 10);
    const totalNpcs = editableAreas.reduce((sum, a) => sum + areaNpcs(model.initial, a.id).length, 0);
    assert.equal(totalNpcs, 16);

    const contacts = [];
    for (const contact of STORE_CONTACTS) {
      const area = model.initial.areas.find(a => a.id === contact.interiorAreaId);
      const clerk = areaNpcs(model.initial, contact.interiorAreaId).find(n => n.eventKey === contact.clerkEventKey);
      assert.ok(area && clerk);
      const visit = clerkVisit(area, clerk);
      const refs = npcReferences(clerk, model.initial);
      const checkModel = new WorldEditorModel(world);
      const candidate = checkModel.npcCandidate({ ...clerk, name: `${clerk.name}・検証` });
      const issues = checkModel.issues(candidate);
      assert.deepEqual(issues, [], `Preflight refusal in ${contact.storeId}`);
      contacts.push({
        storeId: contact.storeId,
        interiorAreaId: contact.interiorAreaId,
        entrancePortalId: contact.entrancePortalId,
        clerkId: clerk.id,
        visitAvailable: !!visit,
        roleKind: refs.kind,
      });
    }
    const shop = contacts.find(c => c.visitAvailable);
    assert.ok(shop, 'Catalog-backed shop contact must exist');
    return { shop, HOME_AREA, LANDMARKS, editableCount: editableAreas.length, totalNpcs, contacts };
  } finally {
    await vite.close();
  }
}

const sourceBefore = await sourceSnapshot();
const preflight = await runPreflight();
console.log('PREFLIGHT', JSON.stringify(preflight));

await cp(source, root, {
  recursive: true,
  filter: file => !['node_modules', 'dist'].some(name => {
    const p = path.relative(source, file);
    return p === name || p.startsWith(`${name}/`);
  }),
});
await symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'dir');

let server, serverOutput = '', browser, passed = 0;
const pass = (name, detail) => { passed++; console.log('PASS', name, detail ? JSON.stringify(detail) : ''); };

async function start() {
  serverOutput = '';
  server = spawn(
    process.execPath,
    [path.join(source, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', b => { serverOutput += b; });
  server.stderr.on('data', b => { serverOutput += b; });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if (serverOutput.includes('Local:') && (await fetch(`${origin}/world-editor.html`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server timeout: ${serverOutput}`);
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const current = server;
  const done = new Promise(resolve => current.once('exit', resolve));
  current.kill('SIGTERM');
  await done;
}

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const documentOf = page => page.evaluate(() => window.__worldEditor.model.document);
const npcOf = (page, id, area) => page.evaluate(({ id, area }) => {
  const app = window.__worldEditor;
  return app.model.npc(id, undefined, area ?? app.activeArea);
}, { id, area });

async function readyEditor(page) {
  await page.goto(`${origin}/world-editor.html`);
  await page.waitForFunction(() => window.__worldEditor?.renderer.stats.chunksDrawn > 0);
  await frames(page);
}

async function readyGame(page) {
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
  await frames(page);
}

async function session(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, acceptDownloads: false, serviceWorkers: 'block' });
  const errors = [], blocked = [];
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin === origin || u.protocol === 'data:') return route.continue();
    blocked.push(u.href);
    return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    if (new URL(socket.url()).origin === origin.replace('http', 'ws')) socket.connectToServer();
    else { blocked.push(socket.url()); void socket.close(); }
  });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(String(err)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('download', dl => { errors.push('Unexpected download'); void dl.cancel(); });
  context.on('page', popup => { if (popup !== page) errors.push('Unexpected popup'); });
  page.on('dialog', d => { errors.push('Unexpected dialog'); void d.dismiss(); });
  const cdp = touch ? await context.newCDPSession(page) : undefined;
  const fingers = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 2, radiusY: 2 })),
  });
  const click = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
  return { context, page, errors, blocked, cdp, fingers, click, touch };
}

async function closeSession(s) {
  await s.cdp?.detach();
  await s.context.close();
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.blocked, []);
}

async function openArea(s, areaId) {
  await s.page.locator('#area-select').selectOption(areaId);
  await frames(s.page);
  assert.equal(await s.page.evaluate(() => window.__worldEditor.activeArea), areaId);
}

async function selectFromList(s, id) {
  const pressed = await s.page.locator('#npc-list-toggle').getAttribute('aria-expanded');
  if (pressed !== 'true') await s.click('#npc-list-toggle');
  await s.click(`[data-npc-list-id="${id}"]`);
  await frames(s.page);
  if (s.touch) await s.click('#npc-list-toggle');
}

async function point(page, id) {
  return page.evaluate(async id => {
    const app = window.__worldEditor, npc = app.model.npc(id, undefined, app.activeArea);
    if (!npc) throw new Error(`Missing NPC ${id} in ${app.activeArea}`);
    const { characterSprite } = await import('/src/render/sprites.ts');
    const { feetAtTile } = await import('/src/core/coords.ts');
    const { hitItem } = await import('/src/world-editor/hit-test.ts');
    const sprite = characterSprite(npc.sprite, npc.facing, 0);
    const pixels = sprite.canvas.getContext('2d').getImageData(0, 0, sprite.canvas.width, sprite.canvas.height).data;
    const feet = feetAtTile(npc.x, npc.y), rect = document.querySelector('#workspace').getBoundingClientRect();
    const area = app.model.runtime().areas.get(npc.areaId);
    let best;
    for (let y = 0; y < sprite.canvas.height; y++) for (let x = 0; x < sprite.canvas.width; x++) {
      if (!pixels[(y * sprite.canvas.width + x) * 4 + 3]) continue;
      const wx = feet.x + sprite.ox + x + .5, wy = feet.y + sprite.oy + y + .5;
      const p = app.toScreen(wx, wy), sx = p.x + rect.x, sy = p.y + rect.y;
      if (p.x < 0 || p.y < 0 || p.x >= rect.width || p.y >= rect.height ||
          hitItem(area, wx, wy)?.id !== id || document.elementFromPoint(sx, sy)?.closest('aside')) continue;
      const score = Math.abs(x - sprite.canvas.width / 2) + Math.abs(y - (sprite.canvas.height - 7));
      if (!best || score < best.score) best = { x: sx, y: sy, score };
    }
    if (!best) throw new Error(`NPC artwork is not exposed for interaction: ${id}`);
    return { ...best, npc };
  }, id);
}

async function selectArtwork(s, id) {
  const p = await point(s.page, id);
  if (s.touch) await s.page.touchscreen.tap(p.x, p.y);
  else await s.page.mouse.click(p.x, p.y);
  await s.page.locator('#npc-properties').waitFor({ state: 'visible' });
  assert.equal(await s.page.locator('#object-id').textContent(), `ID ${id}（変更できません）`);
  assert.equal(await s.page.locator('#npc-name').inputValue(), p.npc.name);
}

async function moveNpc(s, id, x, y) {
  const p = await point(s.page, id);
  const delta = await s.page.evaluate(({ dx, dy }) => {
    const a = window.__worldEditor.toScreen(0, 0), b = window.__worldEditor.toScreen(dx * 16, dy * 16);
    return { x: b.x - a.x, y: b.y - a.y };
  }, { dx: x - p.npc.x, dy: y - p.npc.y });
  if (s.touch) {
    await s.fingers('touchStart', [p]);
    for (let n = 1; n <= 8; n++) {
      await s.fingers('touchMove', [{ x: p.x + delta.x * n / 8, y: p.y + delta.y * n / 8 }]);
      await s.page.waitForTimeout(20);
    }
    await s.fingers('touchEnd', []);
  } else {
    await s.page.mouse.move(p.x, p.y);
    await s.page.mouse.down();
    await s.page.mouse.move(p.x + delta.x, p.y + delta.y, { steps: 8 });
    await s.page.mouse.up();
  }
  await s.page.waitForFunction(({ id, x, y }) => {
    const app = window.__worldEditor, npc = app.model.npc(id, undefined, app.activeArea);
    return npc?.x === x && npc?.y === y;
  }, { id, x, y });
}

async function editForm(s, { name, lines, sprite }) {
  await s.page.locator('#npc-name').fill(name);
  await s.page.locator('#npc-lines').fill(lines.join('\n'));
  if (sprite) await s.click(`[data-npc-sprite="${sprite}"]`);
  await s.click('#npc-apply');
  assert.equal(await s.page.locator('#npc-apply').isDisabled(), true);
}

async function placeNpc(s, sprite, x, y) {
  await s.click('#people-tab');
  await s.click(`[data-person-id="${sprite}"]`);
  const draft = await s.page.evaluate(() => window.__worldEditor.npcGhost.npc);
  await s.page.evaluate(({ x, y }) => {
    const app = window.__worldEditor;
    app.camera.centerX = x * 16 + 8;
    app.camera.centerY = y * 16 + 8;
  }, { x, y });
  await frames(s.page);
  const pt = await s.page.evaluate(({ x, y }) => {
    const p = window.__worldEditor.toScreen(x * 16 + 8, y * 16 + 8);
    const r = document.querySelector('#workspace').getBoundingClientRect();
    return { x: p.x + r.x, y: p.y + r.y };
  }, { x, y });
  await s.page.mouse.move(pt.x, pt.y);
  await s.page.mouse.down();
  await s.page.mouse.up();
  await frames(s.page);
  return draft;
}

async function reachableMoveCell(page, id) {
  return page.evaluate(async id => {
    const app = window.__worldEditor, doc = app.model.document, npc = app.model.npc(id, doc, app.activeArea);
    const area = doc.areas.find(a => a.id === npc.areaId);
    const { findPath } = await import('/src/world/index.ts');
    const portal = doc.portals.find(p => p.to.areaId === area.id);
    const from = portal ? { x: portal.to.x, y: portal.to.y } : { x: npc.x, y: npc.y };
    for (let distance = 1; distance <= 3; distance++) {
      for (const [dx, dy] of [[0, distance], [distance, 0], [0, -distance], [-distance, 0]]) {
        const x = npc.x + dx, y = npc.y + dy;
        if (x < 1 || y < 1 || x >= area.width - 1 || y >= area.height - 1) continue;
        const cand = app.model.npcCandidate({ ...npc, x, y });
        if (app.model.issues(cand).length) continue;
        const rt = app.model.runtime(cand, [area.id]).areas.get(area.id);
        const adjacent = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([ax, ay]) => findPath(rt, from, { x: x + ax, y: y + ay }));
        if (adjacent) return { x, y };
      }
    }
    throw new Error(`No reachable move cell for ${id} in ${area.id}`);
  }, id);
}

async function freeAddCell(page, areaId, anchorId) {
  return page.evaluate(async ({ areaId, anchorId }) => {
    const app = window.__worldEditor, draft = app.model.createNpc('friend', areaId);
    const anchor = app.model.npc(anchorId, undefined, areaId);
    const area = app.model.document.areas.find(a => a.id === areaId);
    for (let radius = 2; radius <= 6; radius++) {
      for (const [dx, dy] of [[radius, 0], [0, radius], [-radius, 0], [0, -radius], [radius, -1], [-radius, 1]]) {
        const x = anchor.x + dx, y = anchor.y + dy;
        if (x < 1 || y < 1 || x >= area.width - 1 || y >= area.height - 1) continue;
        if (!app.model.issues(app.model.npcCandidate({ ...draft, x, y }, true)).length) return { x, y };
      }
    }
    throw new Error(`No free add cell near ${anchorId} in ${areaId}`);
  }, { areaId, anchorId });
}

async function gameWalk(page, target) {
  const route = await page.evaluate(async target => {
    const game = window.__slg.game, { findPath } = await import('/src/world/index.ts');
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    return findPath(game.area, from, target);
  }, target);
  assert.ok(route, `No walking route in game to ${JSON.stringify(target)}`);
  for (const tile of route) {
    for (const axis of ['x', 'y']) {
      const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14);
      let reached = false;
      for (let step = 0; step < 50; step++) {
        const player = await page.evaluate(() => ({ ...window.__slg.game.player }));
        if (target.areaId && player.areaId !== target.areaId) return;
        const delta = value - player[axis];
        if (Math.abs(delta) <= 2) { reached = true; break; }
        const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
        const fast = Math.abs(delta) > 12;
        if (fast) await page.keyboard.down('ShiftLeft');
        await page.keyboard.press(key, { delay: Math.min(70, Math.max(18, (Math.abs(delta) - 1) / (fast ? 128 : 72) * 1000)) });
        if (fast) await page.keyboard.up('ShiftLeft');
      }
      assert.ok(reached, `Game walk stalled before ${JSON.stringify({ tile, axis, target })}`);
    }
  }
}

async function gameEnterPortal(page, portalId, expectedDestAreaId) {
  const target = await page.evaluate(async portalId => {
    const game = window.__slg.game, { findPath } = await import('/src/world/index.ts');
    const portal = game.area.def.portals.find(p => p.id === portalId);
    if (!portal) throw new Error(`Missing portal ${portalId} in ${game.player.areaId}`);
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (let dy = 0; dy < (portal.from.h ?? 1); dy++) {
      for (let dx = 0; dx < (portal.from.w ?? 1); dx++) {
        const tile = { x: portal.from.x + dx, y: portal.from.y + dy, areaId: game.player.areaId };
        if (findPath(game.area, from, tile)) return tile;
      }
    }
    return null;
  }, portalId);
  assert.ok(target, `Portal ${portalId} unreachable`);
  await gameWalk(page, target);
  await page.waitForFunction(expected => window.__slg?.game?.player.areaId === expected && !window.__slg.renderer.stats.fading, expectedDestAreaId);
  await frames(page);
}

async function gameTalkToNpc(page, npcId) {
  const stepTarget = await page.evaluate(async npcId => {
    const game = window.__slg.game, npc = game.area.interactions.find(i => i.id === npcId);
    if (!npc) throw new Error(`Missing NPC ${npcId} in ${game.player.areaId}`);
    const { findPath } = await import('/src/world/index.ts');
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (const [dx, dy, key] of [[0, 1, 'ArrowUp'], [-1, 0, 'ArrowRight'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft']]) {
      const tile = { x: npc.x + dx, y: npc.y + dy, areaId: game.player.areaId };
      if (findPath(game.area, from, tile)) return { ...tile, key };
    }
    return null;
  }, npcId);
  assert.ok(stepTarget, `No adjacent tile for ${npcId}`);
  await gameWalk(page, stepTarget);
  await page.keyboard.press(stepTarget.key, { delay: 35 });
  assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.id), npcId);
  await page.keyboard.press('KeyZ');
}

async function saveViaUi(s, expectedAreaIds) {
  assert.equal(await s.page.locator('#save').isDisabled(), false);
  await s.click('#save');
  await s.page.locator('#save-confirm').waitFor({ state: 'visible' });
  const targetText = await s.page.locator('#save-target').innerText();
  for (const id of expectedAreaIds) assert.match(targetText, new RegExp(`data/world/areas/${id}\\.json`));
  if (expectedAreaIds.length > 1) await s.page.screenshot({ path: path.join(output, 'n5-save-confirm.png') });
  await s.click('#save-commit');
  await s.page.locator('#save-confirm').waitFor({ state: 'hidden' });
  await s.page.waitForFunction(() => window.__worldEditor?.model.dirty === 0);
}

try {
  await start();
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-background-networking', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });

  // --- Phase A: N2 role checks + 4 representative areas edits/adds/Undo/Redo + single multi-area save (N5.1, N5.2) ---
  let s = await session({ width: 1280, height: 800 });
  await readyEditor(s.page);

  // Verify N2 & N3.3 roles across real examples in UI
  await openArea(s, 'shop-bakery-interior');
  await selectFromList(s, 'bakery-indoor-clerk');
  assert.equal(await s.page.locator('#npc-role').getAttribute('data-role'), 'clerk-no-catalog');
  assert.match(await s.page.locator('#npc-event-note').innerText(), /通常の会話枠/);
  await openArea(s, 'town-main');
  const candyBadges = await s.page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-npc-list-id="candy-shopkeeper"] .npc-badge')).map(e => e.textContent),
  );
  assert.ok(!candyBadges.includes('店員'), 'Outdoor candy-shopkeeper must not carry clerk badge (N3.3)');
  await selectFromList(s, 'candy-shopkeeper');
  assert.equal(await s.page.locator('#npc-role').getAttribute('data-role'), 'dialogue');

  const shop = preflight.shop;
  const targets = [
    {
      areaId: 'home-family-interior',
      originalId: 'home-mother',
      edit: { name: '家のおかあさん・改', sprite: 'teacher', lines: ['家で編集した会話です。', '二行目も保ちます。'] },
      add: { name: '家の追加人物', sprite: 'friend', lines: ['家に追加した人です。'] },
      expectedRole: 'life-events',
    },
    {
      areaId: 'school-classroom-interior',
      originalId: 'school-teacher',
      edit: { name: '教室のせんせい・改', sprite: 'guard', lines: ['教室で編集した会話です。', '授業のはじまりです。'] },
      add: { name: '教室の追加人物', sprite: 'cat', lines: ['教室に追加した人です。'] },
      expectedRole: 'dialogue',
    },
    {
      areaId: shop.interiorAreaId,
      originalId: shop.clerkId,
      edit: { name: 'コンビニ店員・改', sprite: 'shopkeeper', lines: ['いらっしゃい、編集した挨拶です！', '店内の二行目メモです。'] },
      add: { name: '店内の追加お客さん', sprite: 'friend', lines: ['店内に追加した人です。'] },
      expectedRole: 'shop-clerk',
    },
    {
      areaId: 'town-main',
      originalId: 'neighbor-grandma',
      edit: { name: '町のおばあさん・改', sprite: 'clerk', lines: ['町で編集した会話です。', '散歩が気持ちいいね。'] },
      add: { name: '町の追加人物', sprite: 'staff', lines: ['町に追加した人です。'] },
      expectedRole: 'dialogue',
    },
  ];

  const editedRecords = [];
  for (const spec of targets) {
    await openArea(s, spec.areaId);
    await selectFromList(s, spec.originalId);
    await s.page.screenshot({ path: path.join(output, `n5-before-${spec.areaId}.png`) });

    const roleAttr = await s.page.locator('#npc-role').getAttribute('data-role');
    assert.equal(roleAttr, spec.expectedRole, `Unexpected role for ${spec.originalId}`);
    if (spec.expectedRole === 'shop-clerk') {
      const note = await s.page.locator('#npc-event-note').innerText();
      assert.match(note, /最初の文/);
      assert.doesNotMatch(note, /台詞はゲームに出ない|会話はゲームに出ない/);
    }

    const beforeOriginal = await npcOf(s.page, spec.originalId, spec.areaId);
    await selectArtwork(s, spec.originalId);
    const dest = await reachableMoveCell(s.page, spec.originalId);
    await moveNpc(s, spec.originalId, dest.x, dest.y);
    await s.click('#rotate');
    await editForm(s, spec.edit);

    const actualOriginal = await npcOf(s.page, spec.originalId, spec.areaId);
    for (const k of ['id', 'areaId', 'eventKey', 'kind', 'solid', 'w', 'h']) {
      assert.deepEqual(actualOriginal[k], beforeOriginal[k], `${spec.originalId}.${k}`);
    }
    assert.notDeepEqual([actualOriginal.x, actualOriginal.y], [beforeOriginal.x, beforeOriginal.y]);
    assert.notEqual(actualOriginal.facing, beforeOriginal.facing);
    assert.equal(actualOriginal.name, spec.edit.name);
    assert.deepEqual(actualOriginal.lines, spec.edit.lines);
    assert.equal(actualOriginal.sprite, spec.edit.sprite);

    const addCell = await freeAddCell(s.page, spec.areaId, spec.originalId);
    const placedDraft = await placeNpc(s, spec.add.sprite, addCell.x, addCell.y);
    assert.match(placedDraft.id, new RegExp(`^${spec.areaId}-npc-[1-9][0-9]*$`));
    assert.equal(placedDraft.eventKey, `npc.${placedDraft.id}`);
    await editForm(s, spec.add);
    const withAddedDoc = await documentOf(s.page);
    const actualAdded = await npcOf(s.page, placedDraft.id, spec.areaId);

    // Placed NPC with clerk sprite must NOT carry 店員 badge (N2.4)
    if (actualAdded.sprite === 'clerk') {
      const badges = await s.page.evaluate(id =>
        Array.from(document.querySelectorAll(`[data-npc-list-id="${id}"] .npc-badge`)).map(e => e.textContent), actualAdded.id);
      assert.ok(!badges.includes('店員'));
    }

    await s.click('#undo');
    assert.equal((await npcOf(s.page, placedDraft.id, spec.areaId)).name, placedDraft.name);
    await s.click('#undo');
    assert.equal(await npcOf(s.page, placedDraft.id, spec.areaId), undefined);
    await s.click('#redo');
    assert.equal((await npcOf(s.page, placedDraft.id, spec.areaId)).name, placedDraft.name);
    await s.click('#redo');
    assert.deepEqual(await documentOf(s.page), withAddedDoc);

    await selectFromList(s, spec.originalId);
    await s.page.screenshot({ path: path.join(output, `n5-after-${spec.areaId}.png`) });
    editedRecords.push({ areaId: spec.areaId, original: actualOriginal, added: actualAdded });
  }

  const expectedMultiDoc = await documentOf(s.page);
  await saveViaUi(s, targets.map(t => t.areaId));
  for (const record of editedRecords) {
    const layout = JSON.parse(await readFile(path.join(root, `data/world/areas/${record.areaId}.json`), 'utf8'));
    for (const npc of [record.original, record.added]) {
      const { areaId: _, ...raw } = npc;
      assert.deepEqual(layout.interactions.find(i => i.id === npc.id), raw);
    }
  }
  pass('N5.2', { savedAreas: targets.map(t => t.areaId) });

  // Server restart & fresh editor verification
  await closeSession(s);
  await stop();
  await start();
  s = await session({ width: 1280, height: 800 });
  await readyEditor(s.page);
  assert.deepEqual(await documentOf(s.page), expectedMultiDoc);
  await closeSession(s);
  pass('N5.2-restart', { verifiedDocumentParity: true });

  // --- Phase B: Normal Game (/) walk -> enter -> talk/shop -> exit across all 4 areas (N5.1, N5.3) ---
  const g = await session({ width: 1280, height: 800 });
  await readyGame(g.page);
  // Assert fresh normal Game World interactions match all 4 saved areas
  for (const record of editedRecords) {
    const interactions = await g.page.evaluate(areaId => window.__slg.game.world.areas.get(areaId).interactions, record.areaId);
    for (const npc of [record.original, record.added]) {
      const { areaId: _, ...raw } = npc;
      assert.deepEqual(interactions.find(i => i.id === npc.id), raw);
    }
  }

  // 1) Home (home-enter -> talk edited mother -> dialog -> home-exit)
  const homeRecord = editedRecords.find(r => r.areaId === 'home-family-interior');
  await gameEnterPortal(g.page, 'home-enter', 'home-family-interior');
  await gameTalkToNpc(g.page, homeRecord.original.id);
  await g.page.locator('#dialog').waitFor({ state: 'visible' });
  assert.equal(await g.page.locator('#dialog .who').innerText(), homeRecord.original.name);
  assert.equal(await g.page.locator('#dialog .text').innerText(), homeRecord.original.lines[0]);
  await g.page.screenshot({ path: path.join(output, 'n5-game-home-dialog.png') });
  await g.page.keyboard.press('KeyZ');
  assert.equal(await g.page.locator('#dialog .text').innerText(), homeRecord.original.lines[1]);
  await g.page.keyboard.press('KeyZ');
  await g.page.locator('#dialog').waitFor({ state: 'hidden' });
  await gameEnterPortal(g.page, 'home-exit', 'town-main');

  // 2) Town (walk to moved neighbor-grandma -> talk -> dialog)
  const townRecord = editedRecords.find(r => r.areaId === 'town-main');
  await gameTalkToNpc(g.page, townRecord.original.id);
  await g.page.locator('#dialog').waitFor({ state: 'visible' });
  assert.equal(await g.page.locator('#dialog .who').innerText(), townRecord.original.name);
  assert.equal(await g.page.locator('#dialog .text').innerText(), townRecord.original.lines[0]);
  await g.page.screenshot({ path: path.join(output, 'n5-game-town-dialog.png') });
  await g.page.keyboard.press('KeyZ');
  await g.page.keyboard.press('KeyZ');
  await g.page.locator('#dialog').waitFor({ state: 'hidden' });

  // 3) Catalog-backed Shop (konbini-enter -> moved clerk -> shop panel & greeting first sentence, no dialog, exit, konbini-exit)
  const shopRecord = editedRecords.find(r => r.areaId === shop.interiorAreaId);
  const assetsBeforeShop = await g.page.evaluate(() => window.__slg.game.assets.snapshot());
  await gameEnterPortal(g.page, shop.entrancePortalId, shop.interiorAreaId);
  await gameTalkToNpc(g.page, shopRecord.original.id);
  await g.page.locator('#shop-panel[data-phase="catalog"]').waitFor({ state: 'visible' });
  assert.equal(await g.page.locator('#dialog').isVisible(), false);
  assert.equal(await g.page.evaluate(() => window.__slg.game.dialog), null);
  assert.equal(await g.page.locator('#shop-conversation .shop-speaker').innerText(), shopRecord.original.name);
  assert.equal(await g.page.locator('#shop-line').innerText(), shopRecord.original.lines[0]);
  await g.page.screenshot({ path: path.join(output, 'n5-game-konbini-shop.png') });
  await g.click('#shop-exit');
  await g.page.locator('#shop-panel').waitFor({ state: 'hidden' });
  assert.deepEqual(await g.page.evaluate(() => window.__slg.game.assets.snapshot()), assetsBeforeShop);
  await gameEnterPortal(g.page, 'konbini-exit', 'town-main');
  pass('N5.3-walk', { shopSpeaker: shopRecord.original.name, shopGreeting: shopRecord.original.lines[0] });

  // 4) Classroom (school-enter -> moved school-teacher -> dialog -> school-exit)
  const classRecord = editedRecords.find(r => r.areaId === 'school-classroom-interior');
  await gameEnterPortal(g.page, 'school-enter', 'school-classroom-interior');
  await gameTalkToNpc(g.page, classRecord.original.id);
  await g.page.locator('#dialog').waitFor({ state: 'visible' });
  assert.equal(await g.page.locator('#dialog .who').innerText(), classRecord.original.name);
  assert.equal(await g.page.locator('#dialog .text').innerText(), classRecord.original.lines[0]);
  await g.page.screenshot({ path: path.join(output, 'n5-game-classroom-dialog.png') });
  await g.page.keyboard.press('KeyZ');
  await g.page.keyboard.press('KeyZ');
  await g.page.locator('#dialog').waitFor({ state: 'hidden' });
  await gameEnterPortal(g.page, 'school-exit', 'town-main');

  await closeSession(g);
  pass('N5.1', { verifiedAllFourAreasInNormalGame: true });

  // --- Phase C: Clerk protection refusal + Town landmark/portal/arrival refusals + saved placed NPC deletion (N5.3, N5.4) ---
  s = await session({ width: 1280, height: 800 });
  await readyEditor(s.page);

  await openArea(s, shop.interiorAreaId);
  await selectFromList(s, shop.clerkId);
  const clerkBefore = await documentOf(s.page);
  assert.equal(await s.page.locator('#delete').isDisabled(), true);
  assert.match(await s.page.locator('#protection').innerText(), /消せません/);
  await s.page.locator('#workspace').focus();
  await s.page.keyboard.press('Delete');
  assert.deepEqual(await documentOf(s.page), clerkBefore);
  pass('N5.3-protection', { clerkId: shop.clerkId });

  await openArea(s, 'town-main');
  await selectFromList(s, 'neighbor-grandma');
  const refusalTargets = [
    ['schoolGate', preflight.LANDMARKS.schoolGate],
    ['stationFront', preflight.LANDMARKS.stationFront],
    ['parkPlaza', preflight.LANDMARKS.parkPlaza],
    ['shoppingStreet', preflight.LANDMARKS.shoppingStreet],
    ['home-enter-portal', { x: 35, y: 31 }],
    ['homeFront-arrival', preflight.LANDMARKS.homeFront],
  ];
  for (const [label, pointTarget] of refusalTargets) {
    const beforeDoc = await documentOf(s.page);
    const beforeHistory = await s.page.evaluate(() => ({
      canUndo: window.__worldEditor.model.session.canUndo,
      canRedo: window.__worldEditor.model.session.canRedo,
      dirty: window.__worldEditor.model.dirty,
    }));
    await placeNpc(s, 'friend', pointTarget.x, pointTarget.y);
    const reason = await s.page.locator('#status').innerText();
    assert.ok(reason.length > 0, `Expected UI refusal status for ${label}`);
    assert.deepEqual(await documentOf(s.page), beforeDoc);
    assert.deepEqual(await s.page.evaluate(() => ({
      canUndo: window.__worldEditor.model.session.canUndo,
      canRedo: window.__worldEditor.model.session.canRedo,
      dirty: window.__worldEditor.model.dirty,
    })), beforeHistory);
  }
  if (await s.page.locator('#stop-placement').isVisible()) await s.click('#stop-placement');

  await selectFromList(s, townRecord.added.id);
  assert.equal(await s.page.locator('#delete').isDisabled(), false);
  await s.click('#delete');
  const afterTownDeleteDoc = await documentOf(s.page);
  assert.equal(await npcOf(s.page, townRecord.added.id, 'town-main'), undefined);
  assert.ok(!afterTownDeleteDoc.catalogs.eventKeys.includes(townRecord.added.eventKey));
  await saveViaUi(s, ['town-main']);

  await closeSession(s);
  await stop();
  await start();
  s = await session({ width: 1280, height: 800 });
  await readyEditor(s.page);
  const reloadedAfterDelete = await documentOf(s.page);
  assert.equal(await npcOf(s.page, townRecord.added.id, 'town-main'), undefined);
  assert.ok(!reloadedAfterDelete.catalogs.eventKeys.includes(townRecord.added.eventKey));
  const townLayout = JSON.parse(await readFile(path.join(root, 'data/world/areas/town-main.json'), 'utf8'));
  assert.ok(!townLayout.interactions.some(i => i.id === townRecord.added.id || i.eventKey === townRecord.added.eventKey));
  const desktopFinalDoc = await documentOf(s.page);
  await closeSession(s);
  pass('N5.4', { removedNpc: townRecord.added.id, removedKey: townRecord.added.eventKey });

  // --- Phase D: Touch portrait & landscape edits in non-home classroom area with save disabled (N5.5) ---
  const classDiskBefore = await readFile(path.join(root, 'data/world/areas/school-classroom-interior.json'), 'utf8');
  for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const mobile = await session(viewport, true);
    await readyEditor(mobile.page);
    await openArea(mobile, 'school-classroom-interior');
    if (label === 'portrait') {
      await mobile.click('#npc-list-toggle');
      const overflow = await mobile.page.evaluate(() => {
        const props = document.querySelector('#properties'), list = document.querySelector('#npc-list');
        const items = Array.from(list.querySelectorAll('.npc-row')).map(b => b.getBoundingClientRect());
        return {
          propsScrollW: props.scrollWidth,
          propsClientW: props.clientWidth,
          propsRight: props.getBoundingClientRect().right,
          maxItemRight: Math.max(...items.map(r => r.right)),
        };
      });
      assert.ok(overflow.propsScrollW <= overflow.propsClientW, JSON.stringify(overflow));
      assert.ok(overflow.propsRight <= 390 && overflow.maxItemRight <= 390, JSON.stringify(overflow));
      await mobile.click('#npc-list-toggle');
    }

    await selectFromList(mobile, 'school-teacher');
    await mobile.click('#zoom-out');
    if (label === 'portrait') {
      const box = await mobile.page.locator('#workspace').boundingBox();
      const a = { x: box.x + 110, y: box.y + 30 }, b = { x: box.x + 170, y: box.y + 30 };
      await mobile.fingers('touchStart', [a, b]);
      await mobile.fingers('touchMove', [{ x: a.x - 45, y: a.y }, { x: b.x - 45, y: b.y }]);
      await mobile.fingers('touchEnd', []);
      await frames(mobile.page);
      // Pan teacher left of #properties drawer by real single-finger drag if covered
      const covered = await mobile.page.evaluate(async () => {
        const app = window.__worldEditor, npc = app.model.npc('school-teacher', undefined, app.activeArea);
        const p = app.toScreen(npc.x * 16 + 8, npc.y * 16 + 8), r = document.querySelector('#workspace').getBoundingClientRect();
        return !!document.elementFromPoint(p.x + r.x, p.y + r.y)?.closest('aside');
      });
      if (covered) {
        const panStart = { x: box.x + 80, y: box.y + 220 };
        await mobile.fingers('touchStart', [panStart]);
        await mobile.fingers('touchMove', [{ x: panStart.x - 95, y: panStart.y }]);
        await mobile.fingers('touchEnd', []);
        await frames(mobile.page);
      }
    }

    const touchBefore = await npcOf(mobile.page, 'school-teacher', 'school-classroom-interior');
    const moveDest = await reachableMoveCell(mobile.page, 'school-teacher');
    await moveNpc(mobile, 'school-teacher', moveDest.x, moveDest.y);
    await mobile.click('#rotate');
    await editForm(mobile, { name: `教室${label}`, lines: [`${label}タッチの会話です。`], sprite: 'teacher' });
    const touchAfter = await npcOf(mobile.page, 'school-teacher', 'school-classroom-interior');
    assert.notDeepEqual([touchAfter.x, touchAfter.y], [touchBefore.x, touchBefore.y]);
    assert.deepEqual(touchAfter.lines, [`${label}タッチの会話です。`]);
    assert.equal(await mobile.page.locator('#save').isDisabled(), true);
    await mobile.page.screenshot({ path: path.join(output, `n5-touch-${label}.png`) });

    assert.equal(await readFile(path.join(root, 'data/world/areas/school-classroom-interior.json'), 'utf8'), classDiskBefore);
    await readyEditor(mobile.page);
    assert.deepEqual(await documentOf(mobile.page), desktopFinalDoc);
    assert.equal(await mobile.page.locator('#save').isDisabled(), true);
    await closeSession(mobile);
    pass(`N5.5-${label}`, { realTouch: true, moved: true, linesChanged: true, saveDisabled: true });
  }

  // --- Source zero diff verification (N5.6) ---
  const sourceAfter = await sourceSnapshot();
  assert.deepEqual(sourceAfter, sourceBefore);
  pass('N5.6', { sourceFilesUnchanged: Object.keys(sourceBefore.hashes).length });
  console.log(`SUMMARY ${passed}/${passed} PASS`, JSON.stringify({ output }));
} catch (error) {
  console.error('FAIL', error);
  console.error(serverOutput);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  if (!process.exitCode) await rm(temp, { recursive: true, force: true });
  else console.error('Failure copy preserved:', root);
}
