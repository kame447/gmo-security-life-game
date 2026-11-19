import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
base.search = '';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

async function opening(variant = 'c') {
  await page.waitForFunction(expected => document.querySelector('#opening')?.dataset.variant === expected, variant);
  await page.locator('#opening-menu [data-id="new"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#opening').isVisible(), true);
}

try {
  await page.goto(base.href);
  await opening();
  await page.locator('#opening-skip').click();
  assert.equal(await page.locator('#opening-menu [data-id="continue"]').isDisabled(), true);
  await page.locator('#opening-menu [data-id="new"]').click();
  await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.locator('#opening').isHidden(), true);

  await page.waitForFunction(() => !!localStorage.getItem('slg-map-save-v1'), { timeout: 10000 });
  await page.reload();
  await opening();
  await page.locator('#opening-skip').click();
  assert.equal(await page.locator('#opening-menu [data-id="continue"]').isEnabled(), true);
  await page.locator('#opening-menu [data-id="continue"]').click();
  await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.locator('#opening').isHidden(), true);

  for (const variant of ['a', 'b']) {
    const preview = new URL('opening-preview.html', base);
    preview.searchParams.set('v', variant);
    await page.goto(preview.href);
    await page.waitForFunction(expected => document.querySelector('#opening')?.dataset.variant === expected, variant);
  }
  const unsafeContext = await browser.newContext({ viewport: { width: 390, height: 720 } });
  await unsafeContext.addInitScript(() => {
    localStorage.setItem('slg-map-save-v1', '{not-json');
  });
  try {
    const unsafePage = await unsafeContext.newPage();
    await unsafePage.goto(base.href);
    await unsafePage.waitForFunction(() => document.querySelector('#opening')?.dataset.variant === 'c');
    await unsafePage.locator('#opening-skip').click();
    await unsafePage.locator('#opening-menu [data-id="new"]').waitFor({ state: 'attached' });
    assert.equal(await unsafePage.locator('#opening-menu [data-id="new"]').isDisabled(), true);
    assert.equal(await unsafePage.locator('#opening-menu [data-id="continue"]').isDisabled(), true);
    assert.equal(await unsafePage.locator('#opening-error').isVisible(), true);
    await unsafePage.keyboard.press('Enter');
    assert.equal(await unsafePage.evaluate(() => localStorage.getItem('slg-map-save-v1')), '{not-json');
    assert.equal(await unsafePage.evaluate(() => Boolean(window.__slg?.game)), false);
  } finally {
    await unsafeContext.close();
  }

  assert.deepEqual(errors, []);
  console.log('PASS opening C by default, new/continue, malformed save guard, A/B previews');
} finally {
  await browser.close();
}
