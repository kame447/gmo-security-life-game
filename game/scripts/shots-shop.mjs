import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { assertFits, browse, closeShop, observe, openClerk, ready, seed, shopUrl } from './shop-review-helpers.mjs';

const output = process.env.SLG_SHOTS;
assert.ok(output, 'Set SLG_SHOTS to the review image directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let count = 0;
try {
  for (const layout of ['split', 'compact']) for (const [size, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, acceptDownloads: false });
    try {
      const page = await context.newPage(), errors = observe(page);
      const shot = async state => {
        await assertFits(page);
        await page.screenshot({ path: `${output}/${layout}-${size}-${state}.png` }); count++;
      };
      await page.goto(shopUrl(layout, true)); await ready(page);
      await shot('01-conversation');
      await browse(page); await shot('02-catalog');
      await page.locator('.shop-product').nth(1).click(); await shot('03-selected');
      await page.locator('#shop-review').click(); await page.locator('#shop-more').click(); await shot('04-confirm');
      await page.locator('#shop-back').click(); await shot('05-cancelled');
      await seed(page, 80); await openClerk(page); await browse(page);
      await page.locator('.shop-product').nth(1).click(); await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await shot('06-insufficient');
      await closeShop(page); await seed(page); await openClerk(page); await browse(page);
      await page.locator('.shop-product').nth(1).click(); await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await page.locator('#shop-confirm').click(); await shot('07-receipt');
      assert.deepEqual(errors, []);
      console.log(`PASS ${layout}/${size}: 7 screenshots`);
    } finally { await context.close(); }
  }
  console.log(`SUMMARY ${count} screenshots`);
} finally { await browser.close(); }
