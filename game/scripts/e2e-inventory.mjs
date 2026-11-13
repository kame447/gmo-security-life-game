import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { bagPage, readyBag, openBag, closeBag, fillBag, chooseBagCategory, settledBag } from './bag-test-helpers.mjs';

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const passed = [];
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
const savedState = page => page.evaluate(() => window.__slg.game.serialize());
try {
  const fixture = await bagPage(browser), page = fixture.page;
  await check('empty bag has a clear state, no stale quantity, and can close', async () => {
    await openBag(page);
    assert.equal(await page.locator('#inventory-empty').isVisible(), true);
    assert.equal(await page.locator('.bag-slot[data-item-id]').count(), 0);
    assert.equal(await page.locator('#inventory-detail-amount').isHidden(), true);
    await closeBag(page);
  });
  await fillBag(page);
  await check('icons, quantities, selection, descriptions and filtered categories', async () => {
    await openBag(page);
    assert.equal(await page.locator('.bag-slot[data-item-id]').count(), 3);
    assert.equal(await page.locator('#inventory-money').textContent(), '860 円');
    assert.equal(await page.locator('[data-item-id="notebook"] canvas').count(), 1);
    assert.equal(await page.locator('#inventory-detail-title').textContent(), 'ノート');
    assert.equal(await page.locator('#inventory-detail-quantity').textContent(), '3 こ');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#inventory-detail-title').textContent(), 'えんぴつ');
    assert.equal(await page.locator('#inventory-detail-quantity').textContent(), '6 こ');
    assert.ok((await page.locator('#inventory-detail-description').textContent()).includes('えんぴつ'));
    await chooseBagCategory(page, 'stationery');
    assert.equal(await page.locator('.bag-slot[data-item-id]').count(), 2);
    assert.equal(await page.locator('#bag-category-stationery').getAttribute('aria-selected'), 'true');
    await chooseBagCategory(page, 'drink');
    assert.equal(await page.locator('.bag-slot[data-item-id]').count(), 1);
    assert.equal(await page.locator('#inventory-detail-title').textContent(), 'みず');
    await chooseBagCategory(page, 'other');
    assert.equal(await page.locator('#inventory-empty-title').textContent(), 'このポケットは からっぽ');
    assert.equal(await page.locator('#inventory-detail-amount').isHidden(), true);
    await page.keyboard.press('KeyE');
    assert.equal(await page.locator('#inventory-panel').getAttribute('data-category'), 'all');
    assert.equal(await page.locator('#inventory-detail-title').textContent(), 'ノート');
    await closeBag(page);
  });
  await check('selection never uses items, focused close respects Enter and Space', async () => {
    const before = await savedState(page);
    for (const key of ['Enter', 'Space']) {
      await openBag(page);
      await page.locator('[data-item-id="pencil"]').focus();
      await page.keyboard.press(key);
      assert.equal(await page.locator('#inventory-panel').isVisible(), true);
      assert.deepEqual(await savedState(page), before);
      await page.locator('#inventory-close').focus();
      await page.keyboard.press(key);
      assert.equal(await page.locator('#inventory-panel').isHidden(), true);
      assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
      assert.deepEqual(await savedState(page), before);
    }
  });
  await check('movement, action, appearance and held-key input remain isolated', async () => {
    await page.keyboard.down('ArrowRight');
    try {
      await openBag(page);
      const before = await savedState(page);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('KeyZ');
      await page.locator('#btn-avatar').evaluate(button => button.click());
      await page.waitForTimeout(180);
      assert.deepEqual(await savedState(page), before);
      assert.equal(await page.locator('#avatar-panel').isHidden(), true);
      await closeBag(page);
      await page.waitForTimeout(180);
      assert.deepEqual(await savedState(page), before, 'A held movement key must stay cleared on exit');
    } finally { await page.keyboard.up('ArrowRight'); }
    await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'test', lines: ['guard'], index: 0 }; });
    await page.locator('#view').focus();
    await page.keyboard.press('KeyI');
    await page.locator('#btn-inventory').evaluate(button => button.click());
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    await page.keyboard.press('KeyZ');
    await settledBag(page);
    await page.locator('#btn-avatar').click();
    await page.keyboard.press('KeyI');
    await page.locator('#btn-inventory').evaluate(button => button.click());
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    await page.keyboard.press('Escape');
  });
  let saved;
  await check('atomic acquisition is reflected in details, saved and restored', async () => {
    const result = await page.evaluate(() => window.__slg.game.assets.apply({
      moneyDeltaYen: -100, itemDeltas: [{ itemId: 'bottled-water', quantityDelta: 1 }],
    }));
    assert.deepEqual(result, { ok: true });
    await openBag(page);
    await chooseBagCategory(page, 'drink');
    assert.equal(await page.locator('#inventory-detail-quantity').textContent(), '3 こ');
    assert.equal(await page.locator('#inventory-money').textContent(), '760 円');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    saved = await savedState(page);
    await page.reload(); await readyBag(page);
    assert.deepEqual(await savedState(page), saved);
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    await openBag(page);
    await chooseBagCategory(page, 'drink');
    assert.equal(await page.locator('#inventory-detail-quantity').textContent(), '3 こ');
    await closeBag(page);
  });
  assert.deepEqual(fixture.errors, []);
  await fixture.context.close();
  await check('old v1 and damaged asset saves preserve unrelated fields', async () => {
    const { assets: _assets, ...legacy } = saved;
    const old = await bagPage(browser, {}, legacy);
    assert.equal((await savedState(old.page)).assets.moneyYen, 1000);
    await openBag(old.page);
    assert.equal(await old.page.locator('#inventory-empty').isVisible(), true);
    assert.deepEqual(old.errors, []);
    await old.context.close();
    const damaged = await bagPage(browser, {}, { ...saved, assets: { moneyYen: -1, items: [
      { itemId: 'notebook', quantity: 2 }, { itemId: 'notebook', quantity: 3 }, { itemId: 'pencil', quantity: -1 },
    ] } });
    const repaired = await savedState(damaged.page);
    assert.deepEqual(repaired.assets, { moneyYen: 0, items: [{ itemId: 'notebook', quantity: 5 }] });
    assert.deepEqual(repaired.appearance, saved.appearance);
    assert.equal(repaired.x, saved.x); assert.equal(repaired.areaId, saved.areaId);
    assert.deepEqual(damaged.errors, []);
    await damaged.context.close();
  });
  await check('touch categories and details at 390x720 and 640x360 without overflow', async () => {
    for (const viewport of [{ width: 390, height: 720 }, { width: 640, height: 360 }]) {
      const touch = await bagPage(browser, { viewport, hasTouch: true, isMobile: true }), page = touch.page;
      await fillBag(page);
      const before = await savedState(page);
      await openBag(page, true);
      const box = await page.locator('.bag-window').boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      await page.locator('[data-item-id="pencil"]').tap();
      assert.equal(await page.locator('#inventory-detail-title').textContent(), 'えんぴつ');
      await chooseBagCategory(page, 'drink', true);
      assert.equal(await page.locator('#inventory-detail-title').textContent(), 'みず');
      await closeBag(page, true);
      assert.deepEqual(await savedState(page), before);
      assert.deepEqual(touch.errors, []);
      await touch.context.close();
    }
  });
  console.log('SUMMARY', JSON.stringify({ status: 'PASS', passed }));
} finally { await browser.close(); }
