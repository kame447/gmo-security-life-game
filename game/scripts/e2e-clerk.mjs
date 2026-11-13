import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { assets, browse, enterStore, face, hold, leave, phase, position, ready, seedClerk, talkToClerk, url } from './clerk-test-helpers.mjs';

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const errors = [], passed = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const pass = name => { passed.push(name); console.log('PASS', name); };
async function speakerUncovered(targetPage) {
  const visibility = await targetPage.locator('#clerk-speaker').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const points = [[rect.x + 4, rect.y + 4], [rect.right - 4, rect.y + 4], [rect.x + rect.width / 2, rect.y + rect.height / 2],
      [rect.x + 4, rect.bottom - 4], [rect.right - 4, rect.bottom - 4]];
    const hits = points.map(([x, y]) => {
      const painted = document.elementFromPoint(x, y);
      return { x, y, visible: painted === element || element.contains(painted), target: painted?.id || painted?.className };
    });
    return { height: rect.height, hits };
  });
  assert.ok(visibility.height >= 18 && visibility.hits.every(hit => hit.visible), `The entire clerk name must stay uncovered: ${JSON.stringify(visibility)}`);
}
try {
  await page.goto(url); await ready(page);
  await page.locator('#btn-reset').click();
  for (const key of ['shopping.candy', 'shopping.vending']) {
    await face(page, key); await page.keyboard.press('KeyZ');
    await page.locator('#dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#clerk-panel').isVisible(), false);
    while (await page.evaluate(() => !!window.__slg.game.dialog)) await page.keyboard.press('KeyZ');
  }
  pass('outdoor shopfront and vending stay on their original dialog path');
  await enterStore(page);
  for (const key of ['shopping.konbini.snacks', 'shopping.konbini.drinks']) {
    await face(page, key); await page.keyboard.press('KeyZ');
    await page.locator('#dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#clerk-panel').isVisible(), false);
    while (await page.evaluate(() => !!window.__slg.game.dialog)) await page.keyboard.press('KeyZ');
  }
  await talkToClerk(page);
  const inRoom = await position(page), initial = await assets(page);
  const original = await page.evaluate(() => window.__slg.game.facingInteraction().lines[0]);
  assert.equal(await page.locator('#clerk-line').innerText(), original);
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
  await hold(page, 'ArrowDown'); await page.keyboard.press('KeyI'); await page.keyboard.press('KeyP');
  await page.locator('#btn-avatar').dispatchEvent('click');
  assert.deepEqual(await position(page), inRoom);
  assert.equal(await page.locator('#avatar-panel').isVisible(), false);
  assert.equal(await phase(page), 'greeting');
  await page.locator('#clerk-next').click();
  assert.equal(await phase(page), 'choice');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.locator('#clerk-panel').waitFor({ state: 'hidden' });
  assert.deepEqual(await assets(page), initial); assert.deepEqual(await position(page), inRoom);
  pass('real entry, original clerk greeting, buy/quit choice and return to the same room');
  const beforeSecondApproach = await position(page);
  await talkToClerk(page);
  const buyingPosition = await position(page);
  console.log('DIAGNOSTIC second clerk approach', JSON.stringify({ beforeSecondApproach, buyingPosition }));
  await browse(page);
  assert.deepEqual(await position(page), buyingPosition, 'Opening the catalog keeps this visit stationary');
  await speakerUncovered(page);
  await page.locator('[data-item-id="bottled-water"]').click();
  assert.equal(await phase(page), 'catalog');
  assert.match(await page.locator('#clerk-item-name').innerText(), /みず/);
  assert.match(await page.locator('#clerk-item-description').innerText(), /ペットボトル/);
  assert.deepEqual(await assets(page), initial);
  await page.locator('#clerk-review').click();
  assert.deepEqual(await position(page), buyingPosition, 'Opening confirmation keeps this visit stationary');
  await speakerUncovered(page);
  assert.match(await page.locator('#clerk-after').innerText(), new RegExp(String(initial.moneyYen - 120)));
  const pay = await page.$('#clerk-pay');
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  assert.equal(await phase(page), 'receipt');
  await pay.evaluate(button => { button.click(); button.click(); });
  const bought = await assets(page);
  assert.deepEqual(await position(page), buyingPosition, 'Confirming payment keeps this visit stationary');
  assert.equal(bought.moneyYen, initial.moneyYen - 120);
  assert.equal(bought.items.find(item => item.itemId === 'bottled-water')?.quantity, 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')).assets), bought);
  await page.locator('#clerk-leave').click();
  assert.deepEqual(await position(page), buyingPosition, 'Closing returns to this conversation position');
  await page.reload(); await ready(page);
  assert.deepEqual(await assets(page), bought); assert.equal(await page.locator('#clerk-panel').isVisible(), false);
  pass('selection/details, explicit confirmation, repeat/click guard, atomic save and reload');
  for (const key of ['Enter', 'Space', 'KeyZ']) {
    await talkToClerk(page); await browse(page); await page.locator('#clerk-review').click();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'clerk-cancel');
    await page.keyboard.press(key);
    assert.equal(await phase(page), 'catalog'); assert.deepEqual(await assets(page), bought);
    await leave(page);
  }
  pass('Tab plus Enter/Space/Z on cancel never buys');
  await seedClerk(page, 10); await talkToClerk(page); await browse(page);
  const poor = await assets(page); await page.locator('#clerk-review').click(); await page.locator('#clerk-pay').click();
  assert.match(await page.locator('#clerk-line').innerText(), /お金が少し足りない/);
  assert.deepEqual(await assets(page), poor); await leave(page);
  await seedClerk(page, 1000, 20); await talkToClerk(page); await browse(page);
  const full = await assets(page); await page.locator('#clerk-review').click(); await page.locator('#clerk-pay').click();
  assert.match(await page.locator('#clerk-line').innerText(), /いっぱい持っている/);
  assert.deepEqual(await assets(page), full); await leave(page);
  pass('insufficient funds and item limit are conversational and preserve both assets');
  await seedClerk(page); await page.evaluate(async () => { (await import('/src/data/shop-catalogs.ts')).SHOP_CATALOGS[0].offers = []; });
  await talkToClerk(page); await browse(page);
  assert.equal(await page.locator('#clerk-review').isDisabled(), true);
  assert.match(await page.locator('#clerk-line').innerText(), /準備中/); await leave(page);
  pass('empty test catalog can be inspected and left without a purchase');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 720 }, hasTouch: true, isMobile: true });
  mobile.on('pageerror', error => errors.push(String(error)));
  await mobile.goto(url); await ready(mobile); await seedClerk(mobile);
  if (!await mobile.locator('#touch [data-act]').isVisible()) await mobile.locator('#btn-touch').tap();
  await mobile.locator('#touch [data-act]').tap();
  await mobile.locator('#clerk-next').tap(); await mobile.locator('#clerk-start').tap();
  await mobile.locator('[data-item-id="notebook"]').tap(); await mobile.locator('#clerk-review').tap();
  await speakerUncovered(mobile);
  const box = await mobile.locator('#clerk-panel').boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 720);
  const mobileBefore = await assets(mobile); await mobile.locator('#clerk-cancel').tap();
  await leave(mobile); assert.deepEqual(await assets(mobile), mobileBefore); await mobile.close();
  pass('390x720 touch: A, greeting, choice, product, confirm/cancel and in-room return');
  assert.deepEqual(errors, []); pass('no page or console errors');
  console.log('SUMMARY', JSON.stringify({ passed, errors }));
} finally { await browser.close(); }
