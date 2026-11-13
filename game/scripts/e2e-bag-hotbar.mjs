import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SLG_URL ?? 'http://127.0.0.1:5186';
const browser = await chromium.launch({ headless: true });
let passed = 0;
async function check(label, action) {
  await action();
  passed++;
  console.log(`PASS ${label}`);
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const sentinel = '{"sentinel":"keep-review-save-isolated"}';
  await page.addInitScript(value => localStorage.setItem('slg-map-save-v1', value), sentinel);
  await page.goto(`${base}/?bag=hotbar&review=1`, { waitUntil: 'networkidle' });
  await check('review sample and HUD', async () => {
    assert.equal(await page.locator('.bag-quick-hud .bag-quick-slot').count(), 5);
    assert.ok(await page.locator('.bag-quick-hud .bag-quick-slot svg').count() > 0);
    assert.equal(await page.locator('.bag-window').isVisible(), false);
  });
  await check('keyboard selection and movement isolation', async () => {
    const before = await page.evaluate(() => ({ ...window.__slg.game.player }));
    await page.keyboard.press('i');
    assert.equal(await page.locator('.bag-window').isVisible(), true);
    const first = await page.locator('.bag-cell.is-selected').getAttribute('data-item-id');
    await page.keyboard.press('ArrowRight');
    const next = await page.locator('.bag-cell.is-selected').getAttribute('data-item-id');
    assert.notEqual(first, next);
    await page.keyboard.press('4');
    assert.equal(await page.locator('.bag-quick-slots [data-slot="3"]').getAttribute('aria-pressed'), 'true');
    const after = await page.evaluate(() => ({ ...window.__slg.game.player }));
    assert.deepEqual(after, before);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.bag-window').isVisible(), false);
    assert.equal(await page.locator('.bag-quick-hud').isVisible(), true);
  });
  await check('modal exclusivity', async () => {
    await page.locator('#btn-avatar').click();
    assert.equal(await page.locator('#avatar-panel').isVisible(), true);
    await page.keyboard.press('i');
    assert.equal(await page.locator('.bag-window').isVisible(), false);
    await page.keyboard.press('Escape');
  });
  await check('review session does not write the normal save', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
  });
  assert.deepEqual(errors, []);
  await context.close();

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touch = await touchContext.newPage();
  await touch.goto(`${base}/?bag=hotbar&review=1`, { waitUntil: 'networkidle' });
  await check('touch category, item and quick-slot selection', async () => {
    await touch.locator('#btn-inventory').tap();
    await touch.locator('[data-group="important"]').tap();
    assert.equal(await touch.locator('[data-group="important"]').getAttribute('aria-pressed'), 'true');
    const cell = touch.locator('.bag-cell:not(:disabled)').first();
    assert.equal(await cell.count(), 1);
    await cell.tap();
    await touch.locator('.bag-quick-slots [data-slot="4"]').tap();
    assert.equal(await touch.locator('.bag-quick-slots [data-slot="4"]').getAttribute('aria-pressed'), 'true');
    await touch.locator('.bag-close').tap();
    assert.equal(await touch.locator('.bag-window').isVisible(), false);
  });
  await touchContext.close();
  console.log(`SUMMARY ${passed}/${passed} PASS`);
} finally {
  await browser.close();
}
