import assert from 'node:assert/strict';

export const bagUrl = process.env.SLG_URL || 'http://127.0.0.1:5181';
export async function readyBag(page) {
  await page.waitForFunction(() => !!window.__slg?.game?.assets);
  await page.locator('#view').focus();
}
export async function bagPage(browser, options = {}, seed) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  if (seed !== undefined) await context.addInitScript(value => localStorage.setItem('slg-map-save-v1', JSON.stringify(value)), seed);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(bagUrl);
  await readyBag(page);
  return { page, context, errors };
}
/** Fixture only: no prices or starting possessions are adopted by these screenshot values. */
export async function fillBag(page) {
  const results = await page.evaluate(() => {
    const assets = window.__slg.game.assets;
    const results = assets.snapshot().items.map(stack => assets.removeItem(stack.itemId, stack.quantity));
    results.push(assets.changeMoney(860 - assets.moneyYen));
    results.push(assets.addItem('notebook', 3), assets.addItem('pencil', 6), assets.addItem('bottled-water', 2));
    return results;
  });
  assert.ok(results.every(result => result.ok), 'Bag fixture must use successful public asset operations');
}
export async function openBag(page, touch = false) {
  if (touch) await page.locator('#btn-inventory').tap();
  else { await page.locator('#view').focus(); await page.keyboard.press('KeyI'); }
  await page.locator('#inventory-panel').waitFor({ state: 'visible' });
}
export async function closeBag(page, touch = false) {
  if (touch) await page.locator('#inventory-close').tap();
  else await page.keyboard.press('Escape');
  await page.locator('#inventory-panel').waitFor({ state: 'hidden' });
}
export async function chooseBagCategory(page, category, touch = false) {
  const button = page.locator('#inventory-categories [data-category="' + category + '"]');
  if (touch) await button.tap(); else await button.click();
}
export async function settledBag(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
