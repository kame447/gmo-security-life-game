import assert from 'node:assert/strict';

export const candidateUi = {
  grid: {
    panel: '.grid-bag', normal: '[data-category="normal"]', important: '[data-category="important"]',
    items: '.grid-bag-slot[data-item-id]', name: '.grid-bag-detail h2', close: '.grid-bag-close',
    item: id => `.grid-bag-slot[data-item-id="${id}"]`,
  },
  hotbar: {
    panel: '.bag-window', normal: '[data-group="normal"]', important: '[data-group="important"]',
    items: '.bag-cell[data-item-id]:not(:disabled)', name: '.bag-detail h2', close: '.bag-close',
    item: id => `.bag-cell[data-item-id="${id}"]`,
  },
};

export function candidateUrl(base, candidate, temporary = true) {
  const url = new URL('/', base);
  url.searchParams.set('bag', candidate);
  if (temporary) url.searchParams.set('review', '1');
  return url.href;
}

/** Browser checks use only the requested local app and reject downloads. */
export async function guardContext(context, base, errors) {
  const origin = new URL(base).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    errors.push('External request: ' + url.origin);
    return route.abort();
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    if (url.origin === origin) socket.connectToServer();
    else { errors.push('External socket: ' + url.origin); socket.close(); }
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('download', download => { errors.push('Unexpected download'); void download.cancel(); });
  });
}

export async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#btn-inventory'));
  await page.locator('#view').focus();
}

export async function clearItems(page, category) {
  const result = await page.evaluate(async category => {
    const { getItemDefinition } = await import('/src/data/items.ts');
    const assets = window.__slg.game.assets;
    return assets.apply({ itemDeltas: assets.snapshot().items
      .filter(item => !category || getItemDefinition(item.itemId)?.category === category)
      .map(item => ({ itemId: item.itemId, quantityDelta: -item.quantity })) });
  }, category);
  assert.equal(result.ok, true);
}

export async function reopen(page, ui) {
  await page.locator(ui.close).click();
  await page.locator('#btn-inventory').click();
  await page.locator(ui.panel).waitFor({ state: 'visible' });
}
