/**
 * 第六波の隔離リハーサル専用。src の変更・UI 採用・商品確定はしない。
 * 実行: SLG_URL=http://127.0.0.1:5215 node scripts/integration-store-shop.mjs
 * headless、loopback の同一 origin のみ。保存は新しい browser context の Storage のみ。
 * ファイル出力・撮影・ダウンロードなし。ブラウザ実行は親が sandbox 外で行う。
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = new URL(process.env.SLG_URL || 'http://127.0.0.1:5215');
assert.ok(['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.notEqual(url.searchParams.get('review'), '1', 'The rehearsal exercises normal saving, not review isolation');
const SAVE_KEY = 'slg-map-save-v1';
const expectedIds = ['konbini', 'greengrocer', 'bookstore', 'candy', 'bakery', 'cafe', 'pharmacy'];
const errors = [], blocked = [], downloads = [];
let passed = 0;
const pass = (label, details) => { passed++; console.log(`PASS ${label}`, JSON.stringify(details ?? {})); };
const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const snapshot = page => page.evaluate(() => window.__slg.game.serialize());
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
const phase = page => page.locator('#shop-panel').getAttribute('data-phase');
const stablePhone = phone => ({ v: phone.v, owned: phone.owned, dataBudget: {
  v: phone.dataBudget.v, remainingMb: phone.dataBudget.remainingMb, capacityMb: phone.dataBudget.capacityMb,
}, chat: phone.chat });

async function newContext(browser, storageState) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block', acceptDownloads: false, ...(storageState ? { storageState } : {}) });
  await context.route('**/*', route => {
    const requested = new URL(route.request().url());
    if (requested.origin === url.origin || requested.protocol === 'data:') return route.continue();
    blocked.push(requested.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    if (new URL(socket.url()).origin === url.origin.replace(/^http/, 'ws')) socket.connectToServer();
    else { blocked.push(new URL(socket.url()).origin); void socket.close(); }
  });
  context.on('page', page => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('download', download => { downloads.push(download.suggestedFilename()); void download.cancel(); });
  });
  return context;
}

async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
  await page.locator('#view').focus();
  await page.evaluate(() => {
    if (window.__rehearsalStorePortals) return;
    window.__rehearsalStorePortals = [];
    window.__slg.game.on(event => {
      if (event.type === 'portal') window.__rehearsalStorePortals.push({ ...event, player: { ...window.__slg.game.player } });
    });
  });
}

/** Read live World + live injected catalogues, and compare all five IDs to the fixed #33 copy. */
async function contracts(page) {
  const result = await page.evaluate(async () => {
    const { PROVISIONAL_STORE_CONTACTS, buildProvisionalStoreCatalogs } = await import('/tests/fixtures/provisional-store-catalogs.ts');
    const { STORE_CONTACTS } = await import('/src/data/stores.ts');
    const { SHOP_CATALOGS } = await import('/src/data/shop-catalogs.ts');
    const { validateStoreContacts } = await import('/src/stores/validate.ts');
    const world = window.__slg.game.world;
    return { expected: PROVISIONAL_STORE_CONTACTS, problems: validateStoreContacts(world, STORE_CONTACTS),
      catalogs: SHOP_CATALOGS, expectedCatalogs: buildProvisionalStoreCatalogs(),
      stores: STORE_CONTACTS.map(store => {
        const outside = [...world.areas.values()].find(area => area.def.portals.some(portal => portal.id === store.entrancePortalId));
        const inside = world.areas.get(store.interiorAreaId);
        return { ...store, outdoorId: outside?.def.id,
          entrance: outside?.def.portals.find(portal => portal.id === store.entrancePortalId),
          exit: inside?.def.portals.find(portal => portal.to.areaId === outside?.def.id),
          clerk: inside?.interactions.find(item => item.kind === 'npc' && item.eventKey === store.clerkEventKey) };
      }) };
  });
  assert.deepEqual(result.problems, []);
  const tuple = store => ['storeId', 'interiorAreaId', 'entrancePortalId', 'clerkEventKey', 'catalogId'].map(key => store[key]);
  assert.deepEqual(result.stores.map(tuple), result.expected.map(tuple));
  assert.deepEqual(result.stores.map(store => store.catalogId), expectedIds);
  assert.deepEqual(result.catalogs, result.expectedCatalogs, 'Only the provisional rehearsal provider supplies these catalogues');
  for (const store of result.stores) assert.ok(store.entrance && store.exit && store.clerk, `Missing real connection for ${store.storeId}`);
  return result;
}

