import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { browse, leave, ready, seedClerk, talkToClerk, url } from './clerk-test-helpers.mjs';

assert.ok(process.env.SLG_SHOTS, 'SLG_SHOTS must name the only output directory');
const directory = resolve(process.env.SLG_SHOTS);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const files = [], errors = [];
try {
  for (const [size, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 720 }]]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url); await ready(page); await seedClerk(page);
    const shot = async name => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = join(directory, `${size}-${name}.png`); await page.screenshot({ path: file }); files.push(file);
    };
    await talkToClerk(page); await shot('01-greeting');
    await page.locator('#clerk-next').click(); await shot('02-buy-or-quit');
    await page.locator('#clerk-start').click(); await shot('03-products');
    await page.locator('[data-item-id="bottled-water"]').click(); await shot('04-selection-details');
    await page.locator('#clerk-review').click(); await shot('05-confirmation');
    await page.locator('#clerk-pay').click(); await shot('06-receipt');
    await page.locator('#clerk-leave').click(); await shot('07-back-in-store');
    await seedClerk(page, 10); await talkToClerk(page); await browse(page);
    await page.locator('#clerk-review').click(); await page.locator('#clerk-pay').click(); await shot('08-insufficient-funds');
    await leave(page); await seedClerk(page);
    await page.evaluate(async () => { (await import('/src/data/shop-catalogs.ts')).SHOP_CATALOGS[0].offers = []; });
    await talkToClerk(page); await browse(page); await shot('09-test-empty-catalog');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('SUMMARY', JSON.stringify({ files, errors }));
} finally { await browser.close(); }
