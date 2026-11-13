import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { assertFits, closeShop, observe, openClerk, ready, restrictNetwork, seed, shopUrl, VIEWPORTS } from './shop-review-helpers.mjs';

const output = process.env.SLG_SHOTS;
assert.ok(output && path.isAbsolute(output), 'Set SLG_SHOTS to an absolute image directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let count = 0;
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, acceptDownloads: false, serviceWorkers: 'block' });
    try {
      const network = await restrictNetwork(context), page = await context.newPage(), errors = observe(page);
      const shot = async state => {
        const geometry = await assertFits(page);
        const file = path.join(output, `${viewport.name}-${state}.png`);
        await page.screenshot({ path: file }); count++;
        console.log('SHOT', JSON.stringify({ file, panel: geometry.panel, regions: geometry.regions }));
      };
      await page.goto(shopUrl(true)); await ready(page);
      await shot('01-open');
      await page.locator('.shop-product').nth(1).click(); await shot('02-selected');
      await page.locator('#shop-review').click(); await page.locator('#shop-more').click(); await shot('03-confirm');
      await page.locator('#shop-back').click(); await shot('04-cancelled');
      await seed(page, 80); await openClerk(page);
      await page.locator('.shop-product').nth(1).click(); await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await shot('05-insufficient');
      await closeShop(page); await seed(page); await openClerk(page);
      await page.locator('.shop-product').nth(1).click(); await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await page.locator('#shop-confirm').click(); await shot('06-receipt');
      assert.deepEqual(errors, []); assert.deepEqual(network.blocked, []); assert.deepEqual(network.downloads, []);
      console.log(`PASS ${viewport.name}: 6 screenshots`);
    } finally { await context.close(); }
  }
  console.log(`SUMMARY ${count}/18 screenshots`, JSON.stringify({ output }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${count}/18 screenshots; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
