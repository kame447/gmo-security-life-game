// Existing map connection regression only. No purchasing UI or map/NPC fixtures.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const origin = new URL(url).origin;
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Use the local test server');
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false });
const errors = [], blocked = [], downloads = [];
await context.route('**/*', route => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin === origin || requestUrl.protocol === 'data:') return route.continue();
  blocked.push(requestUrl.href);
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('download', download => { downloads.push(download.suggestedFilename()); void download.cancel(); });
const state = () => page.evaluate(() => ({ ...window.__slg.game.player }));
const pass = (name, details) => { console.log(`PASS ${name}`, JSON.stringify(details)); passed++; };
let passed = 0;

async function shot(name) {
  if (shots) await page.screenshot({ path: `${shots}/store-contract-${name}.png` });
}

/** BFS + real keyboard input, as in the existing exploration E2E. No teleporting. */
async function walkTo(target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `No route to ${JSON.stringify(target)}`);
  await page.keyboard.down('Shift');
  try {
    for (const tile of route) for (const axis of ['x', 'y']) {
      const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14);
      const before = await state(), delta = value - before[axis];
      if (Math.abs(delta) < 2.5) continue;
      const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, value, sign, areaId }) => {
          const player = window.__slg.game.player;
          return player.areaId !== areaId || (player[axis] - value) * sign >= -1.5;
        }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 4000 });
      } finally { await page.keyboard.up(key); }
      if ((await state()).areaId !== before.areaId) return;
    }
  } finally { await page.keyboard.up('Shift'); }
}

try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
  const connection = await page.evaluate(async () => {
    const { STORE_CONTACTS } = await import('/src/data/stores.ts');
    const { validateStoreContacts } = await import('/src/stores/validate.ts');
    const game = window.__slg.game, store = STORE_CONTACTS[0];
    window.__storeContractEvents = [];
    game.on(event => window.__storeContractEvents.push(event));
    const outdoor = [...game.world.areas.values()].find(area => area.def.portals.some(portal => portal.id === store.entrancePortalId));
    return { store, problems: validateStoreContacts(game.world, STORE_CONTACTS), outdoorId: outdoor.def.id,
      entrance: outdoor.def.portals.find(portal => portal.id === store.entrancePortalId) };
  });
  assert.deepEqual(connection.problems, []);
  assert.equal((await state()).areaId, connection.outdoorId);
  pass('existing store contract resolves on the running world', connection);

  await walkTo(connection.entrance.from);
  assert.equal((await state()).areaId, connection.store.interiorAreaId);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
  pass('walks through the registered outdoor entrance', await state());

  const approach = await page.evaluate(async eventKey => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    const clerk = game.area.interactions.find(item => item.kind === 'npc' && item.eventKey === eventKey);
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (const [dx, dy, facing, key] of [[0, 1, 'up', 'ArrowUp'], [-1, 0, 'right', 'ArrowRight'],
      [0, -1, 'down', 'ArrowDown'], [1, 0, 'left', 'ArrowLeft']]) {
      const tile = { x: clerk.x + dx, y: clerk.y + dy };
      if (findPath(game.area, from, tile)) return { ...tile, facing, key, clerk };
    }
  }, connection.store.clerkEventKey);
  assert.ok(approach, 'The clerk has a reachable adjacent tile');
  await walkTo(approach);
  if ((await state()).facing !== approach.facing) {
    await page.keyboard.down(approach.key);
    try {
      await page.waitForFunction(facing => window.__slg.game.player.facing === facing, approach.facing, { polling: 'raf' });
    } finally { await page.keyboard.up(approach.key); }
  }
  assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.eventKey), connection.store.clerkEventKey);
  // Take the baseline after all approach input has been released, immediately before talking.
  const beforeTalking = await state();
  await page.keyboard.press('KeyZ');
  await page.locator('#dialog').waitFor({ state: 'visible' });
  assert.deepEqual(await state(), beforeTalking, 'Opening the conversation cannot move the player');
  assert.deepEqual(await page.evaluate(() => window.__slg.game.dialog),
    { speaker: approach.clerk.name, lines: approach.clerk.lines, index: 0 });
  assert.equal(await page.locator('#dialog .who').innerText(), approach.clerk.name);
  assert.equal(await page.locator('#dialog .text').innerText(), approach.clerk.lines[0]);
  await page.keyboard.down('ArrowDown');
  try { await page.waitForTimeout(200); }
  finally { await page.keyboard.up('ArrowDown'); }
  assert.deepEqual(await state(), beforeTalking, 'Conversation blocks movement');
  await shot('clerk');
  for (let line = 0; line < approach.clerk.lines.length; line++) await page.keyboard.press('KeyZ');
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await state(), beforeTalking, 'Closing returns to the same indoor position');
  pass('reaches the registered clerk and talks without changing position', { clerkId: approach.clerk.id, beforeTalking });

  const exit = await page.evaluate(outdoorId => window.__slg.game.area.def.portals
    .find(portal => portal.to.areaId === outdoorId), connection.outdoorId);
  assert.ok(exit, 'Return portal exists');
  await walkTo(exit.from);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
  const returned = await state();
  assert.deepEqual(returned, { areaId: connection.outdoorId, x: exit.to.x * 16 + 8, y: exit.to.y * 16 + 14, facing: exit.to.facing });
  assert.equal(exit.to.x, connection.entrance.from.x);
  assert.equal(exit.to.y, connection.entrance.from.y + 1);
  const events = await page.evaluate(() => window.__storeContractEvents);
  assert.deepEqual(events.filter(event => event.type === 'portal').map(event => event.portalId), [connection.entrance.id, exit.id]);
  assert.ok(events.some(event => event.type === 'interact' && event.interactionId === approach.clerk.id &&
    event.areaId === connection.store.interiorAreaId && event.eventKey === connection.store.clerkEventKey));
  await shot('returned');
  pass('returns to the original door front through the matching exit', { returned, events });

  // area-enter saves synchronously; reload checks the real browser storage path.
  await page.reload();
  await page.waitForFunction(() => !!window.__slg?.game);
  assert.deepEqual(await state(), returned);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  assert.deepEqual(downloads, []);
  pass('restores the outdoor return position after reload with no browser errors', await state());
  console.log(`SUMMARY ${passed}/5 PASS`, JSON.stringify({ errors, blocked, downloads }));
} catch (error) {
  console.error('FAIL', error);
  console.error(`SUMMARY ${passed}/5 PASS; FAILED`, JSON.stringify({ errors, blocked, downloads }));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
