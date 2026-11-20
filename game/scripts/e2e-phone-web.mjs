/** Real in-game web search flow in disposable browser contexts; no external network or user save access. */
import { gameplayUrl } from './lib/gameplay-url.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
const review = new URL(base); review.searchParams.set('review', '1');
const errors = [], blocked = [];
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });

async function newPage(options) {
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const requested = new URL(route.request().url());
    if (requested.origin !== base.origin) { blocked.push(requested.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', async dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); await dialog.dismiss(); });
  await page.goto(gameplayUrl(review.href));
  await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#hud')?.textContent.trim());
  return { context, page };
}

async function openWeb(page, mobile = false) {
  const click = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
  if (!await page.locator('#phone-device').isVisible()) await click('#btn-phone');
  await page.locator('[data-app="web"]').waitFor({ state: 'visible' });
  await click('[data-app="web"]');
  await page.locator('[data-web-view="home"]').waitFor({ state: 'visible' });
}

const view = page => page.locator('[data-web-view]').getAttribute('data-web-view');

try {
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await openWeb(page);
  assert.equal(await page.locator('.phone-web-submit').isDisabled(), true, 'empty search cannot be sent');
  await page.locator('.phone-web-input').fill('トショカン');
  await page.locator('.phone-web-submit').click();
  await page.locator('[data-web-view="results"]').waitFor();
  const first = page.locator('.phone-web-result').first();
  assert.equal(await first.locator('.phone-web-result-title').textContent(), 'まちの図書館', 'katakana finds the hiragana-keyword page');
  assert.equal(await first.locator('.phone-web-result-site').textContent(), 'まちの図書館');
  assert.equal(await first.locator('.phone-web-result-address').textContent(), 'https://town-library.example');
  await first.click();
  await page.locator('[data-web-view="page"]').waitFor();
  assert.equal(await page.locator('.phone-web-address').textContent(), 'https://town-library.example/');
  const before = page.url();
  await page.locator('.phone-web-link', { hasText: 'おはなし会' }).click();
  await page.locator('.phone-web-address', { hasText: '/events' }).waitFor();
  assert.equal(page.url(), before, 'in-game links never navigate the real page');
  await page.locator('#phone-back').click(); await page.locator('.phone-web-address', { hasText: 'https://town-library.example/' }).waitFor();
  await page.locator('#phone-back').click(); assert.equal(await view(page), 'results');
  await page.locator('#phone-back').click(); assert.equal(await view(page), 'home');
  await page.locator('#phone-back').click(); await page.locator('[data-app="web"]').waitFor();
  console.log('PASS search, result, page, link and back to the search box');

  await openWeb(page);
  await page.locator('.phone-web-input').fill('しょうてんがい');
  await page.locator('.phone-web-input').press('Enter');
  await page.locator('[data-web-view="results"]').waitFor();
  await page.locator('.phone-web-result').first().click();
  await page.locator('.phone-web-link', { hasText: 'お店の地図' }).click();
  await page.locator('.phone-web-title', { hasText: 'ページが見つかりません' }).waitFor();
  assert.equal(await page.locator('.phone-web-address').textContent(), 'https://ekimae-street.example/map', 'missing page still shows its address');
  console.log('PASS Enter submits and a missing page shows its real address');

  // The lucky button skips the result list; back then shows the list it skipped.
  await page.locator('#phone-home').click(); await openWeb(page);
  assert.equal(await page.locator('.phone-web-lucky').isDisabled(), true, 'empty lucky search cannot be sent');
  await page.locator('.phone-web-input').fill('おはなし会');
  await page.locator('.phone-web-lucky').click();
  await page.locator('.phone-web-title', { hasText: 'おはなし会のくわしい案内' }).waitFor();
  await page.locator('#phone-back').click(); assert.equal(await view(page), 'results');
  assert.equal(await page.locator('.phone-web-result-summary b').first().textContent(), 'おはなし会', 'query words are bold in snippets');
  await page.locator('.phone-web-clear').click();
  assert.equal(await page.locator('.phone-web-input').inputValue(), '');
  assert.equal(await page.locator('.phone-web-submit').isDisabled(), true, 'cleared box cannot be sent');
  console.log('PASS lucky search, bold query words and clear button');

  // Typed letters stay in the box: Z, H and Backspace are phone shortcuts outside text boxes.
  await page.locator('#phone-home').click(); await openWeb(page);
  const input = page.locator('.phone-web-input');
  await input.focus(); await page.keyboard.type('zh<img src=x onerror=alert(1)>');
  await page.keyboard.press('Backspace');
  assert.equal(await input.inputValue(), 'zh<img src=x onerror=alert(1)', 'letters and Backspace edit the text');
  assert.equal(await view(page), 'home');
  await page.keyboard.press('Enter');
  await page.locator('.phone-web-count', { hasText: '見つかりませんでした' }).waitFor();
  assert.equal(await page.locator('.phone-web-input').inputValue(), 'zh<img src=x onerror=alert(1)');
  assert.equal(await page.locator('#phone-device img').count(), 0, 'markup never becomes an element');
  await page.locator('#phone-back').focus(); await page.keyboard.press('Backspace');
  assert.equal(await view(page), 'home', 'Backspace outside the box goes back');
  console.log('PASS typing, literal markup, no results and keyboard back');
  await context.close();

  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await openWeb(mobile.page, true);
  await mobile.page.locator('.phone-web-input').tap();
  await mobile.page.locator('.phone-web-input').fill('てんき');
  await mobile.page.locator('.phone-web-submit').tap();
  const row = mobile.page.locator('.phone-web-result').first(), box = await row.boundingBox();
  assert.ok(box && box.height >= 44, 'result touch target is at least 44px tall');
  await row.tap();
  await mobile.page.locator('.phone-web-title', { hasText: 'まちのてんき' }).waitFor();
  await mobile.page.locator('#phone-close').tap();
  assert.equal(await mobile.page.locator('#phone-overlay').isHidden(), true);
  await mobile.context.close();
  console.log('PASS touch search and page');

  assert.deepEqual(blocked, [], 'no requests to external origins');
  assert.deepEqual(errors, [], 'no page, console or dialog errors');
  console.log('SUMMARY phone web E2E PASS');
} finally { await browser.close(); }
