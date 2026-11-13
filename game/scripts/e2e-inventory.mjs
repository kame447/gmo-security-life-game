import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL || 'http://127.0.0.1:5181';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [], passed = [];
const state = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const assets = page => page.evaluate(() => window.__slg.game.assets.snapshot());
async function visit(options = {}, seed) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  if (seed !== undefined) await context.addInitScript(value => {
    localStorage.setItem('slg-map-save-v1', typeof value === 'string' ? value : JSON.stringify(value));
  }, seed);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await ready(page);
  return { page, context };
}
async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
}
async function check(name, fn) {
  await fn(); passed.push(name); console.log(`PASS ${name}`);
}
async function open(page) {
  await page.keyboard.press('KeyI');
  await page.locator('#inventory-panel').waitFor({ state: 'visible' });
}
async function hold(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(180);
  await page.keyboard.up(key);
}

try {
  const { page, context } = await visit();
  const start = await state(page);
  const defaults = await assets(page);
  await check('empty inventory and keyboard/button open-close', async () => {
    await open(page);
    assert.equal(await page.locator('#inventory-empty').isVisible(), true);
    assert.equal(await page.locator('#inventory-items li').count(), 0);
    assert.equal(await page.locator('#inventory-money').textContent(), `${defaults.moneyYen.toLocaleString('ja-JP')} 円`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    await page.locator('#btn-inventory').click();
    await page.locator('#inventory-close').click();
    await open(page);
    await page.keyboard.press('KeyI');
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
  });

  await check('dialog and appearance modes cannot open inventory', async () => {
    await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'テスト', lines: ['はなし。'], index: 0 }; });
    await page.waitForFunction(() => document.querySelector('#btn-inventory').disabled);
    await page.keyboard.press('KeyI');
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    assert.equal(await page.evaluate(() => window.__slg.game.dialog.index), 0);
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => !document.querySelector('#btn-avatar').disabled);
    await page.locator('#btn-avatar').click();
    await page.keyboard.press('KeyI');
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    assert.equal(await page.locator('#avatar-panel').isVisible(), true);
    await page.keyboard.press('Escape');
  });

  await check('movement, action and held input are isolated while open', async () => {
    await page.keyboard.down('ArrowRight');
    await open(page);
    const before = await state(page);
    await page.waitForTimeout(180);
    await page.keyboard.up('ArrowRight');
    await hold(page, 'ArrowDown');
    await hold(page, 'KeyW');
    await page.keyboard.press('KeyZ');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    assert.deepEqual(await state(page), before);
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
    assert.equal(await page.locator('#inventory-panel').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(180);
    assert.deepEqual(await state(page), before, 'Closing must not resume held input');
  });

  await check('modal focus stays inside and Enter closes without a game action', async () => {
    await open(page);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inventory-close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inventory-close');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#inventory-panel').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'view');
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
  });

  await check('item names, aggregated counts, descriptions and money are visible', async () => {
    const results = await page.evaluate(() => {
      const game = window.__slg.game;
      game.setAppearance({ ...game.appearance, hairColor: 'black' });
      return [game.assets.changeMoney(-100), game.assets.addItem('notebook', 2),
        game.assets.addItem('notebook', 3), game.assets.addItem('pencil', 2)];
    });
    assert.ok(results.every(result => result.ok));
    await open(page);
    assert.equal(await page.locator('#inventory-empty').isHidden(), true);
    assert.equal(await page.locator('#inventory-items li').count(), 2);
    assert.equal(await page.locator('[data-item-id="notebook"] strong').textContent(), 'ノート × 5');
    assert.ok((await page.locator('[data-item-id="notebook"] p').textContent()).includes('メモ'));
    assert.equal(await page.locator('[data-item-id="pencil"] strong').textContent(), 'えんぴつ × 2');
    assert.equal(await page.locator('#inventory-money').textContent(), `${(defaults.moneyYen - 100).toLocaleString('ja-JP')} 円`);
    if (shots) await page.screenshot({ path: `${shots}/inventory-desktop.png` });
    await page.keyboard.press('Escape');
    const before = await assets(page);
    const result = await page.evaluate(() => window.__slg.game.assets.apply({
      moneyDeltaYen: -window.__slg.game.assets.moneyYen - 1, itemDeltas: [{ itemId: 'pencil', quantityDelta: 1 }],
    }));
    assert.deepEqual(result, { ok: false, reason: 'insufficient-funds' });
    assert.deepEqual(await assets(page), before);
  });

  let saved;
  await check('pagehide save, reload, and return-to-start retain assets and appearance', async () => {
    const before = await page.evaluate(() => window.__slg.game.serialize());
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
    assert.deepEqual(saved, before);
    await page.reload(); await ready(page);
    assert.deepEqual(await page.evaluate(() => window.__slg.game.serialize()), before);
    await page.locator('#btn-reset').click();
    assert.deepEqual(await assets(page), before.assets);
    assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), before.appearance);
  });
  await context.close();

  await check('old v1 saves retain position/appearance and receive default assets', async () => {
    const { assets: _assets, ...legacy } = saved;
    const old = await visit({}, legacy);
    assert.deepEqual(await state(old.page), { areaId: legacy.areaId, x: legacy.x, y: legacy.y, facing: legacy.facing });
    assert.deepEqual(await assets(old.page), defaults);
    assert.deepEqual(await old.page.evaluate(() => window.__slg.game.appearance), legacy.appearance);
    await open(old.page);
    assert.equal(await old.page.locator('#inventory-empty').isVisible(), true);
    await old.context.close();
  });

  await check('damaged asset and position fields are repaired independently', async () => {
    const damaged = await visit({}, { ...saved, assets: { moneyYen: -1, items: [
      { itemId: 'notebook', quantity: 2 }, { itemId: 'notebook', quantity: 1 },
      { itemId: 'missing', quantity: 1 }, { itemId: 'pencil', quantity: -1 },
    ] } });
    assert.deepEqual(await assets(damaged.page), { moneyYen: 0, items: [{ itemId: 'notebook', quantity: 3 }] });
    assert.deepEqual(await state(damaged.page), { areaId: saved.areaId, x: saved.x, y: saved.y, facing: saved.facing });
    assert.deepEqual(await damaged.page.evaluate(() => window.__slg.game.appearance), saved.appearance);
    await damaged.context.close();
    const invalidPosition = await visit({}, { ...saved, x: -1 });
    assert.deepEqual(await assets(invalidPosition.page), saved.assets);
    assert.deepEqual(await state(invalidPosition.page), start);
    await invalidPosition.context.close();
    const broken = await visit({}, '{broken');
    assert.deepEqual(await state(broken.page), start);
    assert.deepEqual(await assets(broken.page), defaults);
    await broken.context.close();
  });

  await check('touch open-close and panel bounds at 390x700 and 640x360', async () => {
    for (const viewport of [{ width: 390, height: 700 }, { width: 640, height: 360 }]) {
      const mobile = await visit({ viewport, hasTouch: true }, saved);
      await mobile.page.locator('#btn-inventory').tap();
      const panel = mobile.page.locator('#inventory-panel');
      const box = await panel.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      assert.equal(await mobile.page.locator('#touch').isVisible(), false);
      if (shots) await mobile.page.screenshot({ path: `${shots}/inventory-${viewport.width}x${viewport.height}.png` });
      await mobile.page.locator('#inventory-close').tap();
      assert.equal(await panel.isHidden(), true);
      await mobile.context.close();
    }
  });
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log('SUMMARY', JSON.stringify({ passed, errors }));
} finally {
  await browser.close();
}
