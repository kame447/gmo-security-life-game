import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assets, assertFits, browse, closeShop, observe, openClerk, phase, position, ready, seed, shopUrl, tabTo } from './shop-review-helpers.mjs';

const browser = await chromium.launch({ headless: true });
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
try {
  for (const layout of ['split', 'compact']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: false });
    try {
      const page = await context.newPage(), errors = observe(page);
      await page.goto(shopUrl(layout)); await ready(page); await seed(page); await openClerk(page);
      assert.equal(await page.locator('#shop-panel').getAttribute('data-layout'), layout);
      const greeting = await page.evaluate(() => window.__slg.game.facingInteraction());
      assert.equal(await page.locator('#shop-line').innerText(), greeting.lines[0]);
      const still = await position(page), initial = await assets(page);
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown');
      for (const key of ['KeyI', 'KeyP', 'KeyC']) await page.keyboard.press(key);
      assert.deepEqual(await position(page), still);
      assert.equal(await page.locator('#avatar-panel').isVisible(), false);
      assert.deepEqual(await assets(page), initial);
      await page.keyboard.press('ArrowUp'); // Return the conversation cursor from quit to buy.
      await page.keyboard.press('KeyZ'); assert.equal(await phase(page), 'catalog');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), 'ノート');
      await page.keyboard.press('Enter'); assert.equal(await phase(page), 'confirm');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#shop-quantity').innerText(), '2');
      assert.equal(await page.locator('#shop-total').innerText(), '320円');
      assert.deepEqual(await assets(page), initial, 'Selection and quantity never charge');
      pass(`${layout}: greeting, keyboard selection, quantity and exclusive input`);

      await tabTo(page, 'shop-back'); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), initial);
      await page.locator('#shop-review').click();
      await tabTo(page, 'shop-close'); await page.keyboard.press('Space');
      assert.equal(await page.locator('#shop-panel').isVisible(), false);
      assert.deepEqual(await assets(page), initial); assert.deepEqual(await position(page), still);
      pass(`${layout}: Tab + Enter cancel and Tab + Space close never purchase`);

      await openClerk(page); await browse(page);
      await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await page.locator('#shop-panel').focus();
      await page.keyboard.down('Enter');
      await page.waitForFunction(() => document.querySelector('#shop-panel').dataset.phase === 'receipt');
      await page.keyboard.down('Enter'); await page.keyboard.down('Enter');
      await page.waitForTimeout(100); await page.keyboard.up('Enter');
      assert.equal(await phase(page), 'receipt');
      const bought = await assets(page);
      assert.equal(bought.moneyYen, initial.moneyYen - 240);
      assert.equal(bought.items.find(item => item.itemId === 'bottled-water').quantity, 5);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
      assert.deepEqual(saved.assets, bought, 'Purchase saves immediately');
      await page.locator('#shop-receipt button').click();
      assert.deepEqual(await position(page), still);
      await page.reload(); await ready(page);
      assert.deepEqual(await assets(page), bought); assert.deepEqual(await position(page), still);
      pass(`${layout}: one atomic payment, held key guard, indoor return and restore`);

      await seed(page, 10); await openClerk(page); await browse(page); await page.locator('#shop-review').click();
      const poor = await assets(page);
      assert.match(await page.locator('#shop-notice').innerText(), /110円/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      await page.locator('#shop-panel').focus(); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'confirm'); assert.deepEqual(await assets(page), poor);
      await seed(page, 2480, true); await openClerk(page); await browse(page); await page.locator('#shop-review').click();
      const full = await assets(page);
      assert.match(await page.locator('#shop-notice').innerText(), /持てない/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      await page.keyboard.press('Enter'); assert.deepEqual(await assets(page), full);
      pass(`${layout}: insufficient funds and item limit leave both assets unchanged`);

      await page.setViewportSize({ width: 390, height: 844 });
      await seed(page); await openClerk(page);
      await page.locator('#shop-start').tap();
      await page.locator('.shop-product').nth(1).tap(); await assertFits(page);
      const touchBefore = await assets(page);
      await page.locator('#shop-review').tap(); await page.locator('#shop-more').tap(); await assertFits(page);
      await page.locator('#shop-back').tap(); assert.deepEqual(await assets(page), touchBefore);
      await page.locator('#shop-review').tap(); await page.locator('#shop-confirm').tap();
      assert.equal(await phase(page), 'receipt'); await assertFits(page);
      await page.locator('#shop-receipt button').tap();
      assert.equal(await page.locator('#shop-panel').isVisible(), false);
      assert.deepEqual(await position(page), still);
      assert.deepEqual(errors, []);
      pass(`${layout}: small-screen touch selection, cancellation, purchase and return`);
    } finally { await context.close(); }
  }

  const context = await browser.newContext();
  try {
    const page = await context.newPage(), errors = observe(page);
    await page.goto(shopUrl('split')); await ready(page);
    const sentinel = await page.evaluate(() => {
      const game = window.__slg.game;
      game.assets.changeMoney(7 - game.assets.moneyYen);
      const saved = game.serialize();
      const raw = JSON.stringify(saved); localStorage.setItem('slg-map-save-v1', raw); return raw;
    });
    await page.goto(shopUrl('split', true)); await ready(page);
    assert.equal((await assets(page)).moneyYen, 2480);
    await browse(page); await page.locator('#shop-review').click(); await page.locator('#shop-confirm').click();
    await closeShop(page);
    await page.locator('#btn-reset').click();
    await page.waitForTimeout(3100);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    await page.goto(shopUrl('compact', true)); await ready(page);
    assert.equal((await assets(page)).moneyYen, 2480);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    assert.deepEqual(errors, []);
    pass('review=1 ignores the real save and blocks payment/reset/timer/pagehide writes');
  } finally { await context.close(); }
  console.log(`SUMMARY ${passed}/11 PASS`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed}/11 PASS; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
