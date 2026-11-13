import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assets, assertFits, closeShop, observe, openClerk, phase, position, ready, restrictNetwork, seed, shopUrl, tabTo, VIEWPORTS } from './shop-review-helpers.mjs';

const browser = await chromium.launch({ headless: true });
let passed = 0, crossSaveSeed;
const pass = (label, details) => { passed++; console.log(`PASS ${label}`, JSON.stringify(details ?? {})); };
const clean = (errors, network) => { assert.deepEqual(errors, []); assert.deepEqual(network.blocked, []); assert.deepEqual(network.downloads, []); };
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, acceptDownloads: false, serviceWorkers: 'block' });
    try {
      const network = await restrictNetwork(context), page = await context.newPage(), errors = observe(page);
      await page.goto(shopUrl()); await ready(page); await seed(page);
      const initial = await assets(page), still = await position(page);
      if (!crossSaveSeed) crossSaveSeed = await page.evaluate(() => window.__slg.game.serialize());
      await openClerk(page);
      const greeting = await page.evaluate(() => window.__slg.game.facingInteraction());
      assert.equal(await page.locator('#shop-line').innerText(), greeting.lines[0]);
      assert.equal(await page.locator('#shop-conversation .shop-speaker').innerText(), greeting.name);
      const initialBox = await assertFits(page);
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown');
      for (const key of ['KeyI', 'KeyP', 'KeyC']) await page.keyboard.press(key);
      assert.deepEqual(await position(page), still); assert.deepEqual(await assets(page), initial);
      assert.equal(await page.locator('#avatar-panel').isVisible(), false);
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), 'ノート');
      await page.keyboard.press('Enter'); assert.equal(await phase(page), 'confirm');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#shop-quantity').innerText(), '2');
      assert.equal(await page.locator('#shop-total').innerText(), '320円');
      assert.deepEqual(await assets(page), initial); await assertFits(page);
      pass(`${viewport.name}: one talk immediately shows speech/products/details/money, exclusive input`, initialBox.panel);

      await tabTo(page, 'shop-back'); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), initial);
      await page.locator('#shop-review').click();
      await tabTo(page, 'shop-close'); await page.keyboard.press('Space');
      assert.equal(await page.locator('#shop-panel').isVisible(), false);
      assert.deepEqual(await assets(page), initial); assert.deepEqual(await position(page), still);
      pass(`${viewport.name}: focused cancel Enter and close Space never purchase`);

      await openClerk(page); await page.locator('#shop-review').click(); await page.locator('#shop-more').click();
      await assertFits(page); await page.locator('#shop-panel').focus();
      await page.keyboard.down('Enter');
      await page.waitForFunction(() => document.querySelector('#shop-panel').dataset.phase === 'receipt');
      await page.keyboard.down('Enter'); await page.keyboard.down('Enter');
      await page.waitForTimeout(100); await page.keyboard.up('Enter');
      assert.equal(await phase(page), 'receipt'); await assertFits(page);
      const bought = await assets(page);
      assert.equal(bought.moneyYen, initial.moneyYen - 240);
      assert.equal(bought.items.find(item => item.itemId === 'bottled-water').quantity, 5);
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')).assets), bought);
      await page.locator('#shop-receipt button').click();
      assert.deepEqual(await position(page), still);
      await page.reload(); await ready(page);
      assert.deepEqual(await assets(page), bought); assert.deepEqual(await position(page), still);
      pass(`${viewport.name}: one payment, repeat guard, immediate save and indoor restore`);

      await seed(page, 10); await openClerk(page); await page.locator('#shop-review').click();
      const poor = await assets(page); await assertFits(page);
      assert.match(await page.locator('#shop-notice').innerText(), /110円/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      await page.locator('#shop-panel').focus(); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'confirm'); assert.deepEqual(await assets(page), poor);
      await seed(page, 2480, true); await openClerk(page); await page.locator('#shop-review').click();
      const full = await assets(page); await assertFits(page);
      assert.match(await page.locator('#shop-notice').innerText(), /持てない/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      await page.keyboard.press('Enter'); assert.deepEqual(await assets(page), full);
      pass(`${viewport.name}: insufficient funds and quantity limit preserve all assets`);

      await seed(page); await page.evaluate(() => {
        if (!document.querySelector('#touch').classList.contains('on')) document.querySelector('#btn-touch').click();
      });
      const touchPosition = await position(page), touchBefore = await assets(page);
      await openClerk(page, true);
      assert.equal(await phase(page), 'catalog', 'A opens only the list, including its trailing click');
      await page.locator('.shop-product').nth(1).tap(); await assertFits(page);
      assert.equal(await phase(page), 'catalog', 'A separate product tap only selects it');
      assert.deepEqual(await assets(page), touchBefore);
      await page.locator('#shop-review').tap();
      assert.equal(await phase(page), 'confirm', 'Only a separate review tap opens confirmation');
      await page.locator('#shop-more').tap(); await assertFits(page);
      await page.locator('#shop-back').tap(); assert.deepEqual(await assets(page), touchBefore);
      await page.locator('#shop-review').tap(); await page.locator('#shop-confirm').tap();
      assert.equal(await phase(page), 'receipt'); await assertFits(page);
      await page.locator('#shop-receipt button').tap();
      assert.deepEqual(await position(page), touchPosition);
      assert.equal(await page.locator('#view').evaluate(element => document.activeElement === element), true);
      await page.keyboard.down('ArrowLeft');
      try { await page.waitForFunction(x => window.__slg.game.player.x < x - 2, touchPosition.x); }
      finally { await page.keyboard.up('ArrowLeft'); }
      clean(errors, network);
      pass(`${viewport.name}: exposed touch controls, immediate selection, purchase and movement resumes`);
    } finally { await context.close(); }
  }

  // Completed thread: real-time reply delivery is independently tested; this comparison has no pending timer.
  const phone = { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123, capacityMb: 5000 }, chat: {
    v: 1, contacts: [{ id: 'save-contact', name: '保存回帰用の相手', icon: 'person' }], threads: [{
      id: 'save-thread', contactId: 'save-contact', nextSequence: 3, replyCursor: 1,
      messages: [
        { id: 'incoming-1', from: 'save-contact', text: '<img src=x onerror=alert(1)>', atMs: 1000, read: false },
        { id: 'local-1', from: 'self', text: '買い物のあとも残す', atMs: 1100, read: true },
      ], pending: [],
    }],
  } };
  const appearance = { ...crossSaveSeed.appearance, hairColor: 'black', outfitColor: 'red' };
  const crossContext = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', storageState: { cookies: [], origins: [{
    origin: new URL(shopUrl()).origin,
    localStorage: [{ name: 'slg-map-save-v1', value: JSON.stringify({ ...crossSaveSeed, phone, appearance }) }],
  }] } });
  try {
    const network = await restrictNetwork(crossContext), page = await crossContext.newPage(), errors = observe(page);
    await page.goto(shopUrl()); await ready(page);
    const originalPosition = await position(page);
    const readStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
    const checkFields = saved => {
      assert.deepEqual(saved.phone, phone); assert.deepEqual(saved.appearance, appearance);
      for (const key of ['areaId', 'x', 'y', 'facing']) assert.equal(saved[key], originalPosition[key]);
    };
    await openClerk(page); await page.locator('#shop-review').click(); await page.locator('#shop-confirm').click();
    const paid = await assets(page), afterPurchase = await readStored();
    assert.equal(paid.moneyYen, 2360); assert.deepEqual(afterPurchase.assets, paid); checkFields(afterPurchase);
    await closeShop(page);
    await page.evaluate(() => { window.__slg.game.assets.changeMoney(1); localStorage.removeItem('slg-map-save-v1'); });
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('slg-map-save-v1'); return raw && JSON.parse(raw).assets.moneyYen === 2361;
    });
    const afterTimer = await readStored(); checkFields(afterTimer); assert.equal(afterTimer.assets.moneyYen, 2361);
    await page.evaluate(() => { window.__slg.game.assets.changeMoney(1); localStorage.removeItem('slg-map-save-v1'); });
    await page.goto('about:blank'); await page.goto(shopUrl()); await ready(page);
    const afterPagehide = await readStored(); checkFields(afterPagehide); assert.equal(afterPagehide.assets.moneyYen, 2362);
    assert.deepEqual(await assets(page), afterPagehide.assets); clean(errors, network);
    pass('purchase, periodic save and real pagehide preserve assets, phone/chat, position and appearance');
  } finally { await crossContext.close(); }

  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
  try {
    const network = await restrictNetwork(context), page = await context.newPage(), errors = observe(page);
    await page.goto(shopUrl()); await ready(page);
    const sentinel = await page.evaluate(() => {
      const game = window.__slg.game; game.assets.changeMoney(7 - game.assets.moneyYen);
      const raw = JSON.stringify(game.serialize()); localStorage.setItem('slg-map-save-v1', raw); return raw;
    });
    await page.goto(shopUrl(true)); await ready(page);
    assert.equal(await phase(page), 'catalog'); assert.equal((await assets(page)).moneyYen, 2480);
    assert.equal(new URL(page.url()).searchParams.has('shop'), false);
    await assertFits(page); await page.locator('#shop-review').click(); await page.locator('#shop-confirm').click();
    await closeShop(page); await page.locator('#btn-reset').click(); await page.waitForTimeout(3100);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    await page.goto('about:blank'); await page.goto(shopUrl(true)); await ready(page);
    assert.equal(await phase(page), 'catalog'); assert.equal((await assets(page)).moneyYen, 2480);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    clean(errors, network);
    pass('review=1 directly opens the single shop and isolates real saves across payment/reset/timer/pagehide');
  } finally { await context.close(); }
  console.log(`SUMMARY ${passed}/17 PASS`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed}/17 PASS; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
