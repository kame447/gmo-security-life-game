/** Run against the #36 boarding-flow preview (gate -> platform -> ride -> arrival). Browser contexts use isolated storage. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOutputDirectory } from './browser-output.mjs';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5207');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = browserOutputDirectory('e2e-train-travel');
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
const phase = page => page.evaluate(() => document.querySelector('#train-travel-panel')?.dataset.rideStage ?? null);
const waitPhase = (page, name, timeout = 20000) => page.waitForFunction(n => document.querySelector('#train-travel-panel')?.dataset.rideStage === n, name, { timeout, polling: 'raf' });
const watchPhases = page => page.evaluate(() => {
  window.__phases = [];
  new MutationObserver(() => { const p = document.querySelector('#train-travel-panel').dataset.rideStage; if (p && window.__phases.at(-1) !== p) window.__phases.push(p); })
    .observe(document.querySelector('#train-travel-panel'), { attributes: true, attributeFilter: ['data-ride-stage'] });
});
const setPlayer = (page, point) => page.evaluate(async point => {
  const { positionAt } = await import('/src/map/explorer.ts'); window.__slg.game.player = positionAt(point);
}, point);

/** 改札の前（南）で操作し、行き先を1回決める。確認や切符は無く、決めた直後に乗車の演出が始まる。 */
async function decide(page, destinationId, touch, prefix) {
  await act(page, touch); await panel(page).waitFor({ state: 'visible' });
  const buttons = await panel(page).locator('button').evaluateAll(list => list.map(b => b.dataset.action));
  assert.ok(buttons.every(action => action === 'select' || action === 'back'), `only destinations and back: ${buttons}`);
  if (prefix) await shot(page, `${prefix}-destinations`);
  await click(page, `[data-action="select"][data-station-id="${destinationId}"]`, touch);
}
/** 演出中、毎フレーム: 実際のゲーム画面(#view)の暗さ・フェードの有無・マップ上の列車の位置・主人公の見え方を記録する。 */
const watchRide = page => page.evaluate(() => {
  window.__log = [];
  const probe = document.createElement('canvas'), pc = probe.getContext('2d', { willReadFrequently: true });
  probe.width = 64; probe.height = 36;
  const loop = () => {
    const view = document.querySelector('#view'), root = document.querySelector('#train-travel-panel');
    pc.drawImage(view, 0, 0, 64, 36);
    const data = pc.getImageData(0, 0, 64, 36).data; let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 24 && data[i + 1] < 24 && data[i + 2] < 24) dark++;
    const stats = window.__slg.renderer.stats, g = window.__slg.game;
    window.__log.push({ t: Number(root.dataset.rideT ?? 0), stage: root.dataset.rideStage ?? null, dark: dark / (64 * 36), fading: !!stats.fading,
      trains: stats.trains.map(t => ({ ...t })), area: g.area.def.id, player: { x: g.player.x, y: g.player.y }, camX: stats.camX, camY: stats.camY });
    requestAnimationFrame(loop);
  };
  loop();
});
async function ride(page, touch, prefix, hooks = {}) {
  await watchPhases(page); await watchRide(page);
  const before = await player(page);
  const stage = name => page.waitForFunction(n => document.querySelector('#train-travel-panel')?.dataset.rideStage === n, name, { timeout: 25000, polling: 'raf' });
  if (!hooks.reduced) {
    await page.waitForFunction(() => window.__slg.renderer.stats.trains.length > 0, null, { timeout: 5000, polling: 'raf' });
    await page.waitForTimeout(500); if (prefix) await shot(page, `${prefix}-ride-1-train-arrives-actor-walks`);
    await page.waitForTimeout(800); if (prefix) await shot(page, `${prefix}-ride-2-walking-to-door`);
    assert.deepEqual(await player(page), before, 'the real player stays at the gate while the actor walks');
    if (hooks.during) await hooks.during(before);
    await page.waitForFunction(() => window.__slg.renderer.stats.trains.some(t => t.doorOpen === 0) && window.__log.some(l => l.trains.some(t => t.doorOpen > 0.9)), null, { timeout: 25000, polling: 'raf' });
    await stage('destination');
    await page.waitForTimeout(1300); if (prefix) await shot(page, `${prefix}-ride-3-arrival-train-at-neighbor`);
    await page.waitForTimeout(1000); if (prefix) await shot(page, `${prefix}-ride-4-alighting`);
  }
  await panel(page).waitFor({ state: 'hidden', timeout: 20000 });
  await page.waitForFunction(() => window.__phases.includes('done'), null, { timeout: 20000, polling: 'raf' });
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => window.__log);
  assert.ok(log.length > 30, 'frames were sampled');
  assert.ok(log.every(l => !l.fading), 'the renderer never starts an area fade during the ride');
  // 構内の外側が黒い（縦長の画面では部屋が画面より小さい）のは通常の描画。演出がそれ以上に暗くしないことを確かめる。
  const darkMax = Math.max(...log.map(l => l.dark)), baseline = Math.max(log[0].dark, log.at(-1).dark);
  assert.ok(darkMax <= baseline + 0.12, `no darker than the plain map (${baseline}): ${darkMax}`);
  for (let i = 1; i < log.length; i++) assert.ok(Math.abs(log[i].dark - log[i - 1].dark) < 0.4, `no flash at frame ${i}: ${log[i - 1].dark} -> ${log[i].dark}`);
  // 切り替えの前後で、列車が1つも見えない時間（ミリ秒）。実時間のフレーム長は CPU 負荷で伸びるので、演出の時計(data-ride-t)で測る。
  const emptyMs = (() => {
    const at = log.findIndex(l => l.stage === 'destination');
    let start = null, worst = 0;
    for (let i = Math.max(0, at - 400); i < Math.min(log.length, at + 400); i++) {
      if (log[i].trains.length) { if (start !== null) worst = Math.max(worst, log[i].t - start); start = null; } else if (start === null) start = log[i].t;
    }
    return Math.round(worst);
  })();
  console.log(`  train-less time around the switch: ${emptyMs} ms`);
  assert.ok(emptyMs <= MAX_EMPTY_MS, `train-less time around the switch: ${emptyMs} ms`);
  const trainFrames = log.filter(l => l.trains.length);
  assert.ok(trainFrames.length > 20, 'a train was drawn on the map');
  return { phases: await page.evaluate(() => window.__phases), log };
}
const MAX_EMPTY_MS = Number(process.env.SLG_MAX_EMPTY_MS || 50);
const tileOf = p => ({ x: Math.floor(p.x / 16), y: Math.floor((p.y - 4) / 16) });
const setPlayerTo = (page, point) => page.evaluate(async point => {
  const { positionAt } = await import('/src/map/explorer.ts'); window.__slg.game.player = positionAt(point);
}, point);

