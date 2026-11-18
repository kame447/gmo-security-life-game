/** Real mail UI flow in disposable browser contexts; no external network or user save access. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
const normal = new URL(base); normal.searchParams.delete('review');
const review = new URL(base); review.searchParams.set('review', '1');
const errors = [], blocked = [];
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });

async function newPage(options, url) {
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
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#hud')?.textContent.trim());
  return { context, page };
}

const homeBadge = page => page.locator('[data-app="mail"] .smartphone-badge');

async function openInbox(page, mobile = false) {
  const click = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
  if (!await page.locator('#phone-device').isVisible()) await click('#btn-phone');
  await page.locator('[data-app="mail"]').waitFor({ state: 'visible' });
  await click('[data-app="mail"]');
  await page.locator('.phone-mail-list').waitFor({ state: 'visible' });
}

const payload = '<img src=x onerror=alert(1)>';

try {
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } }, normal);
  await page.locator('#btn-phone').click();
  assert.equal(await homeBadge(page).textContent(), '1', 'home shows one unread mail');
  await openInbox(page);
  const welcome = page.locator('[data-mail="welcome"]');
  assert.ok(await welcome.evaluate(row => row.classList.contains('is-unread')), 'the welcome mail is unread');
  const row = await welcome.evaluate(item => ({ from: item.querySelector('.phone-mail-from')?.textContent,
    subject: item.querySelector('.phone-mail-subject')?.textContent, time: item.querySelector('.phone-mail-time')?.textContent }));
  assert.ok(row.from && row.subject && /^\d\d:\d\d$/.test(row.time ?? ''), 'each row has sender, subject and time');
  await welcome.click();
  await page.locator('[data-mail-detail="welcome"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.phone-mail-detail-subject').textContent(), row.subject);
  assert.ok((await page.locator('.phone-mail-body p').count()) >= 2, 'line breaks become paragraphs');
  await page.locator('#phone-back').click();
  assert.equal(await page.locator('[data-mail="welcome"]').evaluate(item => item.classList.contains('is-unread')), false, 'opened mail is read');
  await page.locator('#phone-home').click();
  assert.equal(await homeBadge(page).count(), 0, 'home badge clears');
  console.log('PASS inbox, detail, read state and home badge');

  await page.locator('#phone-close').click();
  await page.locator('#phone-overlay').waitFor({ state: 'hidden' });
  const result = await page.evaluate(body => window.__slg.game.phone.deliverMail({ id: 'e2e-1', from: 'テスト', subject: body, body, atMs: Date.now() }), payload);
  assert.equal(result.ok, true);
  await page.locator('#toast').filter({ hasText: 'メールが とどきました' }).waitFor({ state: 'visible' });
  await page.locator('#btn-phone').click();
  assert.equal(await homeBadge(page).textContent(), '1', 'arrived mail is counted while the phone was closed');
  await openInbox(page);
  assert.equal(await page.locator('.phone-mail-row').first().getAttribute('data-mail'), 'e2e-1', 'newest mail is first');
  await page.locator('[data-mail="e2e-1"]').click();
  assert.equal(await page.locator('.phone-mail-detail-subject').textContent(), payload, 'markup-like subject is literal text');
  assert.equal(await page.locator('.phone-mail-body').textContent(), payload, 'markup-like body is literal text');
  assert.equal(await page.locator('.phone-mail-detail img').count(), 0, 'markup never becomes an element');
  console.log('PASS arrival toast while closed, unread badge and literal markup');

  await page.evaluate(() => window.__slg.game.phone.deliverMail({ id: 'e2e-2', from: 'テスト', subject: 'あとで読む', body: '保存の確認', atMs: Date.now() }));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload(); await page.waitForFunction(() => !!window.__slg?.game);
  await openInbox(page);
  const restored = await page.locator('.phone-mail-row').evaluateAll(items => items.map(item => ({ id: item.dataset.mail, unread: item.classList.contains('is-unread') })));
  assert.deepEqual(restored.slice(0, 3), [{ id: 'e2e-2', unread: true }, { id: 'e2e-1', unread: false }, { id: 'welcome', unread: false }],
    'inbox and read state survive a reload');
  console.log('PASS saved inbox after reload');

  // Keyboard only: P opens, Z activates the focused button, Backspace goes back.
  await page.keyboard.press('Escape');
  await page.locator('#phone-overlay').waitFor({ state: 'hidden' });
  await page.keyboard.press('KeyP');
  await page.locator('[data-app="mail"]').focus(); await page.keyboard.press('KeyZ');
  await page.locator('.phone-mail-row').first().waitFor({ state: 'visible' });
  await page.locator('.phone-mail-row').first().focus(); await page.keyboard.press('KeyZ');
  await page.locator('[data-mail-detail="e2e-2"]').waitFor({ state: 'visible' });
  await page.keyboard.press('Backspace');
  await page.locator('.phone-mail-list').waitFor({ state: 'visible' });
  await page.keyboard.press('Backspace');
  await page.locator('[data-app="mail"]').waitFor({ state: 'visible' });
  console.log('PASS keyboard navigation');
  await context.close();

  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, review);
  await openInbox(mobile.page, true);
  const touchRow = mobile.page.locator('[data-mail="welcome"]'), box = await touchRow.boundingBox();
  assert.ok(box && box.height >= 44, 'mail row touch target is at least 44px tall');
  await touchRow.tap();
  await mobile.page.locator('[data-mail-detail="welcome"]').waitFor({ state: 'visible' });
  await mobile.page.locator('#phone-back').tap();
  await mobile.page.locator('#phone-close').tap();
  assert.equal(await mobile.page.locator('#phone-overlay').isHidden(), true);
  await mobile.context.close();
  console.log('PASS touch navigation');

  assert.deepEqual(blocked, [], 'no requests to external origins');
  assert.deepEqual(errors, [], 'no page, console or dialog errors');
  console.log('SUMMARY phone mail E2E PASS');
} finally { await browser.close(); }
