import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { candidateUi, candidateUrl, guardContext, ready } from './bag-candidate-helpers.mjs';

const base = process.env.SLG_URL || 'http://127.0.0.1:5181';
const browser = await chromium.launch({ headless: true });
const errors = [];
const ui = candidateUi.grid;
let passed = 0;
async function check(label, action) {
  await action(); passed++; console.log('PASS ' + label);
}
const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const assets = page => page.evaluate(() => window.__slg.game.assets.snapshot());

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await guardContext(context, base, errors);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const key = 'slg-map-save-v1';
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    write.call(localStorage, key, '{"sentinel":"normal-save-untouched"}');
    const probe = window.__saveProbe = { reads: 0, writes: 0, value: () => read.call(localStorage, key) };
    Storage.prototype.getItem = function(name) { if (name === key) probe.reads++; return read.call(this, name); };
    Storage.prototype.setItem = function(name, value) { if (name === key) probe.writes++; return write.call(this, name, value); };
  });
  await page.goto(candidateUrl(base, 'grid'));
  await ready(page);
  const originalAssets = await assets(page);
  await check('shared sample, one mounted panel and visible quantities', async () => {
    assert.equal(originalAssets.moneyYen, 2480);
    assert.equal(await page.locator('#btn-inventory').count(), 1);
    assert.equal(await page.locator('.bag-window').count(), 0);
    await page.keyboard.press('KeyI');
    await page.locator(ui.panel).waitFor({ state: 'visible' });
    assert.equal(await page.locator(ui.items).count(), 8);
    assert.equal(await page.locator('#grid-bag-money').textContent(), '2,480');
    assert.equal(await page.locator(ui.name).textContent(), 'ノート');
    assert.equal(await page.locator('.grid-bag-detail-count').textContent(), '× 2');
  });

  await check('keyboard selection stays inside the bag and does not change assets', async () => {
    const before = await player(page);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(ui.name).textContent(), 'えんぴつ');
    assert.equal(await page.locator('.grid-bag-detail-count').textContent(), '× 12');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowDown');
    assert.deepEqual(await player(page), before);
    assert.deepEqual(await assets(page), originalAssets);
    await page.keyboard.press('BracketRight');
    assert.equal(await page.locator(ui.important).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator(ui.items).count(), 2);
    await page.keyboard.press('ArrowDown'); // Move from the category button into its grid.
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(ui.name).textContent(), 'カード');
  });

  await check('focus is trapped and focused close receives Enter and Space', async () => {
    await page.locator(ui.close).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#inventory-panel').evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(ui.close).evaluate(node => node === document.activeElement), true);
    for (const key of ['Enter', 'Space']) {
      await page.locator(ui.close).focus();
      await page.keyboard.press(key);
      assert.equal(await page.locator(ui.panel).isVisible(), false);
      assert.equal(await page.locator('#view').evaluate(node => node === document.activeElement), true);
      assert.deepEqual(await assets(page), originalAssets);
      await page.keyboard.press('KeyI');
    }
    await page.keyboard.press('Escape');
  });

  await check('appearance and dialogue prevent opening the bag', async () => {
    await page.locator('#btn-avatar').click();
    await page.keyboard.press('KeyI');
    assert.equal(await page.locator(ui.panel).isVisible(), false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__slg.game.dialog = { speaker: '確認', lines: ['確認中'], index: 0 }; });
    await page.waitForFunction(() => document.querySelector('#btn-inventory').disabled);
    await page.locator('#view').focus();
    await page.keyboard.press('KeyI');
    assert.equal(await page.locator(ui.panel).isVisible(), false);
    await page.evaluate(() => { window.__slg.game.dialog = null; });
    await page.waitForFunction(() => !document.querySelector('#btn-inventory').disabled);
  });

  await check('review sessions neither read nor write the normal save through any save trigger', async () => {
    await page.locator('#btn-avatar').click();
    await page.locator('[data-field="hairColor"] [data-step="1"]').click();
    await page.locator('#avatar-ok').click();
    await page.locator('#btn-reset').click();
    await page.evaluate(() => { window.__slg.game.assets.changeMoney(7); window.dispatchEvent(new Event('pagehide')); });
    await page.waitForTimeout(3200);
    assert.deepEqual(await page.evaluate(() => ({ reads: window.__saveProbe.reads, writes: window.__saveProbe.writes, value: window.__saveProbe.value() })),
      { reads: 0, writes: 0, value: '{"sentinel":"normal-save-untouched"}' });
  });
  await context.close();

  await check('normal sessions persist and restore wallet and inventory', async () => {
    const normalContext = await browser.newContext();
    await guardContext(normalContext, base, errors);
    const normal = await normalContext.newPage();
    await normal.goto(candidateUrl(base, 'grid', false));
    await ready(normal);
    assert.deepEqual(await assets(normal), { moneyYen: 1000, items: [] });
    await normal.evaluate(() => {
      window.__slg.game.assets.apply({ moneyDeltaYen: -320, itemDeltas: [{ itemId: 'notebook', quantityDelta: 4 }, { itemId: 'shirt', quantityDelta: 1 }] });
      window.dispatchEvent(new Event('pagehide'));
    });
    const expected = await assets(normal);
    await normal.reload();
    await ready(normal);
    assert.deepEqual(await assets(normal), expected);
    await normal.locator('#btn-inventory').click();
    assert.equal(await normal.locator('#grid-bag-money').textContent(), '680');
    assert.equal(await normal.locator('.grid-bag-detail-count').textContent(), '× 4');
    await normalContext.close();
  });

  await check('390x844 touch selects categories, clothes and closes within the viewport', async () => {
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await guardContext(touchContext, base, errors);
    const touch = await touchContext.newPage();
    await touch.goto(candidateUrl(base, 'grid'));
    await ready(touch);
    await touch.locator('#btn-inventory').tap();
    await touch.locator(ui.important).tap();
    await touch.locator(ui.item('card')).tap();
    assert.equal(await touch.locator(ui.name).textContent(), 'カード');
    await touch.locator(ui.normal).tap();
    await touch.locator(ui.item('shirt')).tap();
    assert.equal(await touch.locator(ui.name).textContent(), 'シャツ');
    const bounds = await touch.locator(ui.panel).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
    await touch.locator(ui.close).tap();
    assert.equal(await touch.locator(ui.panel).isVisible(), false);
    await touchContext.close();
  });
  assert.deepEqual(errors, []);
  console.log(`SUMMARY ${passed}/${passed} PASS; browser errors, external requests and downloads: 0`);
} finally { await browser.close(); }
