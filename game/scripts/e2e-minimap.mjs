import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5193';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let passed = 0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

try {
  for (const [name, viewport, touch] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__mapTexts = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (this.canvas.id === 'full-map-canvas') window.__mapTexts.push({ text, font: this.font });
        return fillText.call(this, text, ...args);
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__slg?.game);
      const mini = page.locator('#minimap-button');
      await mini.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'town-main');
      if (!await page.locator('#touch').evaluate(node => node.classList.contains('on'))) await page.locator('#btn-touch').click();

      await check(`${name}: mini map avoids controls, location and dialog`, async () => {
        const map = await mini.boundingBox();
        assert.ok(map && map.x >= 0 && map.y >= 0 && map.x + map.width <= viewport.width && map.y + map.height <= viewport.height);
        for (const selector of ['#menu', '#hud', '#hint', '#touch button']) {
          for (const element of await page.locator(selector).all()) {
            if (!await element.isVisible()) continue;
            const box = await element.boundingBox();
            assert.ok(box && !overlaps(map, box), `${name}: minimap overlaps ${selector}`);
          }
        }
        await page.evaluate(() => {
          const game = window.__slg.game;
          const npc = game.area.interactions.find(item => item.id === 'neighbor-grandma');
          game.dialog = { speaker: npc.name, lines: [...npc.lines], index: 0 };
        });
        await page.locator('#dialog').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.querySelector('#minimap-button').disabled);
        assert.equal(overlaps(map, await page.locator('#dialog').boundingBox()), false);
        await mini.evaluate(element => element.click());
        assert.equal(await page.locator('#full-map-overlay').isVisible(), false);
        await page.evaluate(() => { window.__slg.game.dialog = null; });
        await page.locator('#dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => !document.querySelector('#minimap-button').disabled);
      });

      await check(`${name}: movement changes local view`, async () => {
        const before = await mini.locator('canvas').evaluate(canvas => canvas.toDataURL());
        const y = await page.evaluate(() => window.__slg.game.player.y);
        await page.locator('#view').focus();
        await page.keyboard.down('ArrowDown');
        try { await page.waitForFunction(start => window.__slg.game.player.y > start + 5, y, { timeout: 8000 }); }
        finally { await page.keyboard.up('ArrowDown'); }
        await page.waitForFunction(previous => document.querySelector('#minimap-button canvas').toDataURL() !== previous, before);
        await page.locator('#btn-reset').click();
      });

      await check(`${name}: full map freezes game and closes safely`, async () => {
        await page.evaluate(() => {
          const game = window.__slg.game, original = game.update.bind(game);
          window.__minimapProbe = { updates: 0, events: 0 };
          game.update = (...args) => { window.__minimapProbe.updates++; return original(...args); };
          game.on(() => { window.__minimapProbe.events++; });
        });
        if (touch) await mini.tap(); else await mini.click();
        await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#full-map-canvas').getAttribute('data-area-id'), 'town-main');
        await page.waitForFunction(() => document.querySelector('#full-map-canvas')?.dataset.labelCount === '12');
        assert.equal(await page.locator('#full-map-canvas').getAttribute('data-marker-count'), '12');
        const labels = await page.evaluate(() => ({
          names: [...window.__slg.game.world.facilities.values()].filter(facility => facility.areaId === 'town-main').map(facility => facility.name),
          painted: window.__mapTexts,
          canvasWidth: document.querySelector('#full-map-canvas').width,
          displayWidth: document.querySelector('#full-map-canvas').clientWidth,
        }));
        assert.ok(Math.abs(labels.canvasWidth - labels.displayWidth) <= 1, 'labels use screen pixels, without shrinking on phones');
        for (const text of labels.names) assert.ok(labels.painted.some(label => label.text === text && label.font.includes('13px')), `missing readable name ${text}`);
        const full = await page.locator('#full-map-canvas').boundingBox();
        const close = await page.locator('#full-map-close').boundingBox();
        assert.ok(full && full.x >= 0 && full.y >= 0 && full.x + full.width <= viewport.width && full.y + full.height <= viewport.height);
        assert.ok(close && close.x >= 0 && close.y >= 0 && close.x + close.width <= viewport.width && close.y + close.height <= viewport.height);
        await page.waitForTimeout(120);
        const before = await page.evaluate(() => ({ player: { ...window.__slg.game.player }, ...window.__minimapProbe }));
        assert.equal(await mini.locator('canvas').evaluate(canvas => `${canvas.width}x${canvas.height}`), '192x128');
        await page.keyboard.down('ArrowUp');
        await page.keyboard.press('z');
        await page.locator('#full-map-canvas').click();
        await page.waitForTimeout(180);
        assert.deepEqual(await page.evaluate(() => ({ player: { ...window.__slg.game.player }, ...window.__minimapProbe })), before);
        assert.equal(await page.locator('#full-map-overlay').isVisible(), true);
        if (name === 'desktop') await page.keyboard.press('Escape');
        else if (name === 'portrait') await page.locator('#full-map-close').tap();
        else await page.touchscreen.tap(3, 3);
        await page.locator('#full-map-overlay').waitFor({ state: 'hidden' });
        await page.waitForTimeout(120);
        assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), before.player);
        await page.keyboard.up('ArrowUp');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'view');
      });

      await check(`${name}: real portal changes the map and returns outside`, async () => {
        const town = await mini.locator('canvas').evaluate(canvas => canvas.toDataURL());
        await page.locator('#view').focus();
        await page.keyboard.down('ArrowUp');
        try { await page.waitForFunction(() => window.__slg.game.player.areaId === 'home-family-interior', null, { timeout: 10000 }); }
        finally { await page.keyboard.up('ArrowUp'); }
        await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'home-family-interior');
        assert.notEqual(await mini.locator('canvas').evaluate(canvas => canvas.toDataURL()), town);
        if (touch) await mini.tap(); else await mini.click();
        await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#full-map-canvas').getAttribute('data-area-id'), 'home-family-interior');
        assert.equal(await page.locator('#full-map-canvas').getAttribute('data-marker-count'), '0');
        assert.equal(await page.locator('#full-map-canvas').getAttribute('data-label-count'), '0');
        assert.ok(!(await page.locator('#full-map-canvas').getAttribute('aria-label')).includes('しょうがっこう'));
        await page.locator('#full-map-close').click();
        await page.keyboard.down('ArrowDown');
        try { await page.waitForFunction(() => window.__slg.game.player.areaId === 'town-main', null, { timeout: 10000 }); }
        finally { await page.keyboard.up('ArrowDown'); }
        await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'town-main');
      });

      await check(`${name}: appearance and full map are exclusive`, async () => {
        await page.locator('#btn-avatar').click();
        await page.locator('#avatar-panel').waitFor({ state: 'visible' });
        assert.equal(await mini.isVisible(), false);
        await mini.evaluate(element => element.click());
        assert.equal(await page.locator('#full-map-overlay').isVisible(), false);
        await page.keyboard.press('Escape');
        await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
        await mini.waitFor({ state: 'visible' });
      });
      assert.deepEqual(errors, []);
    } catch (error) {
      if (shots) await page.screenshot({ path: `${shots}/${name}-failure.png` });
      throw error;
    } finally { await context.close(); }
  }
  console.log(`SUMMARY ${passed}/${passed} PASS`);
} finally { await browser.close(); }
