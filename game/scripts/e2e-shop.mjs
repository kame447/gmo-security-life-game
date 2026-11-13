import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.SLG_URL || 'http://127.0.0.1:5182';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const errors = [];
const passed = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => ({ ...window.__slg.game.player }));
const assets = () => page.evaluate(() => window.__slg.game.assets.snapshot());
const pass = name => { passed.push(name); console.log(`PASS ${name}`); };
async function ready() {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
}
async function shot(name) { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); }
async function hold(key, ms = 180) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function walkTo(target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const g = window.__slg.game;
    return findPath(g.area, { x: Math.floor(g.player.x / 16), y: Math.floor((g.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `Reachable tile ${JSON.stringify(target)}`);
  await page.keyboard.down('Shift');
  try {
    for (const tile of route) for (const axis of ['x', 'y']) {
      const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14);
      const before = await state();
      const delta = value - before[axis];
      if (Math.abs(delta) < 2.5) continue;
      const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, value, sign, areaId }) => {
          const p = window.__slg.game.player;
          return p.areaId !== areaId || (p[axis] - value) * sign >= -1.5;
        }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 5000 });
      } finally { await page.keyboard.up(key); }
      if ((await state()).areaId !== before.areaId) return;
    }
  } finally { await page.keyboard.up('Shift'); }
}
async function face(eventKey) {
  const target = await page.evaluate(async eventKey => {
    const { findPath } = await import('/src/world/index.ts');
    const g = window.__slg.game;
    const item = g.area.interactions.find(i => i.eventKey === eventKey);
    if (!item) return null;
    const from = { x: Math.floor(g.player.x / 16), y: Math.floor((g.player.y - 4) / 16) };
    for (const [dx, dy, key] of [[0, 1, 'ArrowUp'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft'], [-1, 0, 'ArrowRight']]) {
      const tile = { x: item.x + dx, y: item.y + dy };
      if (findPath(g.area, from, tile) && !g.area.portalAt.has(tile.y * g.area.width + tile.x)) return { ...tile, key };
    }
    return null;
  }, eventKey);
  assert.ok(target, `Reachable interaction ${eventKey}`);
  await walkTo(target);
  await page.keyboard.down(target.key);
  try { await page.waitForFunction(key => window.__slg.game.facingInteraction()?.eventKey === key, eventKey, { timeout: 3000 }); }
  finally { await page.keyboard.up(target.key); }
}
async function openShop(eventKey) {
  await face(eventKey);
  await page.keyboard.press('KeyZ');
  await page.locator('#shop-panel[data-phase="browse"]').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
}
async function closeShop() {
  await page.locator('#shop-close').click();
  await page.locator('#shop-panel').waitFor({ state: 'hidden' });
}
async function enterKonbini() {
  const front = await page.evaluate(async () => (await import('/src/world/index.ts')).LANDMARKS.konbiniDoorFront);
  await walkTo(front);
  await page.keyboard.down('ArrowUp');
  try { await page.waitForFunction(() => window.__slg.game.player.areaId === 'shop-konbini-interior'); }
  finally { await page.keyboard.up('ArrowUp'); }
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
}

try {
  await page.goto(url);
  await ready();
  await page.evaluate(() => localStorage.removeItem('slg-map-save-v1'));
  await page.reload();
  await ready();
  await openShop('shopping.candy');
  const initial = await assets();
  const stationary = await state();
  assert.match(await page.locator('#shop-balance').innerText(), new RegExp(`${initial.moneyYen}円`));
  await page.keyboard.press('KeyZ');
  assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'confirm');
  assert.match(await page.locator('#shop-details').innerText(), /30円/);
  assert.match(await page.locator('#shop-details').innerText(), new RegExp(`${initial.moneyYen - 30}円`));
  assert.deepEqual(await assets(), initial, 'Selection does not buy');
  await hold('ArrowRight');
  await page.keyboard.press('KeyI');
  await page.keyboard.press('KeyP');
  await page.locator('#btn-avatar').dispatchEvent('click');
  assert.deepEqual(await state(), stationary, 'Shop blocks movement');
  assert.equal(await page.locator('#avatar-panel').isVisible(), false);
  assert.equal(await page.locator('#inventory-panel').isVisible(), false);
  assert.equal(await page.locator('#shop-panel').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('#shop-panel').waitFor({ state: 'hidden' });
  assert.deepEqual(await assets(), initial, 'Cancel does not change assets');
  pass('outdoor shop, before/after balance, cancel and exclusive input');

  for (const code of ['Enter', 'Space']) for (const button of ['shop-back', 'shop-close']) {
    await openShop('shopping.candy');
    await page.keyboard.press('KeyZ');
    for (let i = 0; i < (button === 'shop-back' ? 2 : 3); i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), button);
    await page.keyboard.press(code);
    assert.deepEqual(await assets(), initial, `${button} + ${code} cancels without purchase`);
    if (button === 'shop-back') {
      assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'browse');
      await closeShop();
    } else await page.locator('#shop-panel').waitFor({ state: 'hidden' });
  }
  for (const code of ['Enter', 'Space']) {
    await openShop('shopping.candy');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.itemId), 'bottled-water');
    await page.keyboard.press(code);
    assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'confirm');
    assert.match(await page.locator('#shop-details').innerText(), /みず/);
    assert.match(await page.locator('#shop-details').innerText(), /100円/);
    assert.deepEqual(await assets(), initial, 'Focused product only selects, without spending');
    await closeShop();
  }
  pass('Tab plus Enter/Space honors cancel, close and the focused product');

  await page.keyboard.down('KeyZ');
  await page.locator('#shop-panel').waitFor({ state: 'visible' });
  await page.keyboard.down('KeyZ'); // a real repeat of the opening key
  assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'browse');
  await page.keyboard.up('KeyZ');
  await page.keyboard.down('KeyZ'); // choose
  await page.keyboard.down('KeyZ'); // repeat must not confirm
  assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'confirm');
  assert.deepEqual(await assets(), initial);
  await page.keyboard.up('KeyZ');
  await page.keyboard.press('Enter'); // buy
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  await page.locator('#shop-buy').dispatchEvent('click');
  const bought = await assets();
  assert.equal(bought.moneyYen, initial.moneyYen - 30);
  assert.equal(bought.items.find(i => i.itemId === 'small-snack')?.quantity, 1);
  assert.equal(await page.locator('#shop-panel').getAttribute('data-phase'), 'result');
  assert.match(await page.locator('#shop-result').innerText(), /かったよ/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')).assets), bought);
  await shot('shop-purchase');
  await closeShop();
  pass('atomic purchase, key repeats, repeated confirms and immediate save');

  await page.keyboard.press('KeyI');
  await page.locator('#inventory-panel').waitFor({ state: 'visible' });
  assert.match(await page.locator('#inventory-panel').innerText(), /おかし/);
  await page.keyboard.press('KeyZ');
  assert.equal(await page.locator('#shop-panel').isVisible(), false);
  // Close through the documented common Escape key, then reload the saved purchase.
  await page.keyboard.press('Escape');
  await page.reload();
  await ready();
  assert.deepEqual(await assets(), bought);
  assert.equal(await page.locator('#shop-panel').isVisible(), false);
  pass('inventory view, panel exclusion and reload preserves the purchase');

  await openShop('shopping.vending');
  assert.match(await page.locator('#shop-list').innerText(), /みず.*120円/);
  await closeShop();
  await enterKonbini();
  for (const key of ['shopping.konbini.drinks', 'shopping.konbini.clerk']) {
    await openShop(key);
    await closeShop();
  }
  pass('vending and existing indoor drink/clerk event keys');

  await face('shopping.konbini.snacks');
  const touch = page.locator('#touch [data-act]');
  if (!await touch.isVisible()) await page.locator('#btn-touch').click();
  await touch.tap();
  await page.locator('#shop-panel').waitFor({ state: 'visible' });
  await page.locator('#shop-list button').first().tap({ force: true });
  await page.locator('#shop-buy').click();
  const indoor = await assets();
  assert.equal(indoor.moneyYen, bought.moneyYen - 50);
  assert.equal(indoor.items.find(i => i.itemId === 'small-snack')?.quantity, 2);
  await closeShop();
  await shot('shop-konbini');
  pass('touch A and item selection, click confirmation indoors');

  // Seed supported asset states through the public API; navigation still uses real keys.
  await page.evaluate(() => { const a = window.__slg.game.assets; a.changeMoney(-a.moneyYen); });
  await openShop('shopping.konbini.snacks');
  const poor = await assets();
  await page.locator('#shop-list button').first().click();
  await page.locator('#shop-buy').click();
  assert.match(await page.locator('#shop-result').innerText(), /お金が たりない/);
  assert.deepEqual(await assets(), poor);
  await closeShop();
  await page.evaluate(async () => {
    const { getItemDefinition } = await import('/src/data/items.ts');
    const a = window.__slg.game.assets;
    a.changeMoney(1000);
    a.addItem('small-snack', getItemDefinition('small-snack').maxQuantity - a.quantity('small-snack'));
  });
  const full = await assets();
  await openShop('shopping.konbini.snacks');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  assert.match(await page.locator('#shop-result').innerText(), /これいじょう もてない/);
  assert.deepEqual(await assets(), full);
  await closeShop();
  pass('insufficient balance and real item quantity limit leave both assets unchanged');

  await page.setViewportSize({ width: 640, height: 360 });
  await openShop('shopping.konbini.snacks');
  await page.locator('#shop-list button').first().click();
  await page.locator('#shop-buy').click();
  await page.locator('#shop-back').click();
  await shot('shop-small-viewport');
  await closeShop();
  pass('small viewport click controls');

  assert.deepEqual(errors, [], 'No page or console errors');
  pass('no page or console errors');
  console.log('SUMMARY', JSON.stringify({ passed, errors }));
} finally { await browser.close(); }
