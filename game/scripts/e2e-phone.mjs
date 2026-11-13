import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.SLG_URL || 'http://127.0.0.1:5183';
const origin = new URL(url).origin;
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [], external = [];
function watch(page) {
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const requestUrl = new URL(request.url());
    if (['http:', 'https:'].includes(requestUrl.protocol) && requestUrl.origin !== origin) external.push(request.url());
  });
}
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
}
async function player(page) { return page.evaluate(() => ({ ...window.__slg.game.player })); }
async function stationary(page, expected) {
  await page.waitForTimeout(220);
  assert.deepEqual(await player(page), expected, 'phone must block movement');
}
async function tap(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `visible touch target: ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(); watch(page); await ready(page);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyP');
  await page.locator('#phone-panel').waitFor({ state: 'visible' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const stopped = await player(page);
  await stationary(page, stopped);
  await page.keyboard.press('KeyZ');
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
  await page.evaluate(() => document.querySelector('#btn-avatar').click());
  assert.equal(await page.locator('#avatar-panel').isHidden(), true);
  await page.keyboard.press('Tab'); // close
  await page.keyboard.press('Tab'); // first app
  assert.equal(await page.evaluate(() => document.activeElement.dataset.app), 'messages');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#phone-title').textContent(), 'メッセージ');
  await page.keyboard.press('Tab'); // back
  await page.keyboard.press('Tab'); // close
  await page.keyboard.press('Tab'); // message link
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#phone-title').textContent(), 'サンプルメッセージ');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#phone-panel').isHidden(), true);
  await stationary(page, stopped); // the held movement key was cleared on entry and exit
  await page.keyboard.up('ArrowRight');
  console.log('PASS keyboard, focus navigation, input isolation and Escape');

  await page.locator('#btn-phone').click();
  await page.locator('[data-app="web"]').click();
  await page.locator('[data-screen="example"]').click();
  assert.equal(await page.locator('#phone-title').textContent(), 'サンプルページ');
  await page.locator('#phone-back').click();
  assert.equal(await page.locator('#phone-title').textContent(), 'ウェブ');
  await page.locator('#phone-back').click();
  await page.locator('[data-notification="sample"]').click();
  assert.equal(await page.locator('#phone-title').textContent(), 'サンプルメッセージ');
  await page.reload();
  await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.locator('#phone-panel').isHidden(), true);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), true);
  await page.locator('#btn-phone').click();
  await page.evaluate(() => window.__slg.game.phone.setOwned(false));
  assert.equal(await page.locator('#phone-panel').isHidden(), true);
  await page.reload();
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.waitForFunction(() => document.querySelector('#btn-phone').disabled);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), false);
  console.log('PASS app navigation, notifications, ownership and closed-on-reload state');

  // Leaving the game first lets its pagehide save finish before corrupting one field.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
  await page.goto('about:blank');
  saved.phone = { v: 1, owned: 'bad' };
  await page.addInitScript(value => {
    if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('slg-map-save-v1', JSON.stringify(value));
  }, saved);
  await ready(page);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), true);
  assert.deepEqual(await player(page), { areaId: saved.areaId, x: saved.x, y: saved.y, facing: saved.facing });
  assert.deepEqual(await page.evaluate(() => window.__slg.game.appearance), saved.appearance);
  console.log('PASS invalid phone field preserves map and appearance');

  await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'test', lines: ['test'], index: 0 }; });
  await page.waitForFunction(() => document.querySelector('#btn-phone').disabled);
  await page.locator('#view').focus();
  await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-panel').isHidden(), true);
  await page.evaluate(() => { window.__slg.game.dialog = null; });
  await page.waitForFunction(() => !document.querySelector('#btn-phone').disabled);
  await page.locator('#btn-avatar').click();
  await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-panel').isHidden(), true);
  await page.keyboard.press('Escape');
  console.log('PASS dialog and appearance prevent phone opening');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true });
  const touchPage = await mobile.newPage(); watch(touchPage); await ready(touchPage);
  const mobilePosition = await player(touchPage);
  await tap(touchPage, '#btn-phone');
  await tap(touchPage, '[data-app="messages"]');
  await tap(touchPage, '[data-screen="example"]');
  assert.equal(await touchPage.locator('#phone-title').textContent(), 'サンプルメッセージ');
  await tap(touchPage, '#phone-back');
  await tap(touchPage, '#phone-close');
  assert.equal(await touchPage.locator('#phone-panel').isHidden(), true);
  assert.deepEqual(await player(touchPage), mobilePosition);
  console.log('PASS touch open, app navigation, back and close');

  assert.deepEqual(external, [], 'phone must not make external HTTP requests');
  assert.deepEqual(errors, [], 'no page or console errors');
  console.log('SUMMARY phone E2E PASS');
  await mobile.close(); await context.close();
} finally { await browser.close(); }
