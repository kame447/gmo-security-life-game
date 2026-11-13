// Comparison screenshots. Files are written only below SLG_SHOTS.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { candidateUi, candidateUrl, clearItems, guardContext, ready, reopen } from './bag-candidate-helpers.mjs';

if (!process.env.SLG_SHOTS) throw new Error('Set SLG_SHOTS to the comparison screenshot directory');
const shots = resolve(process.env.SLG_SHOTS);
await mkdir(shots, { recursive: true });
const base = process.env.SLG_URL || 'http://127.0.0.1:5181';
const browser = await chromium.launch({ headless: true });
const errors = [];
let reference;
let count = 0;
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    for (const candidate of ['grid', 'hotbar']) {
      const ui = candidateUi[candidate];
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
      await guardContext(context, base, errors);
      const page = await context.newPage();
      await page.goto(candidateUrl(base, candidate));
      await ready(page);
      const state = await page.evaluate(() => ({ assets: window.__slg.game.assets.snapshot(), player: { ...window.__slg.game.player }, appearance: { ...window.__slg.game.appearance } }));
      reference ??= state;
      assert.deepEqual(state, reference, 'Candidates start with identical assets, position and appearance');
      const shot = async name => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: join(shots, `${candidate}-${viewport.width}x${viewport.height}-${name}.png`) });
        count++;
      };
      await shot('00-map');
      await page.locator('#btn-inventory').click();
      await page.locator(ui.panel).waitFor({ state: 'visible' });
      await shot('01-normal');
      await page.locator(ui.item('pencil')).click();
      await shot('02-pencil');
      await page.locator(ui.item('shirt')).click();
      await shot('03-shirt');
      await page.locator(ui.important).click();
      await shot('04-important');
      await clearItems(page, 'important');
      await reopen(page, ui);
      await shot('05-empty-important');
      await clearItems(page);
      await reopen(page, ui);
      await page.locator(ui.normal).click();
      await shot('06-empty-bag');
      if (candidate === 'hotbar') {
        await page.locator(ui.close).click();
        await page.reload();
        await ready(page);
        await page.locator('#btn-inventory').click();
        await page.locator(ui.item('shirt')).click();
        await page.locator('.bag-quick-slots [data-slot="4"]').click();
        await shot('07-assigned');
        await page.locator(ui.close).click();
        await page.locator('.bag-quick-hud').waitFor({ state: 'visible' });
        await shot('08-quick-hud');
      }
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(`SUMMARY ${count} screenshots; identical comparison states; browser errors, external requests and downloads: 0`);
} finally { await browser.close(); }
