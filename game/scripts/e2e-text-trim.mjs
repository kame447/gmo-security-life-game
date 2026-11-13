import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.SLG_URL ?? 'http://127.0.0.1:5192';
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let count = 0;
async function check(name, action) { await action(); count++; console.log(`PASS ${name}`); }

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const key = 'slg-map-save-v1';
    localStorage.setItem(key, '{"sentinel":"unchanged"}');
    const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
    window.__reviewStorage = { reads: 0, writes: 0 };
    window.__reviewSentinel = () => originalGet.call(localStorage, key);
    Storage.prototype.getItem = function(name) {
      if (this === localStorage && name === key) window.__reviewStorage.reads++;
      return originalGet.call(this, name);
    };
    Storage.prototype.setItem = function(name, value) {
      if (this === localStorage && name === key) window.__reviewStorage.writes++;
      return originalSet.call(this, name, value);
    };
  });
  await page.goto(`${base}/?hint=quiet&review=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game);
  await check('quiet exploration and keyboard-accessible help', async () => {
    await page.locator('#hint').waitFor({ state: 'hidden' });
    const summary = page.locator('#control-help summary');
    assert.equal(await summary.getAttribute('aria-label'), '操作の案内');
    await summary.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#control-help').evaluate(node => node.open), true);
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#control-help').evaluate(node => node.open), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'view');
  });
  await check('touch labels and controls', async () => {
    if (!await page.locator('#touch').evaluate(node => node.classList.contains('on'))) await page.locator('#btn-touch').click();
    assert.equal(await page.locator('#btn-touch').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#touch [data-act]').textContent(), 'けってい');
    assert.equal(await page.locator('#touch [data-act]').getAttribute('aria-label'), 'しらべる・はなす・はなしをすすめる');
  });
  await check('context hint stays inside the viewport and clear of touch controls', async () => {
    const target = await page.evaluate(() => {
      const game = window.__slg.game;
      const npc = game.area.interactions.find(item => item.id === 'neighbor-grandma');
      if (!npc) return false;
      for (const [dx, dy, facing] of [[1, 0, 'left'], [-1, 0, 'right'], [0, 1, 'up'], [0, -1, 'down']]) {
        const x = npc.x + dx, y = npc.y + dy;
        if (game.area.solid[y * game.area.width + x]) continue;
        game.player = { ...game.player, x: x * 16 + 8, y: y * 16 + 14, facing };
        if (game.facingInteraction()?.id === npc.id) return true;
      }
      return false;
    });
    assert.equal(target, true);
    await page.locator('#hint').waitFor({ state: 'visible' });
    assert.match(await page.locator('#hint').textContent(), /はなす/);
    const hint = await page.locator('#hint').boundingBox();
    assert.ok(hint && hint.x >= 0 && hint.x + hint.width <= 390);
    for (const button of await page.locator('#touch button').all()) {
      const rect = await button.boundingBox();
      assert.ok(rect && (hint.x + hint.width <= rect.x || rect.x + rect.width <= hint.x || hint.y + hint.height <= rect.y || rect.y + rect.height <= hint.y));
    }
  });
  await check('dialog, help and game input remain isolated', async () => {
    await page.locator('#view').focus();
    await page.keyboard.press('z');
    await page.locator('#dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#dialog .next').textContent(), '▼');
    assert.equal(await page.locator('#hint').isVisible(), false);
    const before = await page.evaluate(() => window.__slg.game.dialog.index);
    await page.locator('#control-help summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#control-help').evaluate(node => node.open), true);
    assert.equal(await page.evaluate(() => window.__slg.game.dialog.index), before);
    await page.keyboard.press('Escape');
  });
  await check('review does not read or write the normal save', async () => {
    await page.evaluate(() => { window.__slg.game.dialog = null; window.dispatchEvent(new Event('pagehide')); });
    await page.locator('#btn-reset').click();
    await page.locator('#btn-avatar').click();
    await page.locator('#avatar-ok').click();
    await page.waitForTimeout(3200);
    assert.deepEqual(await page.evaluate(() => window.__reviewStorage), { reads: 0, writes: 0 });
    assert.equal(await page.evaluate(() => window.__reviewSentinel()), '{"sentinel":"unchanged"}');
  });
  await context.close();

  const firstContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const first = await firstContext.newPage();
  await first.goto(`${base}/?hint=first&review=1`, { waitUntil: 'networkidle' });
  await check('first-only hint expires and help remains available', async () => {
    await first.locator('#hint').waitFor({ state: 'visible' });
    assert.equal(await first.locator('#hint').textContent(), '↑↓←→ あるく　Z しらべる');
    await first.locator('#hint').waitFor({ state: 'hidden', timeout: 10000 });
    await first.locator('#control-help summary').click();
    assert.equal(await first.locator('#control-help').evaluate(node => node.open), true);
  });
  await firstContext.close();
  assert.deepEqual(errors, []);
  console.log(`SUMMARY ${count}/${count} PASS`);
} finally {
  await browser.close();
}
