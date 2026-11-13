import assert from 'node:assert/strict';

const target = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
assert.ok(['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Use a loopback game server');
assert.equal(target.search, '', 'Store interiors use the normal game, without review fixtures');
export const STORE_URL = target.href;
export const STORE_VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
];
export const state = page => page.evaluate(() => ({ ...window.__slg.game.player }));
export const snapshot = page => page.evaluate(() => window.__slg.game.serialize());
export const lastPortal = page => page.evaluate(() => window.__storePortalLandings.at(-1));
const conversationBaselines = new WeakMap();

export async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
  await page.locator('#view').focus();
  await page.evaluate(() => {
    if (window.__storePortalLandings) return;
    window.__storePortalLandings = [];
    window.__slg.game.on(event => {
      if (event.type === 'portal') window.__storePortalLandings.push({ ...event, player: { ...window.__slg.game.player } });
    });
  });
}

export async function openStoreSession(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch, acceptDownloads: false, serviceWorkers: 'block' });
  const errors = [], blocked = [], downloads = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin || url.protocol === 'data:') return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    if (new URL(socket.url()).origin === target.origin.replace(/^http/, 'ws')) socket.connectToServer();
    else { blocked.push(new URL(socket.url()).origin); void socket.close(); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('download', download => { downloads.push(download.suggestedFilename()); void download.cancel(); });
  page.setDefaultTimeout(10000);
  await page.goto(STORE_URL); await ready(page);
  if (viewport.touch) await page.evaluate(() => {
    if (!document.querySelector('#touch').classList.contains('on')) document.querySelector('#btn-touch').click();
  });
  return { context, page, errors, blocked, downloads };
}

/** Reads the actual running World. No test-world assembly, seeding or teleporting. */
export async function connections(page) {
  const result = await page.evaluate(async () => {
    const { STORE_CONTACTS } = await import('/src/data/stores.ts');
    const { validateStoreContacts } = await import('/src/stores/validate.ts');
    const { validateWorld } = await import('/src/world/index.ts');
    const world = window.__slg.game.world;
    // The integrated World reaches its second town by confirmed train travel, not a walking portal.
    const worldProblems = world.areas.has('town-neighbor')
      ? validateWorld(world, { railLinks: (await import('/src/travel/network.ts')).TRAIN_NETWORK.railLinks() })
      : validateWorld(world);
    return { problems: validateStoreContacts(world, STORE_CONTACTS), worldProblems,
      stores: STORE_CONTACTS.map(store => {
        const outdoor = [...world.areas.values()].find(area => area.def.portals.some(portal => portal.id === store.entrancePortalId));
        return { ...store, outdoorId: outdoor?.def.id, entrance: outdoor?.def.portals.find(portal => portal.id === store.entrancePortalId),
          name: world.facilities.get(store.storeId)?.name, interior: world.facilities.get(store.storeId)?.interior };
      }) };
  });
  assert.deepEqual(result.problems, []); assert.deepEqual(result.worldProblems, []);
  assert.deepEqual(result.stores.map(store => store.storeId).sort(),
    ['bakery', 'bookstore', 'cafe', 'candy', 'greengrocer', 'konbini', 'pharmacy'].map(id => `shop-${id}`).sort());
  for (const store of result.stores) assert.equal(store.interior, 'full');
  return result.stores;
}

/** Real walking at normal speed; observations never assign player coordinates or replace game methods. */
export async function walkTo(page, targetTile) {
  const route = await page.evaluate(async targetTile => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, targetTile);
  }, targetTile);
  assert.ok(route, `No walking route to ${JSON.stringify(targetTile)}`);
  for (const tile of route) for (const axis of ['x', 'y']) {
    const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14), before = await state(page), delta = value - before[axis];
    if (Math.abs(delta) < 4) continue;
    const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ axis, value, sign, areaId }) => {
        const player = window.__slg.game.player;
        return player.areaId !== areaId || (player[axis] - value) * sign >= -4;
      }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 4000 });
    } finally { await page.keyboard.up(key); }
    if ((await state(page)).areaId !== before.areaId) {
      await page.waitForFunction(() => !window.__slg.renderer.stats.fading); return;
    }
    const after = await state(page);
    const actualTile = Math.floor((after[axis] - (axis === 'y' ? 4 : 0)) / 16);
    assert.equal(actualTile, tile[axis], `Walk overshot ${axis} waypoint: ${JSON.stringify({ tile, after })}`);
  }
}

