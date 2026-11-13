/** Real rendering observation. Every browser context has its own disposable storage. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5218');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'A local preview is required');
const shots = resolve(process.env.SLG_SHOTS || '/private/tmp/slg-audit/town-train');
const areas = (process.env.SLG_TOWN_AREAS || 'town-main').split(',').filter(Boolean);
assert.ok(areas.length && areas.every(id => ['town-main', 'town-neighbor'].includes(id)), 'Unknown test area');
await mkdir(shots, { recursive: true });
const errors = [], blocked = [], passed = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844, touch: true }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: !!size.touch,
      isMobile: !!size.touch, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false });
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === base.origin || url.protocol === 'data:') return route.continue();
        blocked.push(url.origin); return route.abort();
      });
      await context.routeWebSocket('**', socket => {
        if (new URL(socket.url()).origin === base.origin.replace(/^http/, 'ws')) return socket.connectToServer();
        blocked.push(new URL(socket.url()).origin); void socket.close();
      });
      // Observe the real canvas's moving train paint. This only instruments this disposable context.
      await context.addInitScript(() => {
        window.__townTrainPaint = [];
        const original = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
          if (this.canvas.id === 'view' && this.fillStyle === '#273e52' && window.__slg?.renderer) {
            const stats = window.__slg.renderer.stats;
            if (x + w > stats.camX && x < stats.camX + stats.viewW && y + h > stats.camY && y < stats.camY + stats.viewH) {
              window.__townTrainPaint.push({ x, y, w, h, t: performance.now(), areaId: window.__slg.game.player.areaId });
              if (window.__townTrainPaint.length > 600) window.__townTrainPaint.shift();
            }
          }
          return original.call(this, x, y, w, h);
        };
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(base.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
      for (const areaId of areas) {
        const setup = await page.evaluate(async id => {
          const { findRailStrips } = await import('/src/town-train/service.ts');
          const { canStand, positionAt } = await import('/src/map/explorer.ts');
          const { isRailGround } = await import('/src/world/tiles.ts');
          const game = window.__slg.game, area = game.world.areas.get(id);
          if (!area) throw new Error(`Missing area ${id}`);
          const strips = findRailStrips(area);
          if (!strips.length) throw new Error(`No outdoor rail in ${id}`);
          const strip = strips[0];
          for (let y = strip.top / 16; y < strip.bottom / 16; y++) for (let x = strip.left / 16; x < strip.right / 16; x++) {
            if (!isRailGround(area.ground[y * area.width + x])) throw new Error(`Non-rail tile inside ${id} strip`);
          }
          let position;
          const center = Math.floor(area.width * 0.65);
          for (let dy = 1; dy <= 10 && !position; dy++) for (const y of [strip.top / 16 - dy, strip.bottom / 16 - 1 + dy]) {
            for (let dx = 0; dx < area.width && !position; dx++) for (const x of [center + dx, center - dx]) {
              if (x < 0 || x >= area.width || y < 0 || y >= area.height || area.portalAt.has(y * area.width + x)) continue;
              const candidate = positionAt({ areaId: id, x, y, facing: 'down' });
              if (canStand(area, candidate.x, candidate.y)) { position = candidate; break; }
            }
          }
          if (!position) throw new Error(`No safe viewing position near ${id} rail`);
          game.player = position;
          return { strip, player: { ...game.player }, stage: game.world.variant.stage, solid: Array.from(area.solid) };
        }, areaId);
        // Allow the renderer to observe an area change before checking its fade state.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForFunction(id => window.__slg.game.player.areaId === id && !window.__slg.renderer.stats.fading, areaId);
        await page.evaluate(() => { window.__townTrainPaint.length = 0; });
        const panel = page.locator('#train-travel-panel');
        assert.equal(await panel.count(), 1, 'The travel panel exists');
        assert.equal(await panel.isVisible(), false, 'Train must run without the travel panel');
        await page.waitForFunction(id => window.__townTrainPaint.some(paint => paint.areaId === id &&
          paint.x < window.__slg.renderer.stats.camX + window.__slg.renderer.stats.viewW - 60), areaId, { timeout: 16000 });
        const first = await page.evaluate(() => window.__townTrainPaint.at(-1));
        await page.screenshot({ path: resolve(shots, `${size.name}-${areaId}-01.png`) });
        await page.waitForFunction(({ areaId: id, firstX }) => window.__townTrainPaint.some(paint => paint.areaId === id && paint.x >= firstX + 20),
          { areaId, firstX: first.x }, { timeout: 4000 });
        const second = await page.evaluate(() => window.__townTrainPaint.at(-1));
        await page.screenshot({ path: resolve(shots, `${size.name}-${areaId}-02.png`) });
        assert.ok(second.x > first.x + 19, 'A real canvas train moves across frames');
        for (const draw of [first, second]) {
          assert.ok(draw.x < setup.strip.right && draw.x + draw.w > setup.strip.left, 'Paint intersects its rail strip');
          assert.ok(draw.y >= setup.strip.top && draw.y + draw.h <= setup.strip.bottom, 'Paint remains vertically on the rail');
        }
        const after = await page.evaluate(() => ({ player: { ...window.__slg.game.player }, stage: window.__slg.game.world.variant.stage,
          solid: Array.from(window.__slg.game.area.solid) }));
        assert.deepEqual(after.player, setup.player, 'A passing train does not move the player');
        assert.equal(after.stage, setup.stage, 'A passing train does not advance the life stage');
        assert.deepEqual(after.solid, setup.solid, 'Railway and crossing collisions stay unchanged');
        const name = `${size.name} ${areaId}: live train, rail bounds, closed travel panel, unchanged collision and player`;
        passed.push(name); console.log(`PASS ${name}`);
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], `Page or console errors: ${errors.join('; ')}`);
  assert.deepEqual(blocked, [], `External requests: ${blocked.join('; ')}`);
  console.log(`SUMMARY town train E2E PASS ${passed.length}/${passed.length}; images: ${shots}`);
} finally { await browser.close(); }
