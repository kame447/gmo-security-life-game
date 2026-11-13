import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { bagPage, openBag, closeBag, fillBag, chooseBagCategory, settledBag } from './bag-test-helpers.mjs';

assert.ok(process.env.SLG_SHOTS, 'Set SLG_SHOTS to the only directory this script may write');
const output = resolve(process.env.SLG_SHOTS);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const saved = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 720 }]) {
    const touch = viewport.width < 600;
    const fixture = await bagPage(browser, { viewport, hasTouch: touch, isMobile: touch }), page = fixture.page;
    const shot = async name => {
      await settledBag(page);
      const path = join(output, viewport.width + 'x' + viewport.height + '-' + name + '.png');
      await page.screenshot({ path });
      saved.push(path);
    };
    await openBag(page, touch); await shot('empty-bag');
    await closeBag(page, touch);
    await fillBag(page);
    await openBag(page, touch); await shot('all-items');
    if (touch) await page.locator('[data-item-id="pencil"]').tap();
    else await page.locator('[data-item-id="pencil"]').click();
    await shot('pencil-details');
    await chooseBagCategory(page, 'drink', touch); await shot('drink-pocket');
    await chooseBagCategory(page, 'other', touch); await shot('empty-pocket');
    await closeBag(page, touch); await shot('closed-map');
    assert.deepEqual(fixture.errors, []);
    await fixture.context.close();
  }
  console.log('SUMMARY', JSON.stringify({ status: 'PASS', shots: saved }));
} finally { await browser.close(); }