try {
  const desktop = await contextFor({ width: 1280, height: 800, touch: false }, null, rec('desktop', { width: 1280, height: 800 })); page = desktop.page;
  const access = await page.evaluate(async () => (await import('/src/world/landmarks.ts')).STATION_ACCESS);
  const neighbor = await page.evaluate(async () => (await import('/src/world/towns/neighbor.ts')).NEIGHBOR_STATION_ACCESS);
  const flows = await page.evaluate(async () => { const { getStationFlow } = await import('/src/world/index.ts'); return { main: getStationFlow('station'), neighbor: getStationFlow('station-neighbor') }; });
  const mainGate = flows.main.gate, nGate = flows.neighbor.gate;
  const mainSouth = { x: mainGate.front.x, y: mainGate.front.y };
  const nSouth = { x: nGate.front.x, y: nGate.front.y }, nNorth = { x: nGate.tile.x, y: nGate.tile.y - 1 };
  const nOut = { x: nGate.outside.x, y: nGate.outside.y }, mainOut = { x: mainGate.outside.x, y: mainGate.outside.y };
  const appearanceBefore = await page.evaluate(() => ({ ...window.__slg.game.appearance }));
  await check('walk from the original town into its station', async () => {
    const entrance = await page.evaluate(id => window.__slg.game.area.def.portals.find(portal => portal.id === id)?.from, access.entrancePortalId);
    await walkTo(page, entrance); await waitArea(page, access.areaId);
  });
  await shot(page, 'desktop-01-station-entry');
  await check('the gate cannot be walked through; the list can be backed out of', async () => {
    await walkTo(page, mainSouth); await face(page, 'up');
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500); await page.keyboard.up('ArrowUp');
    assert.deepEqual(tileOf(await player(page)), mainSouth);
    const before = await page.evaluate(() => window.__slg.game.serialize());
    await act(page, false); await panel(page).waitFor({ state: 'visible' });
    await click(page, '#train-travel-panel [data-action="back"]', false);
    await panel(page).waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.__slg.game.serialize()), before);
  });
  await check('the platform sign is an ordinary conversation, not a menu', async () => {
    const sign = flows.main.platforms.find(p => p.direction === 'down').sign;
    await setPlayerTo(page, { areaId: access.areaId, x: sign.x, y: sign.y + 1, facing: 'up' }); await frame(page);
    await face(page, 'up');
    await act(page, false); await frame(page);
    assert.equal(await panel(page).isVisible(), false);
    assert.equal(await page.evaluate(() => !!window.__slg.game.dialog), true);
    for (let i = 0; i < 10 && await page.evaluate(() => !!window.__slg.game.dialog); i++) await page.keyboard.press('KeyZ');
    await setPlayerTo(page, { areaId: access.areaId, ...mainSouth, facing: 'up' }); await frame(page);
  });
  await check('one decision at the gate rides: ordered phases, no dark screen, input ignored, one arrival', async () => {
    await face(page, 'up');
    const before = await player(page);
    await watchPhases(page);
    await decide(page, neighbor.stationId, false, 'desktop-03');
    assert.equal(await panel(page).locator('button').count(), 0, 'no further confirmation appears');
    const { phases } = await ride(page, false, 'desktop-04', { during: async before => {
      for (let i = 0; i < 20; i++) await page.keyboard.press('KeyZ');
      await page.keyboard.press('Escape');
      await page.keyboard.down('ArrowUp'); await page.waitForTimeout(150); await page.keyboard.up('ArrowUp');
      assert.deepEqual(await player(page), before);
      assert.equal(await page.evaluate(() => document.querySelector('#stage').classList.contains('travel-open')), true);
    } });
    assert.deepEqual(phases, ['origin', 'destination', 'done']);
    await waitArea(page, neighbor.arrival.areaId); await waitSavedArea(page, neighbor.arrival.areaId);
    assert.deepEqual(tileOf(await player(page)), nOut, 'control returns outside the gate, with no further operation');
    assert.equal((await player(page)).facing, 'down');
    assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), appearanceBefore);
    assert.notDeepEqual(before, await player(page));
    await shot(page, 'desktop-05-arrived-control-returned');
  });
  await check('after alighting, the player is already outside the gate and can walk straight out and explore', async () => {
    assert.equal(await panel(page).isVisible(), false);
    const exit = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-exit')?.from);
    await walkTo(page, exit); await waitArea(page, 'town-neighbor');
    await shot(page, 'desktop-06-neighbor-explore');
    await walkTo(page, { x: 43, y: 12 });
  });
  await check('legacy: a player left on the platform side (old save) exits the gate in one operation, no list', async () => {
    const entrance = await page.evaluate(() => window.__slg.game.area.def.portals.find(portal => portal.id === 'neighbor-station-enter')?.from);
    await walkTo(page, entrance); await waitArea(page, neighbor.boarding.areaId);
    await setPlayerTo(page, { areaId: neighbor.boarding.areaId, ...nNorth, facing: 'down' }); await frame(page);
    await face(page, 'down');
    await act(page, false);
    await page.waitForFunction(([x, y]) => Math.floor(window.__slg.game.player.x / 16) === x && Math.floor((window.__slg.game.player.y - 4) / 16) === y, [nOut.x, nOut.y], { timeout: 6000 });
    assert.equal(await panel(page).isVisible(), false);
    await shot(page, 'desktop-05b-exited-gate-legacy');
  });
  await check('return trip: neighbor gate, one decision, up line', async () => {
    await walkTo(page, nSouth); await face(page, 'up');
    await decide(page, access.stationId, false, 'desktop-07-neighbor-gate');
    const { phases } = await ride(page, false, 'desktop-08');
    assert.equal(phases.at(-1), 'done');
    await waitArea(page, access.arrival.areaId); await waitSavedArea(page, access.arrival.areaId);
    assert.deepEqual(tileOf(await player(page)), mainOut, 'back outside the home station gate');
  });
  await desktop.context.close();

  const base0 = await (async () => { const c = await contextFor({ width: 1280, height: 800, touch: false }); const s = await c.page.evaluate(() => window.__slg.game.serialize()); await c.context.close(); return s; })();
  const gateSave = { ...base0, areaId: access.areaId, x: mainSouth.x * 16 + 8, y: mainSouth.y * 16 + 14, facing: 'up' };

  await check('reload during departure returns to the gate before departure; during arrival, to the destination', async () => {
    for (const stopAt of ['depart', 'arrive']) {
      const { context, page: p } = await contextFor({ width: 1280, height: 800, touch: false }, gateSave); page = p;
      try {
        const rest = () => page.evaluate(() => JSON.stringify({ ...window.__slg.game.serialize(), x: 0, y: 0, areaId: '', facing: '' }));
        const money = await rest();
        await decide(page, neighbor.stationId, false);
        if (stopAt === 'depart') { await waitPhase(page, 'origin'); await page.waitForTimeout(2900); } else await waitPhase(page, 'destination');
        await page.waitForTimeout(300);
        await page.reload(); await ready(page);
        const after = await player(page);
        if (stopAt === 'depart') { assert.equal(after.areaId, access.areaId); assert.deepEqual(tileOf(after), mainSouth); }
        else { assert.equal(after.areaId, neighbor.arrival.areaId); assert.deepEqual(tileOf(after), nOut); }
        assert.equal(await rest(), money, 'nothing but the position changed');
      } finally { await context.close(); }
    }
  });
  await check('prefers-reduced-motion: a brief arrived state only, still one arrival, no dark screen', async () => {
    const { context, page: p } = await contextFor({ width: 1280, height: 800, touch: false }, gateSave, { reducedMotion: 'reduce' }); page = p;
    try {
      await watchPhases(page);
      await decide(page, neighbor.stationId, false);
      const { phases } = await ride(page, false, null, { reduced: true });
      assert.deepEqual(phases, ['destination', 'done']);
      await waitArea(page, neighbor.arrival.areaId);
    } finally { await context.close(); }
  });

  for (const size of [{ name: 'portrait', width: 390, height: 844, touch: true }, { name: 'landscape', width: 844, height: 390, touch: true }]) {
    await check(`${size.name}: touch gate, ride and arrival`, async () => {
      const { context, page: p } = await contextFor(size, gateSave, rec(size.name, size)); page = p;
      try {
        await shot(page, `${size.name}-01-gate`);
        await decide(page, neighbor.stationId, true, `${size.name}-02`);
        const { phases } = await ride(page, true, `${size.name}-03`);
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
