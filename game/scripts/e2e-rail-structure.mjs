import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const target = new URL(process.env.SLG_URL || 'http://127.0.0.1:5202');
assert.ok(['http:', 'https:'].includes(target.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Use a local game server');
assert.equal(target.search, '', 'Rail checks use the normal game without review fixtures');
const output = process.env.SLG_SHOTS;
if (output) { assert.ok(path.isAbsolute(output), 'SLG_SHOTS must be absolute'); await mkdir(output, { recursive: true }); }
const sizes = [['desktop', 1280, 800, false], ['portrait', 390, 844, true], ['landscape', 844, 390, true]];
const report = { checks: [], screenshots: [], errors: [], blocked: [], downloads: [] };
const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const state = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const snapshot = page => page.evaluate(() => window.__slg.game.serialize());
const tile = player => ({ x: Math.floor(player.x / 16), y: Math.floor((player.y - 4) / 16) });
const landed = spawn => ({ areaId: spawn.areaId, x: spawn.x * 16 + 8, y: spawn.y * 16 + 14, facing: spawn.facing });
function pass(name) { report.checks.push(name); console.log('PASS', name); }
async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
  await page.locator('#view').focus();
  await page.evaluate(() => {
    if (window.__railPortals) return;
    window.__railPortals = [];
    window.__slg.game.on(event => {
      if (event.type === 'portal') window.__railPortals.push({ ...event, player: { ...window.__slg.game.player } });
    });
  });
}
async function shot(page, name) {
  if (!output) return;
  const file = path.join(output, `${name}.png`);
  await page.screenshot({ path: file }); report.screenshots.push(file);
}
async function hold(page, key, ms) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(ms); } finally { await page.keyboard.up(key); }
}
/** Bounded real-key correction checks both sides of every waypoint; never writes player coordinates. */
async function walkTo(page, goal) {
  const route = await page.evaluate(async goal => {
    const { findPath } = await import('/src/world/index.ts'), game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, goal);
  }, goal);
  assert.ok(route, `No path to ${JSON.stringify(goal)}`);
  await page.locator('#view').focus();
  for (const point of route) for (const axis of ['x', 'y']) {
    const value = point[axis] * 16 + (axis === 'x' ? 8 : 14);
    let settled = false;
    for (let correction = 0; correction < 8; correction++) {
      const before = await state(page), delta = value - before[axis];
      if (Math.abs(delta) <= 3) { settled = true; break; }
      const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, value, sign, areaId }) => {
          const p = window.__slg.game.player;
          return p.areaId !== areaId || (p[axis] - value) * sign >= -3;
        }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 4000 });
      } finally { await page.keyboard.up(key); }
      if ((await state(page)).areaId !== before.areaId) {
        await page.waitForFunction(() => !window.__slg.renderer.stats.fading); return;
      }
    }
    assert.ok(settled || Math.abs((await state(page))[axis] - value) <= 3,
      `Waypoint alignment failed: ${JSON.stringify({ point, actual: await state(page), axis })}`);
    assert.equal(tile(await state(page))[axis], point[axis]);
  }
}
async function landing(page, id, destination) {
  const event = await page.evaluate(id => window.__railPortals.findLast(event => event.portalId === id), id);
  assert.ok(event, `No observed portal ${id}`); assert.deepEqual(event.player, landed(destination));
}
async function reloadExact(page) {
  const saved = await snapshot(page);
  await page.reload(); await ready(page); assert.deepEqual(await snapshot(page), saved);
}
let current;
try {
  for (const [name, width, height, touch] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === target.origin || url.protocol === 'data:') return route.continue();
      report.blocked.push(url.origin); return route.abort();
    });
    await context.routeWebSocket('**', socket => {
      if (new URL(socket.url()).origin === target.origin.replace(/^http/, 'ws')) socket.connectToServer();
      else { report.blocked.push(new URL(socket.url()).origin); void socket.close(); }
    });
    const page = await context.newPage(); current = page;
    page.on('pageerror', error => report.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('download', download => { report.downloads.push(download.suggestedFilename()); void download.cancel(); });
    try {
      await page.goto(target.href); await ready(page);
      const access = await page.evaluate(async () => (await import('/src/world/landmarks.ts')).STATION_ACCESS);
      const problems = await page.evaluate(async () => {
        const { validateWorld, isSolidTile } = await import('/src/world/index.ts');
        const { isRailGround, T } = await import('/src/world/tiles.ts');
        const world = window.__slg.game.world, town = world.areas.get('town-main'), errors = validateWorld(world);
        for (let y = 70; y <= 73; y++) for (let x = 0; x < town.width; x++) {
          const t = town.ground[y * town.width + x];
          if (!isRailGround(t) || (t !== T.CROSSING && !isSolidTile(town, x, y))) errors.push(`Invalid track at ${x},${y}`);
          if (x >= 116 && x <= 120 && t !== T.RAIL_BRIDGE) errors.push(`Missing railway bridge at ${x},${y}`);
        }
        return errors;
      });
      assert.deepEqual(problems, []); pass(`${name}: actual World has continuous, blocked railway and a valid station`);

      if (name === 'desktop') {
        for (const entranceId of ['home-enter', 'school-enter', 'konbini-enter']) {
          const entrance = await page.evaluate(id => window.__slg.game.area.def.portals.find(p => p.id === id), entranceId);
          await walkTo(page, entrance.from); await landing(page, entrance.id, entrance.to);
          const exit = await page.evaluate(() => window.__slg.game.area.def.portals.find(p => p.to.areaId === 'town-main'));
          await walkTo(page, exit.from); await landing(page, exit.id, exit.to);
          assert.equal((await state(page)).areaId, 'town-main');
        }
        await walkTo(page, await page.evaluate(async () => (await import('/src/world/landmarks.ts')).LANDMARKS.parkPlaza));
        pass('desktop: home, school, konbini portals and park remain accessible');
      }
      await walkTo(page, { x: 28, y: 64 }); await shot(page, `${name}-01-station-exterior`);
      await walkTo(page, { x: 28, y: 63 }); await landing(page, access.entrancePortalId, access.entry);
      assert.equal((await state(page)).areaId, access.areaId);
      await shot(page, `${name}-02-concourse-gates`);
      await walkTo(page, access.boarding);
      await hold(page, 'ArrowUp', 100);
      assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.id), access.interaction.id);
      await shot(page, `${name}-03-platform-boarding`);
      await page.keyboard.press('z'); await page.locator('#dialog').waitFor({ state: 'visible' });
      const during = await state(page); await hold(page, 'ArrowDown', 160); assert.deepEqual(await state(page), during);
      await page.keyboard.press('Space'); await page.locator('#dialog').waitFor({ state: 'hidden' });
      await reloadExact(page); pass(`${name}: gates lead to a safe boarding action, dialogue and exact indoor reload`);
      await walkTo(page, { x: 10, y: 8 });
      await hold(page, 'ArrowUp', 280); const stopped = await state(page);
      assert.equal(tile(stopped).y, 8); await hold(page, 'ArrowUp', 200); assert.deepEqual(await state(page), stopped);
      await shot(page, `${name}-04-platform-boundary`);
      await walkTo(page, { x: 17, y: 17 });
      await landing(page, access.exitPortalId, { areaId: 'town-main', x: 28, y: 64, facing: 'down' });
      pass(`${name}: platform edge rejects walking onto rails and the original exit returns outdoors`);

      for (const x of [56, 80, 125]) {
        await walkTo(page, { x, y: 69 }); await walkTo(page, { x, y: 71 });
        assert.equal(tile(await state(page)).y, 71); await shot(page, `${name}-crossing-${x}`);
        await walkTo(page, { x, y: 75 }); await walkTo(page, { x, y: 69 });
      }
      pass(`${name}: all three level crossings connect both sides`);
      await walkTo(page, { x: 123, y: 74 }); await shot(page, `${name}-05-railway-bridge`);
      await reloadExact(page); pass(`${name}: bridge approach preserves exact outdoor save and appearance`);
      await walkTo(page, { x: 10, y: 69 });
      await hold(page, 'ArrowDown', 280); const outside = await state(page);
      assert.equal(tile(outside).y, 69); await hold(page, 'ArrowDown', 200); assert.deepEqual(await state(page), outside);
      pass(`${name}: ordinary street movement cannot enter the track band`);
    } catch (error) {
      if (output) await shot(page, `${name}-failure`).catch(() => {});
      throw error;
    } finally { await context.close(); current = undefined; }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blocked, []); assert.deepEqual(report.downloads, []);
  console.log(`SUMMARY ${report.checks.length} PASS; screenshots=${report.screenshots.length}; errors=0`);
} catch (error) {
  if (current && output) await shot(current, 'failure').catch(() => {});
  report.failure = String(error.stack || error); console.error('FAIL', report.failure); process.exitCode = 1;
} finally {
  await browser.close();
  if (output) await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}