/** Initial Storage seed only. No addInitScript callback can overwrite purchases on reload. */
async function makeSeed(page) {
  return page.evaluate(async () => {
    const { PlayerAssets } = await import('/src/state/assets.ts');
    const { positionAt } = await import('/src/map/explorer.ts');
    const { parsePhoneSave } = await import('/src/phone/save.ts');
    const { SHOP_CATALOGS } = await import('/src/data/shop-catalogs.ts');
    const game = window.__slg.game;
    const items = [...new Set(['notebook', ...SHOP_CATALOGS.flatMap(catalog => catalog.offers.map(item => item.itemId))])]
      .map(itemId => ({ itemId, quantity: 1 }));
    const assets = new PlayerAssets({ moneyYen: 2480, items });
    if (typeof assets.moveStack !== 'function') throw new Error('Rehearsal must use Sage 0682364 layout-aware assets');
    const sourceIndex = assets.inventoryLayout.bag.indexOf('notebook');
    if (!assets.moveStack({ section: 'bag', index: sourceIndex }, { section: 'hotbar', index: 2 }).ok ||
        !assets.selectHotbar(2)) throw new Error('Cannot seed the supported hotbar API');
    const initial = game.serialize();
    const phone = parsePhoneSave({ v: 1, owned: false,
      dataBudget: { v: 1, remainingMb: 123, capacityMb: initial.phone.dataBudget.capacityMb },
      // No pending reply: active time must not intentionally change the comparison thread.
      chat: { v: 1, contacts: [{ id: 'rehearsal-contact', name: '暫定 保存テスト', icon: 'person' }], threads: [{
        id: 'rehearsal-thread', contactId: 'rehearsal-contact', nextSequence: 3, replyCursor: 1,
        messages: [
          { id: 'incoming-1', from: 'rehearsal-contact', text: '買い物の前のメッセージ', atMs: 1000, read: false },
          { id: 'local-1', from: 'self', text: '7店のあとも保存', atMs: 1100, read: true },
        ], pending: [],
      }] },
    }, false);
    const outside = game.world.areas.get('shop-konbini-interior').def.portals.find(portal => portal.to.areaId === 'town-main').to;
    return { ...initial, ...positionAt(outside), assets: assets.snapshot(), phone,
      appearance: { ...initial.appearance, hairColor: 'black', outfitColor: 'red' } };
  });
}

/** All products are already owned in the seed, so buying changes quantities, never slot identities. */
function sharedFields(actual, original) {
  assert.deepEqual(actual.assets.layout, original.assets.layout, 'Hotbar, selection and bag placement survive');
  // Live PhoneModel owns activity/epoch timestamps. Compare persistent state, not wall-clock metadata.
  assert.deepEqual(stablePhone(actual.phone), stablePhone(original.phone), 'Ownership, data budget and full chat survive');
  assert.deepEqual(actual.phone.chat, original.phone.chat, 'Unread flags, messages, sequence and reply cursor survive');
  assert.deepEqual(actual.appearance, original.appearance);
}