export async function approach(page, eventKey) {
  const found = await page.evaluate(async eventKey => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game, item = game.area.interactions.find(item => item.eventKey === eventKey);
    if (!item) return null;
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (let dy = 0; dy < (item.h ?? 1); dy++) for (let dx = 0; dx < (item.w ?? 1); dx++) {
      for (const [ox, oy, facing, key] of [[0, 1, 'up', 'ArrowUp'], [-1, 0, 'right', 'ArrowRight'],
        [0, -1, 'down', 'ArrowDown'], [1, 0, 'left', 'ArrowLeft']]) {
        const tile = { x: item.x + dx + ox, y: item.y + dy + oy };
        if (findPath(game.area, from, tile)) return { ...tile, facing, key, item };
      }
    }
  }, eventKey);
  assert.ok(found, `Unreachable interaction: ${eventKey}`);
  await walkTo(page, found);
  if ((await state(page)).facing !== found.facing) {
    await page.keyboard.down(found.key);
    try { await page.waitForFunction(facing => window.__slg.game.player.facing === facing, found.facing, { polling: 'raf' }); }
    finally { await page.keyboard.up(found.key); }
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.eventKey), eventKey);
  return found;
}

export async function talk(page, touch = false) {
  const before = await state(page), saved = await snapshot(page);
  const item = await page.evaluate(() => window.__slg.game.facingInteraction());
  assert.ok(item);
  const expectsShop = await page.evaluate(async () => {
    if (!document.querySelector('#shop-panel')) return false; // The original #33 map branch has no shop UI.
    const { STORE_CONTACTS } = await import('/src/data/stores.ts');
    const game = window.__slg.game, target = game.facingInteraction();
    const store = game.area.def.kind === 'indoor' && target?.kind === 'npc' && STORE_CONTACTS.find(store =>
      store.interiorAreaId === game.area.def.id && store.clerkEventKey === target.eventKey);
    if (!store) return false; // Shelves and unrelated NPCs keep ordinary conversation.
    const { SHOP_CATALOGS } = await import('/src/data/shop-catalogs.ts');
    if (!SHOP_CATALOGS.some(catalog => catalog.id === store.catalogId)) throw new Error(`Missing clerk catalogue: ${store.catalogId}`);
    return true;
  });
  conversationBaselines.set(page, { player: before, assets: saved.assets, expectsShop });
  if (touch) await page.locator('#touch button[data-act]').tap(); else await page.keyboard.press('KeyZ');
  const root = page.locator(expectsShop ? '#shop-panel' : '#dialog');
  await root.waitFor({ state: 'visible' });
  assert.deepEqual(await state(page), before, 'Talking cannot move the player');
  assert.deepEqual((await snapshot(page)).assets, saved.assets, 'Opening conversation cannot change assets');
  if (expectsShop) {
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
    assert.equal(await page.locator('#dialog').isVisible(), false, 'Ordinary dialog and shop cannot coexist');
    assert.equal(await page.locator('#shop-conversation .shop-speaker').innerText(), item.name);
    assert.equal(await page.locator('#shop-line').innerText(), item.lines[0]);
    assert.ok(['greeting', 'choice'].includes(await root.getAttribute('data-phase')));
  } else {
    assert.equal(await page.locator('#shop-panel').isVisible(), false, 'Shelf/ordinary conversation cannot open the shop');
    assert.deepEqual(await page.evaluate(() => window.__slg.game.dialog), { speaker: item.name, lines: item.lines, index: 0 });
    assert.equal(await page.locator('#dialog .who').innerText(), item.name);
    assert.equal(await page.locator('#dialog .text').innerText(), item.lines[0]);
  }
  const rect = await root.boundingBox(), viewport = page.viewportSize();
  assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1);
  return before;
}

export async function closeTalk(page, touch = false) {
  const before = conversationBaselines.get(page);
  assert.ok(before, 'Call talk() before closing its conversation');
  if (before.expectsShop) {
    assert.equal(await page.locator('#shop-panel').isVisible(), true);
    if (touch) await page.locator('#shop-close').tap(); else await page.keyboard.press('Escape');
    await page.locator('#shop-panel').waitFor({ state: 'hidden' });
  } else {
    const lines = await page.evaluate(() => window.__slg.game.dialog.lines.length);
    for (let i = 0; i < lines; i++) {
      if (touch) await page.locator('#dialog').tap(); else await page.keyboard.press('KeyZ');
    }
  }
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#shop-panel').isVisible(), false);
  assert.deepEqual(await state(page), before.player, 'Cancellation/closing returns to the same position');
  assert.deepEqual((await snapshot(page)).assets, before.assets, 'Cancellation/closing cannot charge money or award items');
  conversationBaselines.delete(page);
}

export function assertSessionClean(session) {
  assert.deepEqual(session.errors, []); assert.deepEqual(session.blocked, []); assert.deepEqual(session.downloads, []);
}
