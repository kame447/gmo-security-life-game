import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
// Functional checks use unrestricted headless frames; perf.mjs also tests the default low-rate mode.
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => ({ ...window.__slg.game.player }));
async function ready() {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
}
async function shot(name) {
  if (shots) { await page.waitForTimeout(100); await page.screenshot({ path: `${shots}/${name}.png` }); }
}
async function walkTo(target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    return findPath(game.area, { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `No walkable route to ${JSON.stringify(target)}`);
  // Follow the BFS route with real keyboard events. No player teleporting.
  await page.keyboard.down('Shift');
  try {
    for (const tile of route) {
      for (const axis of ['x', 'y']) {
        const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14);
        const before = await state();
        const delta = value - before[axis];
        if (Math.abs(delta) < 2.5) continue;
        const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
        await page.keyboard.down(key);
        try {
          await page.waitForFunction(({ axis, value, sign, areaId }) => {
            const p = window.__slg.game.player;
            return p.areaId !== areaId || (p[axis] - value) * sign >= -1.5;
          }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 4000 });
        } finally { await page.keyboard.up(key); }
        if ((await state()).areaId !== before.areaId) return;
      }
    }
  } finally { await page.keyboard.up('Shift'); }
}
async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function untilKey(key, predicate, arg) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(predicate, arg, { polling: 'raf', timeout: 10000 }); }
  finally { await page.keyboard.up(key); }
}
async function enter(key, areaId) {
  await untilKey(key, areaId => window.__slg.game.player.areaId === areaId, areaId);
  assert.equal((await state()).areaId, areaId);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
}
async function blackOutside() {
  const points = await page.evaluate(() => {
    const canvas = document.querySelector('#view'), c = canvas.getContext('2d');
    const { stats } = window.__slg.renderer;
    const w = canvas.width, h = canvas.height;
    const samples = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    if (stats.camX < 0) samples.push([Math.floor(-stats.camX * stats.zoom / 2), Math.floor(h / 2)]);
    if (stats.camY < 0) samples.push([Math.floor(w / 2), Math.floor(-stats.camY * stats.zoom / 2)]);
    return samples.map(([x, y]) => ({ x, y, rgba: [...c.getImageData(x, y, 1, 1).data] }));
  });
  for (const p of points) assert.deepEqual(p.rgba, [0, 0, 0, 255], `Black indoor exterior at ${p.x},${p.y}`);
  console.log('PASS indoor outside is black', JSON.stringify({ area: (await state()).areaId, points }));
}
async function talk() {
  const interaction = await page.evaluate(async () => {
    const { findPath } = await import('/src/world/index.ts');
    const game = window.__slg.game;
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    for (const item of game.area.interactions) for (const [dx, dy, key] of [[0, 1, 'ArrowUp'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft'], [-1, 0, 'ArrowRight']]) {
      const tile = { x: item.x + dx, y: item.y + dy };
      if (findPath(game.area, from, tile)) return { ...tile, key, id: item.id, eventKey: item.eventKey };
    }
  });
  assert.ok(interaction);
  await walkTo(interaction);
  await untilKey(interaction.key, key => {
    const faces = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    return window.__slg.game.player.facing === faces[key];
  }, interaction.key);
  await page.keyboard.press('KeyZ');
  if (interaction.eventKey.startsWith('shopping.')) {
    await page.locator('#shop-panel').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
    const duringShop = await state();
    await hold('ArrowDown', 180);
    assert.deepEqual(await state(), duringShop, 'Shop blocks movement');
    await page.locator('#shop-close').click();
    await page.locator('#shop-panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#view').evaluate(e => document.activeElement === e), true);
    console.log('PASS shop opens, blocks movement, and returns to exploration', JSON.stringify({ interaction, duringShop }));
    return;
  }
  await page.locator('#dialog').waitFor({ state: 'visible' });
  assert.ok(await page.evaluate(() => window.__slg.game.dialog));
  assert.equal(await page.locator('#btn-avatar').isDisabled(), true);
  const duringDialog = await state();
  await hold('ArrowDown', 180);
  assert.deepEqual(await state(), duringDialog, 'Dialog blocks movement');
  for (let i = 0; i < 20 && await page.evaluate(() => !!window.__slg.game.dialog); i++) await page.keyboard.press('KeyZ');
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  console.log('PASS dialog opens, blocks movement, and closes', JSON.stringify({ interaction, duringDialog, closed: await page.evaluate(() => window.__slg.game.dialog === null) }));
}
async function characterPixels() {
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(async () => {
    const { playerSprite, characterSprite } = await import('/src/render/sprites.ts');
    const { game, renderer } = window.__slg, s = renderer.stats;
    const c = document.querySelector('#view').getContext('2d');
    const hash = (sprite, x, y) => {
      const sx = (Math.round(x) + sprite.ox - s.camX) * s.zoom;
      const sy = (Math.round(y) + sprite.oy - s.camY) * s.zoom;
      const bytes = c.getImageData(sx, sy, sprite.canvas.width * s.zoom, sprite.canvas.height * s.zoom).data;
      let value = 2166136261;
      for (const byte of bytes) value = Math.imul(value ^ byte, 16777619);
      return value >>> 0;
    };
    const npc = game.area.interactions.find(i => i.id === 'neighbor-grandma');
    return { player: hash(playerSprite(game.appearance, game.player.facing, 0), game.player.x, game.player.y),
      npc: hash(characterSprite(npc.sprite, npc.facing || 'down', 0), npc.x * 16 + 8, npc.y * 16 + 14),
      appearance: { ...game.appearance } };
  });
}
async function appearanceUI() {
  const before = await characterPixels();
  await shot('appearance-before');
  await page.locator('#btn-avatar').click();
  await page.locator('#avatar-panel').waitFor({ state: 'visible' });
  const stationary = await state();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  for (const field of ['hairColor', 'outfit', 'outfitColor']) await page.locator(`[data-field="${field}"] [data-step="1"]`).click();
  assert.deepEqual(await state(), stationary, 'Appearance panel blocks direction keys');
  await page.locator('#avatar-ok').click();
  await page.waitForFunction(() => document.querySelector('#avatar-panel').hidden);
  // Wait until a game frame has drawn the final selection.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await characterPixels();
  assert.notEqual(after.player, before.player, 'Player canvas pixels change with appearance');
  assert.equal(after.npc, before.npc, 'NPC canvas pixels are unchanged');
  await shot('appearance-after');
  const changed = after.appearance;
  await page.reload(); await ready();
  assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), changed);
  await page.locator('#btn-reset').click();
  assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), changed);
  await page.locator('#btn-avatar').click();
  await page.locator('[data-field="outfitColor"] [data-step="1"]').click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), changed, 'Escape cancels draft');
  await page.locator('#btn-avatar').click();
  await page.locator('[data-field="hairColor"] [data-step="1"]').click();
  await page.locator('#avatar-cancel').click();
  assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), changed, 'Cancel button restores original');
  console.log('PASS appearance UI, player/NPC pixels, persistence, reset, cancel, movement lock', JSON.stringify({ before, after }));
}
async function renderInvariants() {
  const result = await page.evaluate(async () => {
    const { Game } = await import('/src/session/game.ts');
    const { Renderer } = await import('/src/render/renderer.ts');
    const game = new Game(window.__slg.game.world);
    const canvas = document.createElement('canvas'), renderer = new Renderer(canvas);
    renderer.resize(1280, 800, 1);
    const c = canvas.getContext('2d'), areas = [];
    renderer.draw(game, 0);
    let time = 0;
    for (const areaId of ['home-family-interior', 'school-classroom-interior', 'shop-konbini-interior']) {
      time++;
      game.player = { areaId, x: 104, y: 142, facing: 'down' };
      renderer.draw(game, time);
      const startsFading = renderer.stats.fading;
      const startsBlack = [...c.getImageData(640, 400, 1, 1).data].slice(0, 3).every(v => v === 0);
      renderer.draw(game, time + 0.1); const middleFading = renderer.stats.fading;
      renderer.draw(game, time + 0.21);
      areas.push({ areaId, startsFading, startsBlack, middleFading, endsFading: !renderer.stats.fading, indoor: renderer.stats.indoor });
    }
    game.player = { areaId: 'home-family-interior', x: 120, y: 174, facing: 'up' };
    game.dialog = { speaker: '', lines: [''], index: 0 };
    renderer.draw(game, 5); renderer.draw(game, 5.21);
    const x = (80 - renderer.stats.camX) * renderer.stats.zoom;
    const y = -renderer.stats.camY * renderer.stats.zoom, size = 16 * renderer.stats.zoom;
    const before = c.getImageData(x, y, size, size).data;
    game.player.x = 88; game.player.y = 30;
    renderer.draw(game, 6);
    const after = c.getImageData(x, y, size, size).data;
    let wallPixelDifferences = 0;
    for (let i = 0; i < before.length; i++) wallPixelDifferences += Number(before[i] !== after[i]);
    const sizes = [];
    for (const [w, h, dpr] of [[1280, 800, 1], [1280, 800, 1.25], [390, 844, 2]]) {
      renderer.resize(w, h, dpr); renderer.draw(game, 7);
      const s = renderer.stats;
      sizes.push({ zoom: s.zoom, viewW: s.viewW, viewH: s.viewH, camX: s.camX, camY: s.camY, smoothing: c.imageSmoothingEnabled });
    }
    return { areas, wallPixelDifferences, sizes };
  });
  for (const area of result.areas) for (const [key, value] of Object.entries(area)) if (key !== 'areaId') assert.equal(value, true, `${area.areaId}: ${key}`);
  assert.equal(result.wallPixelDifferences, 0, 'Wall hides character');
  for (const size of result.sizes) {
    assert.equal(size.smoothing, false);
    for (const key of ['zoom', 'viewW', 'viewH', 'camX', 'camY']) assert.equal(Number.isInteger(size[key]), true, `Integer ${key}`);
  }
  console.log('PASS render fade, wall occlusion, integer camera, interpolation off', JSON.stringify(result));
}
async function collisionFixture(kind) {
  return page.evaluate(async kind => {
    const { findPath } = await import('/src/world/index.ts');
    const { T } = await import('/src/world/tiles.ts');
    const game = window.__slg.game, a = game.area;
    const from = { x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) };
    const building = new Set();
    for (const o of a.objects) if (['house', 'apartment', 'shop', 'school', 'station', 'gym'].includes(o.kind)) {
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) building.add(y * a.width + x);
    }
    const candidates = [];
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      if (a.solid[y * a.width + x] || a.portalAt.has(y * a.width + x)) continue;
      for (const [dx, dy, key] of [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']]) {
        const nx = x + dx, ny = y + dy, outside = nx < 0 || ny < 0 || nx >= a.width || ny >= a.height;
        const n = ny * a.width + nx;
        const matches = kind === 'edge' ? outside : !outside && !!a.solid[n] &&
          (kind === 'building' ? building.has(n) : kind === 'river' ? [T.WATER, T.BANK].includes(a.ground[n]) : [T.WALL, T.WALL_TOP].includes(a.ground[n]));
        if (matches) candidates.push({ x, y, key, nx, ny, distance: Math.abs(x - from.x) + Math.abs(y - from.y) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find(p => findPath(a, from, p));
  }, kind);
}
async function checkCollision(kind) {
  const fixture = await collisionFixture(kind);
  assert.ok(fixture, `Reachable collision fixture: ${kind}`);
  await walkTo(fixture);
  const before = await state();
  await hold(fixture.key, 600);
  const blocked = await state();
  await hold(fixture.key, 600);
  assert.deepEqual(await state(), blocked, `${kind}: held input remains blocked`);
  assert.ok(Math.hypot(blocked.x - before.x, blocked.y - before.y) <= 14, `${kind}: cannot pass through obstacle`);
  assert.equal(await page.evaluate(() => {
    const g = window.__slg.game, p = g.player, a = g.area;
    const left = Math.floor((p.x - 5) / 16), right = Math.ceil((p.x + 5) / 16) - 1;
    const top = Math.floor((p.y - 8) / 16), bottom = Math.ceil(p.y / 16) - 1;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (x < 0 || y < 0 || x >= a.width || y >= a.height || a.solid[y * a.width + x]) return false;
    }
    return true;
  }), true, `${kind}: hitbox stays entirely walkable`);
  console.log(`PASS ${kind} collision`, JSON.stringify({ fixture, before, blocked, after: await state() }));
}
try {
  await page.goto(url);
  await ready();
  await page.locator('#btn-reset').click();
  await page.locator('#view').focus();
  await page.evaluate(() => window.__slg.frames.start());
  const initial = await state();
  await untilKey('ArrowDown', y => window.__slg.game.player.y >= y + 16, initial.y);
  assert.ok((await state()).y > initial.y, 'Keyboard moves player');
  console.log('PASS load and keyboard movement', JSON.stringify({ before: initial, after: await state() }));
  console.log('DIAGNOSTIC motion timing', JSON.stringify(await page.evaluate(() => {
    const samples = window.__slg.frames.stop().filter(s => s.dir);
    return { inputFrames: samples.length, integratedInputMs: samples.reduce((n, s) => n + s.dt * 1000, 0),
      steps: samples.reduce((n, s) => n + s.steps, 0), droppedMs: samples.reduce((n, s) => n + s.droppedMs, 0),
      framesOver50ms: samples.filter(s => s.interval > 50).length, maxFrameMs: Math.max(0, ...samples.map(s => s.interval)) };
  })));

  const landmarks = await page.evaluate(async () => (await import('/src/world/index.ts')).LANDMARKS);
  await walkTo(landmarks.homeFront);
  await shot('town');
  await appearanceUI();
  await enter('ArrowUp', 'home-family-interior');
  await blackOutside();
  await shot('home-interior');
  console.log('PASS enter home through door', JSON.stringify(await state()));

  await checkCollision('interior-wall');

  await talk();

  const exit = await page.evaluate(() => window.__slg.game.area.def.portals[0].from);
  await walkTo({ x: exit.x, y: exit.y - 1 });
  await enter('ArrowDown', 'town-main');
  const returned = await state();
  assert.equal(returned.areaId, 'town-main');
  assert.equal(returned.facing, 'down');
  assert.ok(Math.abs(returned.x - (landmarks.homeFront.x * 16 + 8)) < 3);
  assert.ok(Math.abs(returned.y - (landmarks.homeFront.y * 16 + 14)) < 24);
  console.log('PASS home exit restores town entrance', JSON.stringify(returned));

  for (const kind of ['building', 'river', 'edge']) await checkCollision(kind);

  await walkTo(landmarks.schoolDoorFront);
  await shot('school');
  console.log('PASS walk to school', JSON.stringify(await state()));
  await enter('ArrowUp', 'school-classroom-interior');
  await blackOutside();
  await shot('classroom-interior');
  console.log('PASS enter classroom', JSON.stringify(await state()));
  await talk();
  const classroomExit = await page.evaluate(() => window.__slg.game.area.def.portals.find(p => p.id === 'school-exit').from);
  await walkTo({ x: classroomExit.x, y: classroomExit.y - 1 });
  await enter('ArrowDown', 'town-main');
  const schoolReturned = await state();
  assert.equal(schoolReturned.facing, 'down');
  assert.ok(Math.abs(schoolReturned.x - (landmarks.schoolDoorFront.x * 16 + 8)) < 3);
  assert.ok(Math.abs(schoolReturned.y - (landmarks.schoolDoorFront.y * 16 + 14)) < 10);
  console.log('PASS classroom exit restores school front', JSON.stringify(schoolReturned));

  await walkTo(landmarks.shoppingStreet);
  await shot('shopping');
  await walkTo(landmarks.konbiniDoorFront);
  await enter('ArrowUp', 'shop-konbini-interior');
  await blackOutside();
  await shot('konbini-interior');
  await talk();
  const shopExit = await page.evaluate(() => window.__slg.game.area.def.portals.find(p => p.id === 'konbini-exit').from);
  await walkTo({ x: shopExit.x, y: shopExit.y - 1 });
  await enter('ArrowDown', 'town-main');
  const shopReturned = await state();
  assert.equal(shopReturned.facing, 'down');
  assert.ok(Math.abs(shopReturned.x - (landmarks.konbiniDoorFront.x * 16 + 8)) < 3);
  assert.ok(Math.abs(shopReturned.y - (landmarks.konbiniDoorFront.y * 16 + 14)) < 10);
  console.log('PASS konbini entry, conversation, and exit', JSON.stringify(shopReturned));

  for (const [name, landmark] of [['station', 'stationFront'], ['park', 'parkPlaza']]) {
    await walkTo(landmarks[landmark]);
    await shot(name);
    console.log(`PASS walk to ${name}`, JSON.stringify(await state()));
  }
  const saved = await state();
  await page.reload();
  await ready();
  assert.deepEqual(await state(), saved, 'pagehide save survives reload');
  console.log('PASS saved position restored after reload', JSON.stringify({ saved, restored: await state() }));
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await state();
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowLeft');
  assert.deepEqual(await state(), blurred, 'Blur clears held direction');
  console.log('PASS blur clears input', JSON.stringify(await state()));
  assert.deepEqual(errors, [], 'No page or console errors');
  await renderInvariants();
  console.log('PASS console and page errors: 0');
  for (const item of ['load and real keyboard movement', 'appearance UI and movement lock', 'player pixels change; NPC unchanged', 'appearance save/reset/cancel', 'home entry/conversation/exit', 'classroom entry/conversation/exit', 'konbini entry/conversation/exit', 'indoor black exterior and transition fade', 'wall occlusion and integer camera', 'building/river/edge/interior collisions', 'town/school/shopping/station/park screenshots', 'position reload and blur input clear', 'console and page errors: 0']) console.log(`SUMMARY PASS ${item}`);
} catch (error) {
  console.error('FAIL', error.message, JSON.stringify({ player: await state().catch(() => null), errors }));
  console.error('SUMMARY FAIL', error.message, JSON.stringify({ player: await state().catch(() => null), errors }));
  throw error;
} finally { await browser.close(); }
