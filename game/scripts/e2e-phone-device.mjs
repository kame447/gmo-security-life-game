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
async function state(page) { return page.evaluate(() => ({ ...window.__slg.game.player })); }
async function tap(page, selector) {
  // Locator.tap uses touch input and waits for the target to be stable and receive the hit.
  await page.locator(selector).tap();
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(); watch(page); await ready(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.press('KeyP');
  await page.locator('#phone-device').waitFor({ state: 'visible' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const stopped = await state(page); await page.waitForTimeout(180);
  assert.deepEqual(await state(page), stopped, 'movement stops while the phone is open');
  assert.equal(await page.locator('[data-app="messages"]').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-app="web"]').evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('[data-app="web"]').evaluate(node => node.classList.contains('is-selected')), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.phone-view-title h2').innerText(), 'ウェブ');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.phone-view-title h2').innerText(), 'サンプルページ');
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('.phone-view-title h2').innerText(), 'ウェブ');
  await page.keyboard.press('KeyH');
  assert.equal(await page.locator('.phone-home').count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#phone-overlay').hidden);
  await page.waitForTimeout(180); assert.deepEqual(await state(page), stopped, 'held input was cleared');
  await page.keyboard.up('ArrowRight');
  console.log('PASS keyboard selection, app/back/home/close and movement isolation');

  await page.locator('#btn-phone').click();
  await page.locator('[data-notification="sample"]').click();
  assert.equal(await page.locator('.phone-view-title h2').innerText(), 'サンプルのおたより');
  await page.locator('#phone-back').click();
  assert.equal(await page.locator('.phone-view-title h2').innerText(), 'メッセージ');
  await page.locator('#phone-home').click();
  await page.locator('[data-app="life"]').click();
  assert.match(await page.locator('.phone-view-content').innerText(), /じゅんび中/);
  await page.locator('#phone-home').click();
  await page.evaluate(() => {
    const phone = window.__slg.game.phone;
    const content = phone.content;
    phone.setContent({ ...content, notifications: [], apps: content.apps.map(app => app.id === 'messages' ? { ...app, label: '<b>サンプル</b>' } : app) });
  });
  assert.match(await page.locator('.phone-empty').innerText(), /おしらせが ありません/);
  assert.equal(await page.locator('[data-app="messages"] b').count(), 0, 'content is rendered as text');
  assert.equal(await page.locator('[data-app="messages"] strong').innerText(), '<b>サンプル</b>');
  await page.locator('#phone-close').click();
  console.log('PASS notifications, provisional apps, empty state and data-driven text');

  await page.locator('#btn-phone').click();
  await page.evaluate(() => window.__slg.game.phone.setOwned(false));
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  await page.reload(); await page.waitForFunction(() => !!window.__slg?.game);
  await page.waitForFunction(() => document.querySelector('#btn-phone').disabled);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')));
  await page.goto('about:blank');
  saved.phone = { v: 1, owned: 'bad' };
  await page.addInitScript(value => {
    if (location.protocol === 'http:' || location.protocol === 'https:') localStorage.setItem('slg-map-save-v1', JSON.stringify(value));
  }, saved);
  await ready(page);
  assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), true);
  assert.deepEqual(await state(page), { areaId: saved.areaId, x: saved.x, y: saved.y, facing: saved.facing });
  await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'test', lines: ['test'], index: 0 }; });
  await page.waitForFunction(() => document.querySelector('#btn-phone').disabled);
  await page.locator('#view').focus(); await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  await page.evaluate(() => { window.__slg.game.dialog = null; });
  await page.waitForFunction(() => !document.querySelector('#btn-phone').disabled);
  await page.locator('#btn-avatar').click(); await page.keyboard.press('KeyP');
  assert.equal(await page.locator('#phone-overlay').isHidden(), true);
  await page.keyboard.press('Escape');
  console.log('PASS ownership, save repair, dialog and appearance isolation');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 720 }, isMobile: true, hasTouch: true });
  const touch = await mobile.newPage(); watch(touch); await ready(touch);
  const position = await state(touch);
  await touch.evaluate(() => {
    document.addEventListener('pointerdown', event => {
      window.__phoneTouchHit = { id: event.target.closest('button')?.id, pointerType: event.pointerType };
    }, { capture: true, once: true });
  });
  await tap(touch, '#btn-phone');
  assert.deepEqual(await touch.evaluate(() => window.__phoneTouchHit), { id: 'btn-phone', pointerType: 'touch' });
  await touch.locator('#phone-device').waitFor({ state: 'visible' });
  const box = await touch.locator('#phone-device').boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 720, 'device fits mobile viewport');
  await tap(touch, '[data-app="messages"]'); await tap(touch, '[data-screen="example"]');
  assert.equal(await touch.locator('.phone-view-title h2').innerText(), 'サンプルのおたより');
  await tap(touch, '#phone-home'); await tap(touch, '#phone-close');
  assert.deepEqual(await state(touch), position);
  await touch.setViewportSize({ width: 640, height: 360 });
  await tap(touch, '#btn-phone');
  await touch.locator('#phone-device').waitFor({ state: 'visible' });
  const landscape = await touch.locator('#phone-device').boundingBox();
  assert.ok(landscape && landscape.x >= 0 && landscape.y >= 0 && landscape.x + landscape.width <= 640 && landscape.y + landscape.height <= 360,
    'device fits the landscape viewport');
  const layout = await touch.evaluate(() => {
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return {
      body: rect(document.querySelector('#phone-body')),
      apps: [...document.querySelectorAll('.phone-app')].map(node => ({
        button: rect(node), icon: rect(node.querySelector('.phone-app-icon')), label: rect(node.querySelector('.phone-app-label')),
      })),
      notice: rect(document.querySelector('.phone-notice')),
    };
  });
  assert.equal(layout.apps.length, 4);
  assert.ok(layout.apps.every(({ button, icon, label }, index) =>
    button.width >= 44 && button.height >= 44 && icon.width >= 32 &&
    label.top >= layout.body.top && label.bottom <= layout.body.bottom &&
    (index === 0 || layout.apps[index - 1].icon.right <= icon.left)),
  'landscape app labels stay visible, icons do not overlap and touch targets remain large');
  assert.ok(layout.notice.top >= layout.body.top && layout.notice.bottom <= layout.body.bottom,
    'landscape notification remains fully visible');
  await tap(touch, '[data-notification="sample"]');
  assert.equal(await touch.locator('.phone-view-title h2').innerText(), 'サンプルのおたより');
  await tap(touch, '#phone-home');
  await touch.evaluate(() => {
    const phone = window.__slg.game.phone;
    phone.setContent({ ...phone.content, notifications: [] });
  });
  const empty = await touch.locator('.phone-empty').boundingBox();
  assert.ok(empty && empty.y >= layout.body.top && empty.y + empty.height <= layout.body.bottom,
    'landscape empty-notification state remains fully visible');
  await tap(touch, '[data-app="life"]');
  assert.match(await touch.locator('.phone-view-content').innerText(), /じゅんび中/);
  await tap(touch, '#phone-close');
  console.log('PASS touch navigation and portrait/landscape layout');
  assert.deepEqual(external, [], 'no external HTTP requests');
  assert.deepEqual(errors, [], 'no page or console errors');
  console.log('SUMMARY phone device E2E PASS');
  await mobile.close(); await context.close();
} finally { await browser.close(); }
