import assert from 'node:assert/strict';

export const target = new URL(process.env.SLG_URL || 'http://127.0.0.1:5181');
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('SLG_URL must point to a local development server');
}
export const sizes = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, mobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, mobile: true },
];
export async function launchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
}
export async function session(browser, size, { temporary = true, seed = '{"review-sentinel":true}', videoDir } = {}) {
  const issues = [];
  const context = await browser.newContext({ viewport: size.viewport, isMobile: size.mobile, hasTouch: size.mobile,
    serviceWorkers: 'block', storageState: { cookies: [], origins: [{ origin: target.origin,
      localStorage: [{ name: 'slg-map-save-v1', value: typeof seed === 'string' ? seed : JSON.stringify(seed) }] }] },
    ...(videoDir ? { recordVideo: { dir: videoDir, size: size.viewport } } : {}) });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== target.origin) { issues.push(`External request: ${route.request().url()}`); return route.abort(); }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).origin === target.origin.replace(/^http/, 'ws')) socket.connectToServer();
    else { issues.push(`External socket: ${socket.url()}`); socket.close({ code: 1008, reason: 'Local test only' }); }
  });
  await context.addInitScript(() => {
    const key = 'slg-map-save-v1'; const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    window.__inventoryStorage = { reads: 0, writes: 0, peek: () => get.call(localStorage, key) };
    Storage.prototype.getItem = function(name) { if (name === key) window.__inventoryStorage.reads++; return get.call(this, name); };
    Storage.prototype.setItem = function(name, value) { if (name === key) window.__inventoryStorage.writes++; return set.call(this, name, value); };
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', error => issues.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
  page.on('download', async download => { issues.push('Unexpected download'); await download.cancel(); });
  page.on('dialog', async dialog => { issues.push('Unexpected dialog'); await dialog.dismiss(); });
  const url = new URL(target); url.searchParams.delete('bag');
  if (temporary) url.searchParams.set('review', '1'); else url.searchParams.delete('review');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForFunction(() => !!window.__slg?.game?.assets?.inventory && !!document.querySelector('#hud')?.textContent.trim());
  return { context, page, issues, close: async () => { assert.deepEqual(issues, []); await context.close(); } };
}
export const slot = (page, section, index) => page.locator(`.bag-window [data-section="${section}"][data-index="${index}"]`);
export const hudSlot = (page, index) => page.locator(`.bag-quick-hud [data-index="${index}"]`);
export const state = page => page.evaluate(() => window.__slg.game.assets.snapshot());
export const view = page => page.evaluate(() => window.__slg.game.assets.inventory());
export async function click(page, selector, mobile = false) {
  const element = typeof selector === 'string' ? page.locator(selector) : selector;
  if (mobile) await element.tap(); else await element.click();
}
export async function openBag(page, mobile = false) { await click(page, '#btn-inventory', mobile); await page.locator('.bag-window').waitFor({ state: 'visible' }); }
export async function conserved(page, before) {
  const after = await state(page); assert.equal(after.moneyYen, before.moneyYen); assert.deepEqual(after.items, before.items);
  const current = await view(page); const placed = [...current.bag, ...current.hotbar].filter(Boolean);
  assert.equal(new Set(placed.map(item => item.itemId)).size, placed.length, 'each stack has only one location');
  assert.deepEqual(placed.sort((a, b) => a.itemId.localeCompare(b.itemId)), [...after.items].sort((a, b) => a.itemId.localeCompare(b.itemId)));
}
export async function geometry(page, size) {
  const bounds = await page.locator('.bag-window').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.viewport.width + 1 && bounds.y + bounds.height <= size.viewport.height + 1);
  for (const selector of ['.bag-close', '.bag-cell', '.bag-quick-slots .bag-quick-slot']) {
    const sizes = await page.locator(selector).evaluateAll(elements => elements.map(element => {
      const r = element.getBoundingClientRect(); return { width: r.width, height: r.height };
    }));
    assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44), `${selector} has 44px targets`);
  }
}
export async function movePair(page, from, to, mobile = false) { await click(page, slot(page, ...from), mobile); await click(page, slot(page, ...to), mobile); }
export async function emptyInventory(page) {
  await page.evaluate(() => { const assets = window.__slg.game.assets; assets.apply({ itemDeltas: assets.snapshot().items.map(item => ({ itemId: item.itemId, quantityDelta: -item.quantity })) }); });
  await page.waitForFunction(() => document.querySelectorAll('.bag-window [data-item-id]:not([data-item-id=""])').length === 0);
}
