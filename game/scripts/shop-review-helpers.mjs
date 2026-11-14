import assert from 'node:assert/strict';

export const baseUrl = process.env.SLG_URL || 'http://127.0.0.1:5182';
const target = new URL(baseUrl);
assert.ok(['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Use a loopback server');
export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
];
export const position = page => page.evaluate(() => ({ ...window.__slg.game.player }));
export const assets = page => page.evaluate(() => window.__slg.game.assets.snapshot());
export const phase = page => page.locator('#shop-panel').getAttribute('data-phase');
export function shopUrl(review = false) {
  const url = new URL(baseUrl); url.searchParams.delete('shop');
  if (review) url.searchParams.set('review', '1'); else url.searchParams.delete('review');
  return url.href;
}
export async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
}
/** Observe after the whole pointer gesture and its next paint; never suppress or alter events. */
export const afterPointer = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
export async function closeShop(page) {
  for (let step = 0; step < 2 && await page.locator('#shop-panel').isVisible(); step++) await page.keyboard.press('Escape');
  await page.locator('#shop-panel').waitFor({ state: 'hidden' });
}
/** Browser-only public-API setup at the existing indoor clerk; maps/NPCs are untouched. */
export async function seed(page, moneyYen = 2480, atLimit = false) {
  await closeShop(page);
  await page.evaluate(async ({ moneyYen, atLimit }) => {
    const { prepareShopReview } = await import('/src/app/shop-review.ts');
    const game = window.__slg.game;
    if (!prepareShopReview(game)) throw new Error('Existing indoor clerk unavailable');
    if (!game.assets.changeMoney(moneyYen - game.assets.moneyYen).ok) throw new Error('Cannot prepare trial funds');
    if (atLimit && !game.assets.addItem('bottled-water', 20 - game.assets.quantity('bottled-water')).ok) throw new Error('Cannot prepare item limit');
  }, { moneyYen, atLimit });
  await page.locator('#view').focus();
}
export async function openClerk(page, touch = false) {
  const before = await position(page), initial = await assets(page);
  if (touch) { await page.locator('#touch button[data-act]').tap(); await afterPointer(page); }
  else await page.keyboard.press('KeyZ');
  await page.locator('#shop-panel[data-phase="catalog"]').waitFor({ state: 'visible' });
  assert.equal(await phase(page), 'catalog', 'Opening touch cannot also select/review a product');
  assert.deepEqual(await position(page), before, 'One talk action opens without movement');
  assert.deepEqual(await assets(page), initial, 'Opening never buys anything');
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
  assert.equal(await page.locator('#dialog').isVisible(), false);
  assert.equal(await page.locator('#shop-start, #shop-next, #shop-quit, #shop-review, #shop-close').count(), 0, 'No initial buy/advance screen or extra buttons');
  assert.equal(await page.locator('.shop-product.is-selected').evaluate(row => row === row.parentElement.firstElementChild), true, 'The cursor starts on the first product');
  for (const selector of ['#shop-conversation', '#shop-line', '#shop-products', '#shop-description', '#shop-icon svg', '#shop-money']) {
    assert.equal(await page.locator(selector).isVisible(), true, `${selector} is immediately visible`);
  }
}
export async function tabTo(page, id) {
  for (let step = 0; step < 20; step++) {
    if (await page.evaluate(id => document.activeElement?.id === id, id)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab cannot reach ${id}`);
}

/** Measure actual painted boxes and hit targets; no scroll/DOM/CSS overrides. */
export async function assertFits(page) {
  await afterPointer(page); // the renderer camera is only valid after a painted frame
  const result = await page.evaluate(() => {
    const root = document.querySelector('#shop-panel');
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const visible = element => element.getClientRects().length > 0;
    const items = [...root.querySelectorAll('button, h2, h3, #shop-money, #shop-description, #shop-line, #shop-result, #shop-notice, #shop-total, #shop-after')]
      .filter(visible).map(element => ({ id: element.id || element.textContent, ...box(element) }));
    const regions = ['.shop-wallet', '#shop-products', '#shop-conversation']
      .map(selector => root.querySelector(selector)).filter(visible).map(element => ({ id: element.id || 'shop-wallet', ...box(element) }));
    const hits = [...root.querySelectorAll('button')].filter(element => visible(element) && !element.disabled).map(element => {
      const r = element.getBoundingClientRect();
      const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 4, r.y + 4], [r.right - 4, r.y + 4],
        [r.x + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
      return { id: element.id || element.textContent, width: r.width, height: r.height,
        onTop: points.every(([x, y]) => { const top = document.elementFromPoint(x, y); return top === element || element.contains(top); }) };
    });
    return { width: innerWidth, height: innerHeight, phase: root.dataset.phase, panel: box(root), items, regions, hits,
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.equal(result.overflow, false);
  assert.equal(result.regions.length, 3, 'Wallet, product list and bar are three separate boxes');
  for (const item of [...result.regions, ...result.items]) {
    assert.ok(item.x >= 0 && item.y >= 0 && item.right <= result.width + 1 && item.bottom <= result.height + 1,
      `Visible information/control fits: ${JSON.stringify(item)}`);
  }
  for (let i = 0; i < result.regions.length; i++) for (let j = i + 1; j < result.regions.length; j++) {
    const a = result.regions[i], b = result.regions[j];
    assert.ok(Math.min(a.right, b.right) - Math.max(a.x, b.x) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) <= 1,
      `Wallet/product list/bar do not overlap: ${JSON.stringify({ a, b })}`);
  }
  for (const hit of result.hits) {
    assert.ok(hit.width >= 44 && hit.height >= 44, `Touch target is at least 44px: ${JSON.stringify(hit)}`);
    assert.equal(hit.onTop, true, `Button center and corners remain exposed: ${JSON.stringify(hit)}`);
  }
  // The clerk and the player stay visible beside the three boxes (feet and head points, from the renderer camera).
  const actors = await page.evaluate(async () => {
    const { feetAtTile } = await import('/src/core/coords.ts');
    const game = window.__slg.game, stats = window.__slg.renderer.stats, view = document.querySelector('#view').getBoundingClientRect();
    const scale = view.width / (stats.viewW * stats.zoom), up = 26 * stats.zoom * scale;
    const at = feet => { const x = view.x + (feet.x - stats.camX) * stats.zoom * scale, y = view.y + (feet.y - stats.camY) * stats.zoom * scale; return [{ x, y }, { x, y: y - up }]; };
    const clerk = game.facingInteraction(), tile = game.world.areas.get(game.player.areaId).interactions.find(item => item.eventKey === clerk?.eventKey);
    return { player: at(game.player), clerk: tile && at(feetAtTile(tile.x, tile.y)) };
  });
  for (const [who, points] of Object.entries(actors)) for (const point of points ?? []) for (const box of result.regions) {
    const covered = point.x >= box.x && point.x <= box.right && point.y >= box.y && point.y <= box.bottom;
    assert.equal(covered, false, `The ${who} is not hidden behind ${box.id}: ${JSON.stringify({ point, box })}`);
  }
  // Implementation guard for this revision, not a user-approved size specification.
  const area = result.regions.reduce((sum, box) => sum + box.width * box.height, 0) / (result.width * result.height);
  assert.ok(area <= (result.phase === 'confirm' ? .75 : .60), `The room remains visible: ${JSON.stringify({ area })}`);
  return result;
}
export function observe(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}
export async function restrictNetwork(context) {
  const blocked = [], downloads = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin || url.protocol === 'data:') return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    if (new URL(socket.url()).origin === target.origin.replace(/^http/, 'ws')) socket.connectToServer();
    else { blocked.push(new URL(socket.url()).origin); void socket.close(); }
  });
  context.on('page', page => page.on('download', download => { downloads.push(download.suggestedFilename()); void download.cancel(); }));
  return { blocked, downloads };
}