/** Normal-speed keyboard walking. Never replace Game methods or assign live player coordinates. */
async function walkTo(page, target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `No walkable route to ${JSON.stringify(target)}`);
  for (const tile of route) for (const axis of ['x', 'y']) {
    const destination = tile[axis] * 16 + (axis === 'x' ? 8 : 14), before = await player(page);
    const delta = destination - before[axis];
    if (Math.abs(delta) < 4) continue;
    const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ axis, destination, sign, areaId }) => {
        const p = window.__slg.game.player;
        return p.areaId !== areaId || (p[axis] - destination) * sign >= -4;
      }, { axis, destination, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 4000 });
    } finally { await page.keyboard.up(key); }
    const after = await player(page);
    if (after.areaId !== before.areaId) {
      await page.waitForFunction(() => !window.__slg.renderer.stats.fading); return;
    }
    assert.equal(Math.floor((after[axis] - (axis === 'y' ? 4 : 0)) / 16), tile[axis], 'A waypoint cannot be silently skipped');
  }
}

async function faceClerk(page, eventKey) {
  const approach = await page.evaluate(async eventKey => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game, target = game.area.interactions.find(item => item.kind === 'npc' && item.eventKey === eventKey);
    if (!target) return;
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (let dy = 0; dy < (target.h ?? 1); dy++) for (let dx = 0; dx < (target.w ?? 1); dx++) {
      for (const [ox, oy, facing, key] of [[0, 1, 'up', 'ArrowUp'], [-1, 0, 'right', 'ArrowRight'],
        [0, -1, 'down', 'ArrowDown'], [1, 0, 'left', 'ArrowLeft']]) {
        const tile = { x: target.x + dx + ox, y: target.y + dy + oy };
        if (findPath(game.area, from, tile)) return { ...tile, facing, key };
      }
    }
  }, eventKey);
  assert.ok(approach, `Clerk unreachable: ${eventKey}`);
  await walkTo(page, approach);
  if ((await player(page)).facing !== approach.facing) {
    await page.keyboard.down(approach.key);
    try { await page.waitForFunction(facing => window.__slg.game.player.facing === facing, approach.facing, { polling: 'raf' }); }
    finally { await page.keyboard.up(approach.key); }
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.eventKey), eventKey);
}

async function waitForPositionSave(page, expected) {
  await page.waitForFunction(({ key, expected }) => {
    const raw = localStorage.getItem(key); if (!raw) return false;
    const saved = JSON.parse(raw);
    return ['areaId', 'x', 'y', 'facing'].every(field => saved[field] === expected[field]);
  }, { key: SAVE_KEY, expected }, { timeout: 6000 });
}

