import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const origin = new URL(url).origin;
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [], external = [];
function watch(page) {
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    const target = new URL(request.url());
    if (['http:', 'https:'].includes(target.protocol) && target.origin !== origin) external.push(request.url());
  });
}
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#hud')?.textContent.trim());
  await page.locator('#view').focus();
}
async function position(page) { return page.evaluate(() => ({ ...window.__slg.game.player })); }

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage(); watch(page); await ready(page);
  await page.keyboard.down('ArrowRight'); await page.keyboard.press('KeyP');
  await page.locator('#phone-device').waitFor({ state: 'visible' });
  const stopped = await position(page); await page.waitForTimeout(150);
  assert.deepEqual(await position(page), stopped, 'exploration stops while the phone is open');
  assert.equal(await page.locator('.smartphone-app').count(), 5);
  assert.equal(await page.locator('[data-app="messages"] .smartphone-badge').innerText(), '1');
  assert.equal(await page.locator('[data-app="messages"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-app="web"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.smartphone-view-title').innerText(), 'ウェブ');
  await page.keyboard.press('Backspace'); assert.equal(await page.locator('.smartphone-app').count(), 5);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#phone-overlay').hidden);
  await page.waitForTimeout(100); assert.deepEqual(await position(page), stopped, 'held movement does not resume');
  await page.keyboard.up('ArrowRight');
  console.log('PASS keyboard, navigation, notification and input isolation');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touch = await mobile.newPage(); watch(touch); await ready(touch);
  const before = await position(touch);
  await touch.locator('#btn-phone').tap();
  await touch.locator('#phone-device').waitFor({ state: 'visible' });
  let box = await touch.locator('#phone-device').boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
  await touch.locator('[data-app="data"]').tap();
  assert.equal(await touch.locator('.smartphone-usage-title').innerText(), '通信残量');
  await touch.locator('#phone-home').tap();
  await touch.locator('[data-app="messages"]').tap();
  await touch.locator('[data-screen="example"]').tap();
  assert.equal(await touch.locator('.smartphone-view-title').innerText(), 'サンプルのおたより');
  await touch.locator('#phone-close').tap();
  assert.deepEqual(await position(touch), before);
  await touch.setViewportSize({ width: 844, height: 390 });
  await touch.locator('#btn-phone').tap();
  box = await touch.locator('#phone-device').boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 844 && box.y + box.height <= 390);
  await touch.locator('[data-app="life"]').tap();
  assert.equal(await touch.locator('.smartphone-placeholder').innerText(), '準備中');
  await touch.locator('#phone-close').tap();
  console.log('PASS touch and portrait/landscape navigation');

  await page.locator('#btn-phone').click();
  const outsideStart = await page.evaluate(() => window.__slg.game.phone.remainingDataMb);
  await page.waitForFunction(start => window.__slg.game.phone.remainingDataMb < start, outsideStart);
  await page.evaluate(() => window.__slg.game.phone.setOwned(false));
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  const savedBalance = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')).phone.dataBudget.remainingMb);
  await page.reload(); await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), false);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.remainingDataMb), savedBalance);
  assert.equal(await page.locator('#btn-phone').isDisabled(), true);
  await page.evaluate(() => {
    const game = window.__slg.game;
    game.phone.setOwned(true);
    const destination = game.world.areas.get('town-main').def.portals.find(portal => portal.facilityId === 'home-family').to;
    game.player = { areaId: destination.areaId, x: destination.x * 16 + 8, y: destination.y * 16 + 14, facing: destination.facing };
  });
  await page.locator('#btn-phone').click();
  const atHome = await page.evaluate(() => window.__slg.game.phone.remainingDataMb);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.remainingDataMb), atHome, 'home does not consume data');
  await page.locator('#phone-close').click();
  const zeroSave = await page.evaluate(() => {
    const saved = window.__slg.game.serialize(); saved.phone.dataBudget.remainingMb = 0; return saved;
  });
  await page.goto('about:blank');
  await page.addInitScript(saved => {
    if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('slg-map-save-v1', JSON.stringify(saved));
  }, zeroSave);
  await ready(page);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.remainingDataMb), 0, 'zero survives reload');
  await page.locator('#btn-phone').click();
  assert.match(await page.locator('.smartphone-balance').innerText(), /0 MB/);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.remainingDataMb), 0, 'zero is a lower bound');
  await page.locator('#phone-close').click();
  await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'test', lines: ['test'], index: 0 }; });
  await page.waitForFunction(() => document.querySelector('#btn-phone').disabled);
  await page.locator('#view').focus(); await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  await page.evaluate(() => { window.__slg.game.dialog = null; });
  await page.waitForFunction(() => !document.querySelector('#btn-phone').disabled);
  await page.locator('#btn-avatar').click(); await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  await page.keyboard.press('Escape');
  assert.deepEqual(external, [], 'no external HTTP requests');
  assert.deepEqual(errors, [], 'no page or console errors');
  console.log('PASS outside/home usage, zero and ownership persistence, dialog/panel isolation');
  console.log('SUMMARY phone simple E2E PASS');
  await mobile.close(); await desktop.close();
} finally { await browser.close(); }
