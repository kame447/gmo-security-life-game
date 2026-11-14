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
  for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844, touch: true },
    { name: 'landscape', width: 844, height: 390, touch: true }]) {
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
        const sample = () => {
          const r = window.__slg?.renderer;
          if (r) for (const t of r.stats.trains) window.__townTrainPaint.push({ ...t, t: performance.now() });
          if (window.__townTrainPaint.length > 600) window.__townTrainPaint.splice(0, window.__townTrainPaint.length - 600);
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(base.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
      for (const areaId of areas) {
        const setup = await page.evaluate(async id => {
                    const { canStand, positionAt } = await import('/src/map/explorer.ts');
          const { isRailGround } = await import('/src/world/tiles.ts');
          const game = window.__slg.game, area = game.world.areas.get(id);
          if (!area) throw new Error(`Missing area ${id}`);
          const { TOWN_RAIL_LAYOUTS } = await import('/src/world/rail-layouts.ts');
          const layout = TOWN_RAIL_LAYOUTS[id];
          if (!layout) throw new Error(`No outdoor rail in ${id}`);
          const strip = { top: layout.northRow * 16, bottom: (layout.southRow + 1) * 16, left: 0, right: area.width * 16 };
          for (let x = 0; x < area.width; x++) if (!isRailGround(area.ground[layout.northRow * area.width + x])) throw new Error(`Non-rail tile in the north row of ${id} at ${x}`);
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
        const panel = page.locator('#train-travel-panel');
        assert.equal(await panel.count(), 1, 'The travel panel exists');
        assert.equal(await panel.isVisible(), false, 'Train must run without the travel panel');
        // 駅の区間は1線、外側は2線。下りは北の行を右へ、上りは南の行から駅の区間で北の行へ寄って左へ走る。
        const rows = await page.evaluate(async id => {
          const { TOWN_RAIL_LAYOUTS } = await import('/src/world/rail-layouts.ts');
          const l = TOWN_RAIL_LAYOUTS[id];
          return { north: (l.northRow + 1) * 16, south: (l.southRow + 1) * 16, width: window.__slg.game.world.areas.get(id).width * 16 };
        }, areaId);
        for (const direction of ['down', 'up']) {
          const sign = direction === 'down' ? 1 : -1;
          await page.evaluate(() => { window.__townTrainPaint.length = 0; });
          const pick = () => page.evaluate(d => window.__townTrainPaint.filter(p => p.direction === d).at(-1), direction);
          await page.waitForFunction(({ id, d }) => {
            const paint = window.__townTrainPaint.filter(p => p.direction === d).at(-1), { camX, viewW } = window.__slg.renderer.stats;
            return paint?.areaId === id && paint.x >= camX + 8 && paint.x + paint.w <= camX + viewW - 40;
          }, { id: areaId, d: direction }, { timeout: 20000 });
          const first = await pick();
          await page.screenshot({ path: resolve(shots, `${size.name}-${areaId}-${direction}-01.png`) });
          await page.waitForFunction(({ id, firstX, sign, d }) => {
            const paint = window.__townTrainPaint.filter(p => p.direction === d).at(-1), { camX, viewW } = window.__slg.renderer.stats;
            return paint?.areaId === id && (paint.x - firstX) * sign >= 20 && paint.x >= camX - 200 && paint.x + paint.w <= camX + viewW + 200;
          }, { id: areaId, firstX: first.x, sign, d: direction }, { timeout: 6000 });
          const second = await pick();
          await page.screenshot({ path: resolve(shots, `${size.name}-${areaId}-${direction}-02.png`) });
          assert.ok((second.x - first.x) * sign > 19, `A real canvas ${direction} train moves ${direction === 'down' ? 'right' : 'left'}`);
          for (const draw of [first, second]) {
            const foot = draw.y + draw.h;
            if (direction === 'down') assert.equal(foot, rows.north, 'The down train stands on the north row');
            else assert.ok(foot >= rows.north && foot <= rows.south, 'The up train stands between the north and south rows (points)');
            assert.ok(draw.h > 26, 'The car body is taller than the player');
          }
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
