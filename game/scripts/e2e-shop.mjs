import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { afterPointer, assets, assertFits, closeShop, observe, openClerk, phase, position, ready, restrictNetwork, seed, shopUrl, tabTo, VIEWPORTS } from './shop-review-helpers.mjs';

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
      const hello = await page.locator('#shop-line').innerText();
      assert.ok(hello.length > 0 && hello.length <= 12 && greeting.lines[0].startsWith(hello), `The greeting is the clerk's short first sentence: ${hello}`);
      assert.equal(await page.locator('#shop-conversation .shop-speaker').innerText(), greeting.name);
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), '水');
      const firstDescription = await page.locator('#shop-description').textContent();
      const initialBox = await assertFits(page);
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(150); await page.keyboard.up('ArrowDown');
      for (const key of ['KeyI', 'KeyP', 'KeyC']) await page.keyboard.press(key);
      assert.deepEqual(await position(page), still); assert.deepEqual(await assets(page), initial);
      assert.equal(await page.locator('#avatar-panel').isVisible(), false);
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), 'ノート');
      const moved = await page.locator('#shop-description').innerText();
      assert.ok(moved.length > 0 && moved !== firstDescription, 'Moving the cursor switches the bar to that product');
      assert.equal(await page.locator('#shop-line').isVisible(), false, 'The greeting gives way to the description');
      assert.equal(await phase(page), 'catalog', 'Moving the cursor never opens the purchase check');
      await page.keyboard.press('Enter'); assert.equal(await phase(page), 'confirm');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#shop-quantity').innerText(), '2');
      assert.equal(await page.locator('#shop-total').innerText(), '320円');
      assert.deepEqual(await assets(page), initial); await assertFits(page);
      pass(`${viewport.name}: one talk immediately shows speech/products/details/money, exclusive input`, initialBox.regions);

      await tabTo(page, 'shop-back'); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), initial);
      await page.locator('.shop-product.is-selected').click(); assert.equal(await phase(page), 'confirm', 'A second press on the cursor row opens the check');
      await page.keyboard.press('Escape'); assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), initial);
      await tabTo(page, 'shop-exit'); await page.keyboard.press('Space');
      assert.equal(await page.locator('#shop-panel').isVisible(), false);
      assert.deepEqual(await assets(page), initial); assert.deepEqual(await position(page), still);
      pass(`${viewport.name}: focused cancel Enter and close Space never purchase`);

      await openClerk(page); await page.keyboard.press('Enter'); await page.locator('#shop-more').click();
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
      // The next decisions only acknowledge the clerk's reply and never start another payment.
      await page.keyboard.press('Enter'); assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), bought);
      await page.keyboard.press('Escape'); await page.locator('#shop-panel').waitFor({ state: 'hidden' });
      assert.deepEqual(await position(page), still);
      await page.reload(); await ready(page);
      assert.deepEqual(await assets(page), bought); assert.deepEqual(await position(page), still);
      pass(`${viewport.name}: one payment, repeat guard, immediate save and indoor restore`);

      await seed(page, 10); await openClerk(page); await page.locator('.shop-product.is-selected').click();
      const poor = await assets(page); await assertFits(page);
      assert.match(await page.locator('#shop-notice').innerText(), /110円/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      await page.locator('#shop-panel').focus(); await page.keyboard.press('Enter');
      assert.equal(await phase(page), 'confirm'); assert.deepEqual(await assets(page), poor);
      await seed(page, 2480, true); await openClerk(page); await page.locator('.shop-product.is-selected').click();
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
      await page.locator('.shop-product').nth(1).tap();
      assert.equal(await phase(page), 'confirm', 'Only a second tap on the cursor row opens confirmation');
      await page.locator('#shop-more').tap(); await assertFits(page);
      await page.locator('#shop-back').tap(); assert.deepEqual(await assets(page), touchBefore);
      await page.locator('.shop-product').nth(1).tap(); await page.locator('#shop-confirm').tap();
      assert.equal(await phase(page), 'receipt'); await assertFits(page);
      await page.locator('#shop-exit').tap();
      await page.locator('#shop-panel').waitFor({ state: 'hidden' });
      assert.deepEqual(await position(page), touchPosition);
      assert.equal(await page.locator('#view').evaluate(element => document.activeElement === element), true);
      // The shared controller drops held input on the frame after a panel closes; press after that frame.
      await afterPointer(page);
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
    await openClerk(page); await page.locator('.shop-product.is-selected').click(); await page.locator('#shop-confirm').click();
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
    await assertFits(page); await page.locator('.shop-product.is-selected').click(); await page.locator('#shop-confirm').click();
    await closeShop(page); await page.locator('#btn-reset').click(); await page.waitForTimeout(3100);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    await page.goto('about:blank'); await page.goto(shopUrl(true)); await ready(page);
    assert.equal(await phase(page), 'catalog'); assert.equal((await assets(page)).moneyYen, 2480);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    clean(errors, network);
    pass('review=1 directly opens the single shop and isolates real saves across payment/reset/timer/pagehide');
  } finally { await context.close(); }
  // Test-only longer list: the catalogue data file is untouched; extra offers exist only in this page.
  const longContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, acceptDownloads: false, serviceWorkers: 'block' });
  try {
    const network = await restrictNetwork(longContext), page = await longContext.newPage(), errors = observe(page);
    await page.goto(shopUrl()); await ready(page); await seed(page);
    await page.evaluate(async () => {
      const { SHOP_CATALOGS } = await import('/src/data/shop-catalogs.ts');
      SHOP_CATALOGS[0].offers.push({ itemId: 'small-snack', priceYen: 100 }, { itemId: 'hand-towel', priceYen: 300 },
        { itemId: 'bread', priceYen: 130 }, { itemId: 'umbrella', priceYen: 500 }, { itemId: 'shirt', priceYen: 980 });
    });
    const before = await assets(page);
    await openClerk(page);
    const mark = page.locator('#shop-below'), rowInside = () => page.evaluate(() => {
      const row = document.querySelector('.shop-product.is-selected').getBoundingClientRect(), list = document.querySelector('#shop-products').getBoundingClientRect();
      return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
    });
    assert.equal(await page.locator('.shop-product').count(), 9);
    assert.equal(await mark.isVisible(), true, 'The mark shows that rows continue below');
    for (let step = 0; step < 8; step++) { await page.keyboard.press('ArrowDown'); assert.equal(await rowInside(), true, 'The cursor row stays inside the list'); }
    assert.equal(await page.locator('.shop-product.is-selected').getAttribute('id'), 'shop-exit');
    await page.waitForFunction(() => document.querySelector('#shop-below').hidden); // scroll event after the last row
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), '水');
    await mark.waitFor({ state: 'visible' }); assert.equal(await rowInside(), true);
    assert.deepEqual(await assets(page), before); clean(errors, network);
    pass('a list longer than its box scrolls with the cursor and shows the mark only while rows continue below');
  } finally { await longContext.close(); }
  // The bar: greeting alone first, then the description after the cursor moves or the greeting time passes.
  // Time is moved with the page's virtual clock, never by waiting.
  const timedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: 'block' });
  try {
    const network = await restrictNetwork(timedContext), page = await timedContext.newPage(), errors = observe(page);
    await page.clock.install();
    await page.goto(shopUrl()); await ready(page); await seed(page);
    const bar = () => page.evaluate(() => {
      const text = selector => { const element = document.querySelector(selector); return element.getClientRects().length > 0 ? element.textContent : ''; };
      return { phase: document.querySelector('#shop-panel').dataset.phase, speaker: text('#shop-conversation .shop-speaker'), line: text('#shop-line'),
        result: text('#shop-result'), description: text('#shop-description'), icon: document.querySelector('#shop-icon').getClientRects().length > 0,
        checkout: document.querySelector('#shop-checkout').getClientRects().length > 0, cursor: document.querySelector('.shop-product.is-selected .shop-product-name').textContent };
    });
    const onlyGreeting = async label => { const now = await bar();
      assert.ok(now.line && now.speaker && !now.description && !now.result && !now.icon && !now.checkout, `${label}: the greeting stands alone ${JSON.stringify(now)}`); };
    const onlyDescription = async (label, name) => { const now = await bar();
      assert.ok(now.cursor === name && now.description && now.icon && !now.line && !now.speaker && !now.result && !now.checkout, `${label}: only the description of ${name} ${JSON.stringify(now)}`); };

    await openClerk(page); await onlyGreeting('right after the talk');
    await page.clock.fastForward(1500); await onlyGreeting('before the greeting time');
    await page.clock.fastForward(600); await onlyDescription('after the greeting time', '水');
    await page.keyboard.press('ArrowDown'); await onlyDescription('cursor after the switch', 'ノート');
    pass('bar: greeting alone, then the first product after the greeting time, then follows the cursor');

    await closeShop(page); await openClerk(page); await onlyGreeting('reopened');
    await page.keyboard.press('ArrowDown'); await onlyDescription('cursor before the greeting time', 'ノート');
    await page.clock.fastForward(2500); await onlyDescription('the greeting time passes after an early move', 'ノート');
    pass('bar: an early cursor move switches at once and the timer does not switch again');

    await closeShop(page); await openClerk(page); await page.keyboard.press('Enter');
    await page.clock.fastForward(2500);
    let now = await bar(); assert.ok(now.phase === 'confirm' && now.checkout && !now.line && !now.description && !now.result, `The timer leaves the purchase check alone ${JSON.stringify(now)}`);
    await page.keyboard.press('Enter'); await page.clock.fastForward(2500);
    now = await bar(); assert.ok(now.phase === 'receipt' && now.result && now.speaker && !now.line && !now.description && !now.icon && !now.checkout, `The clerk's reply stands alone ${JSON.stringify(now)}`);
    await page.keyboard.press('Enter'); await onlyDescription('after acknowledging the reply', '水');
    pass('bar: the timer never overwrites the purchase check or the reply; the reply and description do not mix');

    await closeShop(page); await openClerk(page); await page.clock.fastForward(1000);
    await closeShop(page); await openClerk(page); await page.clock.fastForward(1500);
    await onlyGreeting('reopened while the earlier timer would be due');
    await page.clock.fastForward(600); await onlyDescription('its own greeting time', '水');
    pass('bar: every visit starts from the greeting with a fresh timer');

    await closeShop(page); await openClerk(page); await closeShop(page); await page.clock.fastForward(3000);
    assert.equal(await page.locator('#shop-panel').isVisible(), false); assert.deepEqual(errors, []);
    pass('bar: no timer is left after closing');

    await openClerk(page); await page.keyboard.press('ArrowUp');
    const empty = async label => { const now = await bar();
      assert.ok(now.cursor === '店を出る' && !now.line && !now.speaker && !now.description && !now.result && !now.icon && !now.checkout, `${label}: the bar is empty on the leaving row ${JSON.stringify(now)}`); };
    await empty('cursor on the leaving row'); await page.clock.fastForward(2500); await empty('after the greeting time');
    await page.keyboard.press('ArrowDown'); await onlyDescription('back on a product', '水');
    clean(errors, network);
    pass('bar: the leaving row shows nothing, before and after the greeting time');
  } finally { await timedContext.close(); }
  console.log(`SUMMARY ${passed}/24 PASS`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed}/24 PASS; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
