/** Run against the wired #35 + #36 preview. Browser contexts use isolated storage. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5207');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = resolve(process.env.SLG_SHOTS || '/private/tmp/slg-audit/train-travel-e2e');
await mkdir(shots, { recursive: true });
const errors = [], passed = [];
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let page;
const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
  await page.locator('#view').focus(); await frame(page);
}
async function shot(page, name) { await frame(page); await page.screenshot({ path: resolve(shots, `${name}.png`) }); }
async function check(name, run) { await run(); passed.push(name); console.log(`PASS ${name}`); }
function observe(page) {
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function contextFor(size, save) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
    hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1,
    ...(save ? { storageState: { cookies: [], origins: [{ origin: base.origin,
      localStorage: [{ name: 'slg-map-save-v1', value: JSON.stringify(save) }] }] } } : {}) });
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
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading); await frame(page);
}
async function waitSavedArea(page, areaId) {
  await page.waitForFunction(areaId => {
    try { return JSON.parse(localStorage.getItem('slg-map-save-v1') || 'null')?.areaId === areaId; }
    catch { return false; }
  }, areaId, { timeout: 5000 });
}
async function board(page, expectedId) {
  assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.id), expectedId);
  await page.keyboard.press('KeyZ');
  await page.locator('#train-travel-panel').waitFor({ state: 'visible' });
}

try {
  const desktop = await contextFor({ width: 1280, height: 800, touch: false }); page = desktop.page;
  const access = await page.evaluate(async () => (await import('/src/world/landmarks.ts')).STATION_ACCESS);
  const neighbor = await page.evaluate(async () => (await import('/src/world/towns/neighbor.ts')).NEIGHBOR_STATION_ACCESS);
  await check('normal start and appearance selection', async () => {
    assert.equal((await player(page)).areaId, 'town-main');
    await page.locator('#btn-avatar').click();
    await page.locator('[data-field="hairColor"] [data-step="1"]').click();
    await page.locator('#avatar-ok').click();
    await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
  });
  const appearance = await page.evaluate(() => ({ ...window.__slg.game.appearance }));
  const stage = await page.evaluate(() => window.__slg.game.world.variant.stage);
  await shot(page, 'desktop-01-town');

  await check('walk from the original town into its station', async () => {
    const entrance = await page.evaluate(id => window.__slg.game.area.def.portals.find(portal => portal.id === id)?.from, access.entrancePortalId);
    assert.ok(entrance, 'Station entrance is registered');
    await walkTo(page, entrance); await waitArea(page, access.areaId);
    assert.equal((await player(page)).areaId, access.areaId);
  });
  await shot(page, 'desktop-02-station-entry');
  await check('ordinary action outside the boarding position does not start a train', async () => {
    const before = await player(page);
    await page.keyboard.press('KeyZ'); await frame(page);
    assert.equal(await page.locator('#train-travel-panel').isVisible(), false);
    assert.equal((await player(page)).areaId, before.areaId);
    for (let i = 0; i < 10 && await page.evaluate(() => !!window.__slg.game.dialog); i++) await page.keyboard.press('KeyZ');
  });
  await walkTo(page, access.boarding); await face(page, access.boarding.facing);
  const boardSave = await page.evaluate(() => window.__slg.game.serialize());
  await shot(page, 'desktop-03-boarding');

  await check('backing out of either choice does not move the player', async () => {
    const before = await player(page);
    await board(page, access.interaction.id);
    await page.locator(`[data-action="select"][data-station-id="${neighbor.stationId}"]`).click();
    await page.locator('#train-travel-panel [data-action="back"]').click();
    assert.equal(await page.locator(`[data-action="select"][data-station-id="${neighbor.stationId}"]`).count(), 1);
    await page.locator('#train-travel-panel [data-action="back"]').click();
    await page.locator('#train-travel-panel').waitFor({ state: 'hidden' });
    assert.deepEqual(await player(page), before);
  });

  await check('destination requires a separate confirmation and blocks field movement', async () => {
    await board(page, access.interaction.id);
    const before = await player(page);
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown');
    assert.deepEqual(await player(page), before);
    await shot(page, 'desktop-04-destinations');
    await page.locator(`[data-action="select"][data-station-id="${neighbor.stationId}"]`).focus();
    await page.keyboard.down('Enter');
    try {
      await page.locator('#train-travel-panel [data-action="confirm"]').waitFor({ state: 'visible' });
      await page.keyboard.down('Enter'); await page.waitForTimeout(120);
      assert.equal(await page.locator('#train-travel-panel').isVisible(), true, 'Held Enter must not confirm twice');
      assert.deepEqual(await player(page), before);
    } finally { await page.keyboard.up('Enter'); }
    await shot(page, 'desktop-05-confirm');
    await page.keyboard.press('Enter');
    await page.locator('#train-travel-panel').waitFor({ state: 'hidden' });
    await waitArea(page, neighbor.arrival.areaId); await waitSavedArea(page, neighbor.arrival.areaId);
  });
  await shot(page, 'desktop-06-neighbor-station');
  await check('arrival survives reload with appearance and stage unchanged', async () => {
    const before = await player(page);
    await page.reload(); await ready(page);
    assert.deepEqual(await player(page), before);
    assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), appearance);
    assert.equal(await page.evaluate(() => window.__slg.game.world.variant.stage), stage);
  });

  await check('walking against the track does not enter it or trigger travel', async () => {
    await walkTo(page, { x: 5, y: 4 });
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500); await page.keyboard.up('ArrowUp');
    const after = await player(page);
    assert.equal(after.areaId, neighbor.arrival.areaId);
    assert.equal(Math.floor((after.y - 4) / 16), 4);
    assert.equal(await page.locator('#train-travel-panel').isVisible(), false);
  });
  await check('walk out, explore the different town and cross its bridge', async () => {
    const exit = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-exit')?.from);
    assert.ok(exit); await walkTo(page, exit); await waitArea(page, 'town-neighbor');
    await walkTo(page, { x: 43, y: 12 });
    assert.equal((await player(page)).areaId, 'town-neighbor');
  });
  const townSave = await page.evaluate(() => window.__slg.game.serialize());
  await shot(page, 'desktop-07-neighbor-town');

  await check('walk back to the station and explicitly take the return train', async () => {
    const entrance = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-enter')?.from);
    assert.ok(entrance); await walkTo(page, entrance); await waitArea(page, neighbor.boarding.areaId);
    await walkTo(page, neighbor.boarding); await face(page, neighbor.boarding.facing);
    await board(page, neighbor.boarding.interactionId);
    await page.locator(`[data-action="select"][data-station-id="${access.stationId}"]`).click();
    assert.equal((await player(page)).areaId, neighbor.boarding.areaId);
    await page.locator('#train-travel-panel [data-action="confirm"]').click();
    await waitArea(page, access.arrival.areaId); await waitSavedArea(page, access.arrival.areaId);
    const before = await player(page);
    await page.reload(); await ready(page);
    assert.deepEqual(await player(page), before);
    assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), appearance);
    assert.equal(await page.evaluate(() => window.__slg.game.world.variant.stage), stage);
  });
  await shot(page, 'desktop-08-return');
  await desktop.context.close();

  for (const size of [{ name: 'portrait', width: 390, height: 844, touch: true }, { name: 'landscape', width: 844, height: 390, touch: true }]) {
    await check(`${size.name}: real touch selection and confirmation`, async () => {
      const mobile = await contextFor(size, boardSave); page = mobile.page;
      try {
        assert.equal((await player(page)).areaId, access.areaId);
        await shot(page, `${size.name}-01-station`);
        await page.locator('#touch [data-act]').tap();
        await page.locator('#train-travel-panel').waitFor({ state: 'visible' });
        await shot(page, `${size.name}-02-destinations`);
        for (const button of await page.locator('#train-travel-panel button').all()) {
          const box = await button.boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44);
        }
        await page.locator(`[data-action="select"][data-station-id="${neighbor.stationId}"]`).tap();
        await shot(page, `${size.name}-03-confirm`);
        assert.equal((await player(page)).areaId, access.areaId);
        await page.locator('#train-travel-panel [data-action="confirm"]').tap();
        await waitArea(page, neighbor.arrival.areaId);
        await shot(page, `${size.name}-04-arrival`);
      } finally { await mobile.context.close(); }
      // Reuse a save produced by the real desktop walk for visual comparison only.
      const town = await contextFor(size, townSave); page = town.page;
      try { assert.equal((await player(page)).areaId, 'town-neighbor'); await shot(page, `${size.name}-05-town`); }
      finally { await town.context.close(); }
    });
  }
  assert.deepEqual(errors, []);
  console.log(`SUMMARY ${passed.length}/${passed.length} PASS; screenshots: ${shots}`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed.length} PASS; FAILED`); process.exitCode = 1;
  if (page && !page.isClosed()) await shot(page, 'failure').catch(() => {});
} finally { await browser.close(); }
