import assert from 'node:assert/strict';

export const baseUrl = process.env.SLG_URL || 'http://127.0.0.1:5173';
export const position = page => page.evaluate(() => ({ ...window.__slg.game.player }));
export const assets = page => page.evaluate(() => window.__slg.game.assets.snapshot());
export const phase = page => page.locator('#shop-panel').getAttribute('data-phase');
export function shopUrl(layout, review = false) {
  const url = new URL(baseUrl); url.searchParams.set('shop', layout);
  if (review) url.searchParams.set('review', '1'); else url.searchParams.delete('review');
  return url.href;
}
export async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
}
export async function closeShop(page) {
  for (let step = 0; step < 4 && await page.locator('#shop-panel').isVisible(); step++) await page.keyboard.press('Escape');
  await page.locator('#shop-panel').waitFor({ state: 'hidden' });
}
/** Browser-only, public API fixture. Real maps/NPCs stay unchanged. */
export async function seed(page, moneyYen = 2480, atLimit = false) {
  await closeShop(page);
  await page.evaluate(async ({ moneyYen, atLimit }) => {
    const { prepareShopReview } = await import('/src/app/shop-review.ts');
    const game = window.__slg.game;
    if (!prepareShopReview(game)) throw new Error('Real indoor clerk fixture unavailable');
    game.assets.changeMoney(moneyYen - game.assets.moneyYen);
    if (atLimit) game.assets.addItem('bottled-water', 20 - game.assets.quantity('bottled-water'));
  }, { moneyYen, atLimit });
  await page.locator('#view').focus();
}
export async function openClerk(page) {
  const before = await position(page);
  await page.keyboard.press('KeyZ');
  await page.locator('#shop-panel[data-phase="choice"]').waitFor({ state: 'visible' });
  assert.deepEqual(await position(page), before, 'Talking opens without movement');
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null, 'No simultaneous normal dialog');
}
export async function browse(page) {
  await page.locator('#shop-start').click();
  assert.equal(await phase(page), 'catalog');
}
export async function tabTo(page, id) {
  for (let step = 0; step < 20; step++) {
    if (await page.evaluate(id => document.activeElement?.id === id, id)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab cannot reach ${id}`);
}
export async function assertFits(page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#shop-panel');
    const items = [...root.querySelectorAll('button, h2, h3, #shop-money, #shop-total, #shop-after, #shop-notice, #shop-dialogue, #shop-prompt')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => { const r = element.getBoundingClientRect(); return { id: element.id || element.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
    const dialogue = root.querySelector('#shop-dialogue');
    return { width: innerWidth, height: innerHeight, items, overflow: document.documentElement.scrollWidth > innerWidth,
      dialogueOverflow: dialogue.getClientRects().length > 0 && dialogue.scrollHeight > dialogue.clientHeight };
  });
  assert.equal(result.overflow, false, 'No horizontal document overflow');
  assert.equal(result.dialogueOverflow, false, 'The conversation fits its persistent frame');
  for (const item of result.items) {
    assert.ok(item.x >= 0 && item.y >= 0 && item.right <= result.width && item.bottom <= result.height,
      `Visible control fits viewport: ${JSON.stringify(item)}`);
  }
}
export function observe(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}
