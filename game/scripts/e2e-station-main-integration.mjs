/** Exercise the merged main UI during the complete ride, including the destination animation. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOutputDirectory } from './browser-output.mjs';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5297');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
assert.equal(base.search, '', 'Use the normal game with isolated storage');
const output = browserOutputDirectory('e2e-station-main-integration');
await mkdir(output, { recursive: true });
const report = { url: base.href, passed: [], errors: [], blocked: [] };
const browser = await chromium.launch({ headless: true });
const epoch = Date.parse('2026-11-15T00:00:00Z');
const state = page => page.evaluate(() => {
  const game = window.__slg.game;
  return { player: { ...game.player }, assets: game.assets.snapshot(), phone: game.phone.save(), appearance: { ...game.appearance } };
});
const stage = page => page.locator('#train-travel-panel').getAttribute('data-ride-stage');
const snapshot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`) });

async function advanceUntil(page, predicate, message, timeout = 25_000) {
  for (let elapsed = 0; elapsed < timeout; elapsed += 80) {
    if (await predicate()) return;
    await page.clock.runFor(80);
  }
  assert.fail(message);
}

async function assertLocked(page, expected, touch, label) {
  const exclusive = await page.locator('#stage').evaluate(node => node.classList.contains('modal-open'));
  const phoneDisabled = await page.locator('#btn-phone').isDisabled();
  const avatarDisabled = await page.locator('#btn-avatar').isDisabled();
  await page.locator('#view').focus();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyZ');
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(160);
  await page.keyboard.up('ArrowLeft');
  assert.deepEqual((await state(page)).player, expected.player, `${label}: keyboard cannot move the player before alighting finishes`);
  // Check all contextual openers, even when their launch buttons are hidden during the ride.
  await page.evaluate(() => {
    for (const id of ['btn-avatar', 'btn-phone', 'btn-reset', 'minimap-button', 'btn-touch']) document.getElementById(id)?.click();
  });
  if (touch) {
    const box = await page.locator('#touch [data-dir="down"]').boundingBox();
    assert.ok(box);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.clock.runFor(160);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
  assert.deepEqual((await state(page)).player, expected.player, `${label}: no movement or reset during travel`);
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOpen), false);
  assert.equal(await page.locator('#stage').evaluate(node => node.classList.contains('map-open')), false);
  assert.equal(exclusive, true, `${label}: travel stays exclusive until the actor is outside the gate`);
  assert.equal(phoneDisabled, true);
  assert.equal(avatarDisabled, true);
}

try {
  for (const size of [
    { name: 'desktop', width: 1280, height: 800, touch: false },
    { name: 'portrait', width: 390, height: 844, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
      isMobile: size.touch, hasTouch: size.touch, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false });
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base.origin || url.protocol === 'data:') return route.continue();
        report.blocked.push(url.origin); return route.abort();
      });
      await context.routeWebSocket('**', socket => {
        if (new URL(socket.url()).origin === base.origin.replace(/^http/, 'ws')) return socket.connectToServer();
        report.blocked.push(new URL(socket.url()).origin); void socket.close();
      });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await page.clock.install({ time: new Date(epoch) });
      await page.goto(base.href, { waitUntil: 'load' });
      await page.clock.pauseAt(new Date(epoch + 60_000));
      await page.clock.runFor(400);
      // Initial fixture setup only. Every trip and conflicting input below uses the actual UI.
      const flows = await page.evaluate(async () => {
        const { getStationFlow } = await import('/src/world/index.ts');
        const { positionAt } = await import('/src/map/explorer.ts');
        const game = window.__slg.game;
        game.player = positionAt(getStationFlow('station').front);
        game.assets.changeMoney(321);
        game.assets.addItem('notebook', 3);
        game.setAppearance({ ...game.appearance, hairColor: 'gold', outfitColor: 'purple' });
        localStorage.setItem('slg-map-save-v1', JSON.stringify(game.serialize()));
        return [getStationFlow('station'), getStationFlow('station-neighbor')];
      });
      const initial = await state(page);
      await page.evaluate(() => { window.__arrivals = []; window.__slg.game.on(event => { if (event.type === 'area-enter') window.__arrivals.push({ ...event }); }); });

      for (const [index, from, to] of [[0, flows[0], flows[1]], [1, flows[1], flows[0]]]) {
        if (index > 0) {
          // Outside and front differ by one tile. Walk to the adjacent entry column and face the gate.
          await page.locator('#view').focus();
          await page.keyboard.down('ArrowLeft');
          await page.clock.runFor(220);
          await page.keyboard.up('ArrowLeft');
          await page.keyboard.down('ArrowUp');
          await page.clock.runFor(80);
          await page.keyboard.up('ArrowUp');
        }
        await page.locator('#view').focus();
        if (size.touch) await page.locator('#touch [data-act]').tap(); else await page.keyboard.press('KeyZ');
        assert.equal(await page.locator('#train-travel-panel').isVisible(), true);
        await snapshot(page, `${size.name}-${index}-destinations`);
        const select = page.locator(`#train-travel-panel [data-station-id="${to.stationId}"]`);
        if (size.touch) await select.tap(); else await select.click();
        await page.clock.runFor(160);
        assert.equal(await stage(page), 'origin');
        await assertLocked(page, await state(page), size.touch, `${size.name} ${index} origin`);
        await advanceUntil(page, async () => (await stage(page)) === 'destination', 'Arrival animation did not start');
        await snapshot(page, `${size.name}-${index}-destination-start`);
        const arrival = await state(page);
        await assertLocked(page, arrival, size.touch, `${size.name} ${index} destination`);
        await advanceUntil(page, () => page.locator('#stage').evaluate(node => !node.classList.contains('travel-open')),
          'Control was not restored outside the gate');
        const expected = { areaId: to.outside.areaId, x: to.outside.x * 16 + 8, y: to.outside.y * 16 + 14, facing: to.outside.facing };
        assert.deepEqual((await state(page)).player, expected);
        const after = await state(page);
        for (const field of ['assets', 'phone', 'appearance']) assert.deepEqual(after[field], initial[field], `${field} persists across the ride`);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
        for (const field of ['areaId', 'x', 'y', 'facing']) assert.equal(saved[field], expected[field]);
        assert.equal(await page.evaluate(() => window.__arrivals.length), index + 1);
        await snapshot(page, `${size.name}-${index}-outside-control-returned`);
        // Finish the departing train before the reverse trip, keeping the idle animation out of setup.
        await advanceUntil(page, async () => (await stage(page)) === 'done', 'The arrival train did not leave');
        report.passed.push(`${size.name} ${from.stationId} -> ${to.stationId}: full-ride exclusivity, one arrival, state and save`);
      }
      const beforeReload = await state(page);
      await page.reload({ waitUntil: 'load' }); await page.clock.runFor(400);
      assert.deepEqual(await state(page), beforeReload);
      await page.locator('#view').focus();
      await page.keyboard.press('KeyP');
      assert.equal(await page.evaluate(() => window.__slg.game.phone.isOpen), true, 'Phone is usable after reloading the arrival');
      report.passed.push(`${size.name}: arrival reload restores state and phone opens`);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blocked, []);
  console.log(`SUMMARY ${report.passed.length}/${report.passed.length} PASS`);
} catch (error) {
  report.failure = String(error.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}
