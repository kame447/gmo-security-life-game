import assert from 'node:assert/strict';

export const url = process.env.SLG_URL || 'http://127.0.0.1:5182';
export const phase = page => page.locator('#clerk-panel').getAttribute('data-phase');
export const assets = page => page.evaluate(() => window.__slg.game.assets.snapshot());
export const position = page => page.evaluate(() => ({ ...window.__slg.game.player }));
export async function ready(page) {
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
}
export async function hold(page, key, ms = 180) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
export async function walkTo(page, target) {
  const route = await page.evaluate(async target => {
    const { findPath } = await import('/src/world/index.ts');
    const g = window.__slg.game;
    return findPath(g.area, { x: Math.floor(g.player.x / 16), y: Math.floor((g.player.y - 4) / 16) }, target);
  }, target);
  assert.ok(route, `Reachable tile ${JSON.stringify(target)}`);
  await page.keyboard.down('Shift');
  try {
    for (const tile of route) for (const axis of ['x', 'y']) {
      const value = tile[axis] * 16 + (axis === 'x' ? 8 : 14), before = await position(page);
      const delta = value - before[axis]; if (Math.abs(delta) < 2.5) continue;
      const key = axis === 'x' ? (delta > 0 ? 'ArrowRight' : 'ArrowLeft') : (delta > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, value, sign, areaId }) => {
          const p = window.__slg.game.player;
          return p.areaId !== areaId || (p[axis] - value) * sign >= -1.5;
        }, { axis, value, sign: Math.sign(delta), areaId: before.areaId }, { polling: 'raf', timeout: 5000 });
      } finally { await page.keyboard.up(key); }
      if ((await position(page)).areaId !== before.areaId) return;
    }
  } finally { await page.keyboard.up('Shift'); }
}
export async function face(page, eventKey) {
  const target = await page.evaluate(async eventKey => {
    const { findPath } = await import('/src/world/index.ts');
    const g = window.__slg.game, item = g.area.interactions.find(i => i.eventKey === eventKey);
    if (!item) return null;
    const from = { x: Math.floor(g.player.x / 16), y: Math.floor((g.player.y - 4) / 16) };
    for (const [dx, dy, key] of [[0, 1, 'ArrowUp'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft'], [-1, 0, 'ArrowRight']]) {
      const tile = { x: item.x + dx, y: item.y + dy };
      if (findPath(g.area, from, tile) && !g.area.portalAt.has(tile.y * g.area.width + tile.x)) return { ...tile, key };
    }
    return null;
  }, eventKey);
  assert.ok(target, `Reachable ${eventKey}`); await walkTo(page, target);
  await page.keyboard.down(target.key);
  try { await page.waitForFunction(key => window.__slg.game.facingInteraction()?.eventKey === key, eventKey); }
  finally { await page.keyboard.up(target.key); }
}
export async function enterStore(page) {
  const front = await page.evaluate(async () => (await import('/src/world/index.ts')).LANDMARKS.konbiniDoorFront);
  await walkTo(page, front); await page.keyboard.down('ArrowUp');
  try { await page.waitForFunction(() => window.__slg.game.player.areaId === 'shop-konbini-interior'); }
  finally { await page.keyboard.up('ArrowUp'); }
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
}
export async function talkToClerk(page) {
  await face(page, 'shopping.konbini.clerk');
  const beforeOpening = await position(page);
  await page.keyboard.press('KeyZ');
  await page.locator('#clerk-panel[data-phase="greeting"]').waitFor({ state: 'visible' });
  const afterOpening = await position(page);
  assert.deepEqual(afterOpening, beforeOpening, 'Opening the clerk conversation preserves its own approach position');
  return { beforeOpening, afterOpening };
}
export async function browse(page) {
  await page.locator('#clerk-next').click(); await page.locator('#clerk-start').click();
  assert.equal(await phase(page), 'catalog');
}
export async function leave(page) {
  for (let i = 0; i < 4 && await page.locator('#clerk-panel').isVisible(); i++) await page.keyboard.press('Escape');
  await page.locator('#clerk-panel').waitFor({ state: 'hidden' });
}
/** Screenshot/state fixtures alter only this browser's supported save fields, never source world/NPC data. */
export async function seedClerk(page, moneyYen = 1000, quantity = 0) {
  await page.reload(); await ready(page);
  await page.evaluate(({ moneyYen, quantity }) => {
    const g = window.__slg.game;
    g.player = { areaId: 'shop-konbini-interior', x: 168, y: 46, facing: 'down' };
    g.assets.changeMoney(moneyYen - g.assets.moneyYen);
    for (const item of g.assets.snapshot().items) g.assets.removeItem(item.itemId, item.quantity);
    if (quantity) g.assets.addItem('small-snack', quantity);
  }, { moneyYen, quantity });
  await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
}