const browser = await chromium.launch({ headless: true });
let bootstrap, context;
try {
  bootstrap = await newContext(browser);
  const probe = await bootstrap.newPage(); await probe.goto(url.href); await ready(probe);
  const connected = await contracts(probe), seed = await makeSeed(probe);
  assert.equal(seed.assets.layout.hotbar[2], 'notebook'); assert.equal(seed.assets.layout.selectedHotbar, 2);
  assert.equal(seed.phone.owned, false); assert.equal(seed.phone.dataBudget.remainingMb, 123);
  assert.equal(seed.phone.chat.threads[0].messages.length, 2);
  await bootstrap.close(); bootstrap = null;
  context = await newContext(browser, { cookies: [], origins: [{ origin: url.origin,
    localStorage: [{ name: SAVE_KEY, value: JSON.stringify(seed) }] }] });
  const page = await context.newPage(); await page.goto(url.href); await ready(page);
  sharedFields(await snapshot(page), seed);
  pass('seven actual store contracts, provisional catalogues and one-time layout/phone/chat seed', expectedIds);

  for (const store of connected.stores) {
    assert.equal((await player(page)).areaId, store.outdoorId);
    await walkTo(page, store.entrance.from);
    assert.equal((await player(page)).areaId, store.interiorAreaId);
    assert.equal(await page.evaluate(() => window.__rehearsalStorePortals.at(-1)?.portalId), store.entrancePortalId);
    await faceClerk(page, store.clerkEventKey);
    // Re-snapshot after every approach; normal approach input is not modal input leakage.
    const inside = await player(page), before = await snapshot(page);
    await page.keyboard.press('KeyZ');
    await page.locator('#shop-panel').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null, 'No simultaneous ordinary conversation');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.equal(await page.locator('#shop-line').innerText(), store.clerk.lines[0]);
    assert.deepEqual(await player(page), inside, 'The action boundary does not move the player');
    await page.keyboard.down('ArrowDown');
    try { await page.waitForTimeout(150); } finally { await page.keyboard.up('ArrowDown'); }
    assert.deepEqual(await player(page), inside, 'Shop blocks exploration input');
    for (let i = 0; i < 6 && await phase(page) === 'greeting'; i++) await page.locator('#shop-next').click();
    assert.equal(await phase(page), 'choice');
    pass(`${store.catalogId}: enters through its own door and talks to the actual clerk`, inside);

    await page.locator('#shop-start').click(); assert.equal(await phase(page), 'catalog');
    const catalog = connected.catalogs.find(catalog => catalog.id === store.catalogId);
    const index = store.catalogId === 'konbini' ? 0 : catalog.offers.length - 1, offer = catalog.offers[index];
    await page.locator('.shop-product').nth(index).click();
    await page.locator('#shop-review').click(); assert.equal(await phase(page), 'confirm');
    assert.deepEqual((await snapshot(page)).assets, before.assets, 'Browsing and confirmation do not charge');
    await page.locator('#shop-confirm').click(); assert.equal(await phase(page), 'receipt');
    const paid = await snapshot(page), savedPurchase = await stored(page);
    assert.equal(paid.assets.moneyYen, before.assets.moneyYen - offer.priceYen);
    assert.equal(paid.assets.items.find(item => item.itemId === offer.itemId).quantity,
      before.assets.items.find(item => item.itemId === offer.itemId).quantity + 1);
    assert.deepEqual(savedPurchase.assets, paid.assets, 'Purchase saves immediately through actual main');
    sharedFields(savedPurchase, seed); sharedFields(paid, seed);
    await page.locator('#shop-receipt button').click();
    await page.locator('#shop-panel').waitFor({ state: 'hidden' });
    assert.deepEqual(await player(page), inside, 'Receipt returns to the same room, position and direction');
    await page.reload(); await ready(page);
    assert.deepEqual(await player(page), inside); assert.deepEqual((await snapshot(page)).assets, paid.assets);
    sharedFields(await snapshot(page), seed);
    pass(`${store.catalogId}: buys once, returns to the same interior and reloads`, { itemId: offer.itemId, trialPriceYen: offer.priceYen });

    await walkTo(page, store.exit.from);
    assert.equal((await player(page)).areaId, store.outdoorId);
    assert.equal(await page.evaluate(() => window.__rehearsalStorePortals.at(-1)?.portalId), store.exit.id);
    const outside = await player(page);
    await waitForPositionSave(page, outside);
    const savedOutside = await stored(page); sharedFields(savedOutside, seed);
    assert.deepEqual(savedOutside.assets, paid.assets);
    await page.reload(); await ready(page);
    assert.deepEqual(await player(page), outside);
    const restored = await snapshot(page); sharedFields(restored, seed); assert.deepEqual(restored.assets, paid.assets);
    pass(`${store.catalogId}: exits through its own return portal and preserves the real save`, outside);
  }
  const final = await snapshot(page); sharedFields(final, seed);
  assert.equal(final.assets.items.reduce((sum, item) => sum + item.quantity, 0), seed.assets.items.length + 7);
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []); assert.deepEqual(downloads, []);
  pass('all seven purchases retain layout, selected hotbar, phone, complete chat and appearance', final.assets);
  console.log(`SUMMARY ${passed}/23 PASS`, JSON.stringify({ errors, blocked, downloads }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed}/23 PASS; FAILED`, JSON.stringify({ errors, blocked, downloads }));
  process.exitCode = 1;
} finally {
  if (bootstrap) await bootstrap.close();
  if (context) await context.close();
  await browser.close();
}
