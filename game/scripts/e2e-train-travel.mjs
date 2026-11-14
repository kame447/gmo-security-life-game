/** Run against the #36 boarding-flow preview (gate -> platform -> ride -> arrival). Browser contexts use isolated storage. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5207');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = resolve(process.env.SLG_SHOTS || '/private/tmp/slg-audit/train-travel-e2e');
await mkdir(shots, { recursive: true });
const errors = [], blocked = [], passed = [];
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let page;
const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
  await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === window.__slg.game.player.areaId);
  await page.locator('#view').focus(); await frame(page);
}
async function shot(page, name) { await frame(page); await page.screenshot({ path: resolve(shots, `${name}.png`) }); }
async function check(name, run) { await run(); passed.push(name); console.log(`PASS ${name}`); }
function observe(page) {
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function contextFor(size, save, extra = {}) {
  const context = await browser.newContext({ ...extra, viewport: { width: size.width, height: size.height },
    hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1, acceptDownloads: false, serviceWorkers: 'block',
    ...(save ? { storageState: { cookies: [], origins: [{ origin: base.origin,
      localStorage: [{ name: 'slg-map-save-v1', value: JSON.stringify(save) }] }] } } : {}) });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin || url.protocol === 'data:') return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    const url = new URL(socket.url());
    if (url.origin === base.origin.replace(/^http/, 'ws')) return socket.connectToServer();
    blocked.push(url.origin); void socket.close();
  });
  const page = await context.newPage(); observe(page);
  await page.goto(base.href, { waitUntil: 'networkidle' }); await ready(page);
  return { context, page };
}
async function walkTo(page, target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `No walkable path to ${JSON.stringify(target)}`);
  await page.locator('#view').focus(); await page.keyboard.down('Shift');
  try {
    for (const tile of route) for (const axis of ['x', 'y']) {
      const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14), before = await player(page), delta = value - before[axis];
      if (Math.abs(delta) < 2.5) continue;
      const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, value, sign, areaId }) => {
          const p = window.__slg.game.player;
          return p.areaId !== areaId || (p[axis] - value) * sign >= -1.5;
        }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 5000 });
      } finally { await page.keyboard.up(key); }
      if ((await player(page)).areaId !== before.areaId) return;
    }
  } finally { await page.keyboard.up('Shift'); }
}
async function face(page, direction) {
  const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[direction];
  await page.locator('#view').focus(); await page.keyboard.down(key);
  try { await page.waitForFunction(direction => window.__slg.game.player.facing === direction, direction, { timeout: 3000 }); }
  finally { await page.keyboard.up(key); }
}
async function waitArea(page, areaId) {
  await page.waitForFunction(areaId => window.__slg.game.player.areaId === areaId, areaId, { timeout: 10000 });
  await page.waitForFunction(areaId => document.querySelector('#minimap-button')?.dataset.areaId === areaId, areaId, { timeout: 5000 });
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading); await frame(page);
}
async function waitSavedArea(page, areaId) {
  await page.waitForFunction(areaId => {
    try { return JSON.parse(localStorage.getItem('slg-map-save-v1') || 'null')?.areaId === areaId; }
    catch { return false; }
  }, areaId, { timeout: 5000 });
}
const VIDEO = process.env.SLG_VIDEO ? resolve(process.env.SLG_VIDEO) : null;
const rec = (name, size) => VIDEO ? { recordVideo: { dir: resolve(VIDEO, name), size: { width: size.width, height: size.height } } } : {};
const act = (page, touch) => touch ? page.locator('#touch [data-act]').tap() : page.keyboard.press('KeyZ');
const click = (page, selector, touch) => touch ? page.locator(selector).tap() : page.locator(selector).click();
const panel = page => page.locator('#train-travel-panel');
const phase = page => page.evaluate(() => document.querySelector('#train-travel-panel')?.dataset.ridePhase ?? null);
const waitPhase = (page, name, timeout = 20000) => page.waitForFunction(n => document.querySelector('#train-travel-panel')?.dataset.ridePhase === n, name, { timeout, polling: 'raf' });
const watchPhases = page => page.evaluate(() => {
  window.__phases = [];
  new MutationObserver(() => { const p = document.querySelector('#train-travel-panel').dataset.ridePhase; if (p && window.__phases.at(-1) !== p) window.__phases.push(p); })
    .observe(document.querySelector('#train-travel-panel'), { attributes: true, attributeFilter: ['data-ride-phase'] });
});
const gateTile = { x: 16, y: 13 };

async function pickTicket(page, destinationId, touch, prefix) {
  await act(page, touch); await panel(page).waitFor({ state: 'visible' });
  if (prefix) await shot(page, `${prefix}-destinations`);
  await click(page, `[data-action="select"][data-station-id="${destinationId}"]`, touch);
  if (prefix) await shot(page, `${prefix}-ticket-confirm`);
  await click(page, '#train-travel-panel [data-action="issue"]', touch);
  assert.match(await panel(page).innerText(), /きっぷを うけとった/);
  if (prefix) await shot(page, `${prefix}-ticket-issued`);
  await click(page, '#train-travel-panel [data-action="close"]', touch);
  await panel(page).waitFor({ state: 'hidden' });
}
async function toBoarding(page, boarding) { await walkTo(page, boarding); await face(page, boarding.facing); }
async function rideFromPlatform(page, touch, prefix, hooks = {}) {
  await act(page, touch); await panel(page).waitFor({ state: 'visible' });
  assert.equal(await panel(page).locator('[data-action="board"]').count(), 1, 'boarding confirmation is shown');
  if (prefix) await shot(page, `${prefix}-board-confirm`);
  await watchPhases(page);
  const before = await player(page);
  await click(page, '#train-travel-panel [data-action="board"]', touch);
  if (!hooks.reduced) {
    await waitPhase(page, 'walk-in'); await page.waitForTimeout(450); if (prefix) await shot(page, `${prefix}-ride-walk-in`);
    await waitPhase(page, 'door-close'); if (prefix) await shot(page, `${prefix}-ride-door-close`);
    await waitPhase(page, 'depart'); await page.waitForTimeout(550); if (prefix) await shot(page, `${prefix}-ride-depart`);
    assert.deepEqual(await player(page), before, 'position is unchanged while departing');
    if (hooks.during) await hooks.during(before);
    await waitPhase(page, 'fade-in'); await waitPhase(page, 'arrive'); await page.waitForTimeout(700); if (prefix) await shot(page, `${prefix}-ride-arrive`);
    await waitPhase(page, 'walk-out'); await page.waitForTimeout(450); if (prefix) await shot(page, `${prefix}-ride-walk-out`);
  } else await waitPhase(page, 'fade-out');
  await panel(page).waitFor({ state: 'hidden', timeout: 20000 });
  return page.evaluate(() => window.__phases);
}

try {
  const desktop = await contextFor({ width: 1280, height: 800, touch: false }, null, rec('desktop', { width: 1280, height: 800 })); page = desktop.page;
  const access = await page.evaluate(async () => (await import('/src/world/landmarks.ts')).STATION_ACCESS);
  const neighbor = await page.evaluate(async () => (await import('/src/world/towns/neighbor.ts')).NEIGHBOR_STATION_ACCESS);
  const appearanceBefore = await page.evaluate(() => ({ ...window.__slg.game.appearance }));
  await check('walk from the original town into its station', async () => {
    const entrance = await page.evaluate(id => window.__slg.game.area.def.portals.find(portal => portal.id === id)?.from, access.entrancePortalId);
    await walkTo(page, entrance); await waitArea(page, access.areaId);
  });
  await shot(page, 'desktop-01-station-entry');
  await check('the platform sign without a ticket only explains; nothing moves', async () => {
    await toBoarding(page, access.boarding);
    const before = await page.evaluate(() => window.__slg.game.serialize());
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    assert.match(await panel(page).innerText(), /かいさつで いきさきを えらんで/);
    assert.equal(await panel(page).locator('[data-action="select"]').count(), 0, 'no destination can be chosen on the platform');
    await shot(page, 'desktop-02-platform-no-ticket');
    await click(page, '#train-travel-panel [data-action="close"]', false);
    await panel(page).waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.__slg.game.serialize()), before);
  });
  await check('the ticket gate: back out, take a ticket, return it', async () => {
    await walkTo(page, gateTile); await face(page, 'up');
    assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.id), 'station-ticket');
    const before = await player(page);
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    await click(page, `[data-action="select"][data-station-id="${neighbor.stationId}"]`, false);
    await click(page, '#train-travel-panel [data-action="back"]', false);
    await click(page, '#train-travel-panel [data-action="back"]', false);
    await panel(page).waitFor({ state: 'hidden' });
    assert.deepEqual(await player(page), before);
    await pickTicket(page, neighbor.stationId, false, 'desktop-03-gate');
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    await click(page, '#train-travel-panel [data-action="return-ticket"]', false);
    await panel(page).waitFor({ state: 'hidden' });
    await toBoarding(page, access.boarding);
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    assert.match(await panel(page).innerText(), /かいさつで/, 'returned ticket is gone');
    await click(page, '#train-travel-panel [data-action="close"]', false);
    await walkTo(page, gateTile); await face(page, 'up');
    await pickTicket(page, neighbor.stationId, false);
  });
  await check('cancel at the platform before boarding keeps position and ticket', async () => {
    await toBoarding(page, access.boarding);
    const before = await player(page);
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    await click(page, '#train-travel-panel [data-action="back"]', false);
    await panel(page).waitFor({ state: 'hidden' });
    assert.deepEqual(await player(page), before);
  });
  await check('board, depart, arrive and alight: ordered phases, input ignored, one arrival', async () => {
    const phases = await rideFromPlatform(page, false, 'desktop-04', { during: async before => {
      for (let i = 0; i < 20; i++) await page.keyboard.press('KeyZ');
      await page.keyboard.press('Escape');
      await page.keyboard.down('ArrowUp'); await page.waitForTimeout(150); await page.keyboard.up('ArrowUp');
      assert.deepEqual(await player(page), before);
      assert.equal(await panel(page).isVisible(), true);
    } });
    assert.deepEqual(phases, ['walk-in', 'door-close', 'depart', 'fade-out', 'fade-in', 'arrive', 'door-open', 'walk-out', 'settle', 'done']);
    await waitArea(page, neighbor.arrival.areaId); await waitSavedArea(page, neighbor.arrival.areaId);
    const arrived = await player(page);
    assert.equal(arrived.areaId, neighbor.arrival.areaId);
    assert.equal(Math.floor(arrived.x / 16), neighbor.arrival.x); assert.equal(Math.floor((arrived.y - 4) / 16), neighbor.arrival.y);
    assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), appearanceBefore);
    await shot(page, 'desktop-05-arrived-control-returned');
    const exit = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-exit')?.from);
    await walkTo(page, exit); await waitArea(page, 'town-neighbor');
    await shot(page, 'desktop-06-neighbor-explore');
    await walkTo(page, { x: 43, y: 12 });
  });
  await check('return trip: the neighbor sign doubles as the gate (provisional), then board', async () => {
    const entrance = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-enter')?.from);
    await walkTo(page, entrance); await waitArea(page, neighbor.boarding.areaId);
    await toBoarding(page, neighbor.boarding);
    await pickTicket(page, access.stationId, false, 'desktop-07-neighbor-gate');
    const phases = await rideFromPlatform(page, false, 'desktop-08');
    assert.equal(phases.at(-1), 'done');
    await waitArea(page, access.arrival.areaId); await waitSavedArea(page, access.arrival.areaId);
    assert.equal((await player(page)).areaId, access.arrival.areaId);
  });
  await desktop.context.close();

  const gateSave = { ...(await (async () => {
    const c = await contextFor({ width: 1280, height: 800, touch: false }); const s = await c.page.evaluate(() => window.__slg.game.serialize()); await c.context.close(); return s; })()),
    areaId: access.areaId, x: gateTile.x * 16 + 8, y: gateTile.y * 16 + 14, facing: 'up' };
  const boardTilePx = { x: access.boarding.x * 16 + 8, y: access.boarding.y * 16 + 14 };

  await check('reload during departure returns to the platform before departure; during arrival, to the destination', async () => {
    for (const stopAt of ['depart', 'arrive']) {
      const { context, page: p } = await contextFor({ width: 1280, height: 800, touch: false }, gateSave); page = p;
      try {
        const money = await page.evaluate(() => JSON.stringify({ ...window.__slg.game.serialize(), x: 0, y: 0, areaId: '', facing: '' }));
        await pickTicket(page, neighbor.stationId, false);
        await toBoarding(page, access.boarding);
        await act(page, false); await panel(page).waitFor({ state: 'visible' });
        await click(page, '#train-travel-panel [data-action="board"]', false);
        await waitPhase(page, stopAt); await page.waitForTimeout(500);
        await page.reload(); await ready(page);
        const after = await player(page);
        if (stopAt === 'depart') {
          assert.equal(after.areaId, access.areaId); assert.equal(Math.floor(after.x / 16), access.boarding.x);
          await act(page, false); await panel(page).waitFor({ state: 'visible' });
          assert.match(await panel(page).innerText(), /かいさつで/, 'the ticket is not saved across a reload');
        } else assert.equal(after.areaId, neighbor.arrival.areaId);
        assert.equal(await panel(page).isVisible() && stopAt === 'arrive', false);
        const kept = await page.evaluate(() => JSON.stringify({ ...window.__slg.game.serialize(), x: 0, y: 0, areaId: '', facing: '' }));
        assert.equal(kept, money, 'nothing but the position changed');
      } finally { await context.close(); }
    }
  });
  await check('prefers-reduced-motion: only a short fade, still one arrival', async () => {
    const { context, page: p } = await contextFor({ width: 1280, height: 800, touch: false }, gateSave, { reducedMotion: 'reduce' }); page = p;
    try {
      await pickTicket(page, neighbor.stationId, false);
      await toBoarding(page, access.boarding);
      const phases = await rideFromPlatform(page, false, null, { reduced: true });
      assert.deepEqual(phases, ['fade-out', 'fade-in', 'done']);
      await waitArea(page, neighbor.arrival.areaId);
    } finally { await context.close(); }
  });

  for (const size of [{ name: 'portrait', width: 390, height: 844, touch: true }, { name: 'landscape', width: 844, height: 390, touch: true }]) {
    await check(`${size.name}: touch gate, platform, ride and arrival`, async () => {
      const { context, page: p } = await contextFor(size, gateSave, rec(size.name, size)); page = p;
      try {
        await shot(page, `${size.name}-01-gate`);
        await pickTicket(page, neighbor.stationId, true, `${size.name}-02`);
        for (const button of await page.locator('#touch button').all()) void button;
        await toBoarding(page, access.boarding);
        const phases = await rideFromPlatform(page, true, `${size.name}-03`);
        assert.equal(phases.at(-1), 'done');
        await waitArea(page, neighbor.arrival.areaId); await waitSavedArea(page, neighbor.arrival.areaId);
        await shot(page, `${size.name}-04-arrived`);
      } finally { await context.close(); }
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], 'No external network requests or WebSockets');
  console.log(`SUMMARY ${passed.length}/${passed.length} PASS; screenshots: ${shots}`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed.length} PASS; FAILED`); process.exitCode = 1;
  if (page && !page.isClosed()) await shot(page, 'failure').catch(() => {});
} finally { await browser.close(); }
