/** Real UI flow in disposable browser contexts; no external network or user save access. */
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

async function openMessages(page, mobile = false) {
  const click = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
  await click('#btn-phone');
  await page.locator('#phone-device').waitFor({ state: 'visible' });
  await click('[data-app="messages"]');
  await page.locator('[data-chat-thread]').first().waitFor({ state: 'visible' });
}

async function openThread(page, id, mobile = false) {
  const row = page.locator('[data-chat-thread]').filter({ has: page.locator('.phone-chat-name') });
  const index = await row.evaluateAll((rows, selected) => rows.findIndex(item => item.dataset.chatThread === selected), id);
  assert.ok(index >= 0, `Missing conversation ${id}`);
  if (mobile) await row.nth(index).tap(); else await row.nth(index).click();
  await page.locator('.phone-chat-input').waitFor({ state: 'visible' });
}

try {
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } }, normal);
  await openMessages(page);
  const rows = page.locator('[data-chat-thread]');
  assert.ok(await rows.count() >= 3, 'at least three contacts');
  const summary = await rows.evaluateAll(items => items.map(row => ({ id: row.dataset.chatThread,
    name: row.querySelector('.phone-chat-name')?.textContent?.trim(),
    preview: row.querySelector('.phone-chat-preview')?.textContent?.trim(),
    time: row.querySelector('[data-chat-time]')?.textContent?.trim(),
    avatar: !!row.querySelector('.phone-chat-avatar') })));
  assert.ok(summary.every(row => row.id && row.name && row.preview && row.time && row.avatar), 'each contact has name, avatar, preview and time');
  assert.ok(await page.locator('[data-chat-thread] [data-chat-unread]').count() > 0, 'unread appears in the list');
  const id = summary[0].id;
  await openThread(page, id);
  const input = page.locator('.phone-chat-input');
  const start = await page.evaluate(() => ({ ...window.__slg.game.player }));
  await input.fill('abcd'); await input.evaluate(element => element.setSelectionRange(2, 2));
  await input.press('x'); assert.equal(await input.inputValue(), 'abxcd', 'editing preserves the insertion point');
  await input.fill('');
  await input.focus(); await input.pressSequentially('wasdzh ');
  await input.press('Escape');
  assert.equal(await input.inputValue(), 'wasdzh ', 'game shortcuts remain ordinary text while typing');
  assert.equal(await page.locator('#phone-overlay').isVisible(), true, 'Escape does not leak to the game');
  await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), start, 'typing cannot move the player');

  const payload = '<img src=x onerror=alert(1)>';
  const previousReplies = await page.locator('[data-direction="incoming"]').count();
  await input.fill(payload); await input.press('Enter');
  const sent = page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: payload });
  await sent.first().waitFor({ state: 'visible' });
  assert.equal(await sent.first().textContent(), payload, 'markup-like input is literal text');
  assert.equal(await page.locator('.phone-chat-bubble img').count(), 0, 'markup never becomes an element');
  await page.waitForFunction(count => document.querySelectorAll('[data-direction="incoming"]').length > count, previousReplies);
  assert.ok(await page.locator('[data-direction="incoming"] .phone-chat-bubble').count() > previousReplies, 'local reply appears');
  const lastReply = await page.locator('[data-direction="incoming"] .phone-chat-bubble').last().textContent();
  const lastReplyTime = await page.locator('[data-direction="incoming"] .phone-chat-message-time').last().textContent();
  console.log('PASS contact list, keyboard isolation, Enter send, literal markup and local reply');

  await page.locator('#phone-back').click();
  const updated = await rows.evaluateAll((items, selected) => {
    const row = items.find(item => item.dataset.chatThread === selected);
    return { preview: row?.querySelector('.phone-chat-preview')?.textContent?.trim(),
      time: row?.querySelector('[data-chat-time]')?.textContent?.trim() };
  }, id);
  assert.equal(updated.preview, lastReply, 'thread preview updates to the reply');
  assert.equal(updated.time, lastReplyTime, 'thread time matches the latest reply');
  await openThread(page, id);
  await input.fill('ボタン送信'); await page.locator('.phone-chat-send').click();
  await page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: 'ボタン送信' }).first().waitFor({ state: 'visible' });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload(); await page.waitForFunction(() => !!window.__slg?.game);
  await openMessages(page); await openThread(page, id);
  assert.equal(await page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: payload }).first().textContent(), payload);
  assert.ok(await page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: 'ボタン送信' }).count() > 0);

  // Freeze the local reply clock while leaving the thread, then verify unread on delivery.
  await page.evaluate(() => window.__slg.game.phone.setPaused(true));
  await input.fill('あとで読む'); await page.locator('.phone-chat-send').click();
  await page.locator('#phone-back').click();
  await page.waitForTimeout(650);
  const unreadBefore = await page.evaluate(selected => window.__slg.game.phone.chatThreads.find(thread => thread.id === selected)?.unreadCount, id);
  assert.equal(unreadBefore, 0, 'paused time does not deliver the pending reply');
  await page.evaluate(() => window.__slg.game.phone.setPaused(false));
  await page.waitForFunction(selected => {
    const row = [...document.querySelectorAll('[data-chat-thread]')].find(item => item.dataset.chatThread === selected);
    return !!row?.querySelector('[data-chat-unread]');
  }, id);
  const unread = await page.evaluate(selected => {
    const row = [...document.querySelectorAll('[data-chat-thread]')].find(item => item.dataset.chatThread === selected);
    const thread = window.__slg.game.phone.chatThreads.find(item => item.id === selected);
    return { displayed: row?.querySelector('[data-chat-unread]')?.textContent,
      preview: row?.querySelector('.phone-chat-preview')?.textContent, time: row?.querySelector('[data-chat-time]')?.textContent,
      lastText: thread?.lastMessage?.text, atMs: thread?.lastMessage?.atMs, unread: thread?.unreadCount };
  }, id);
  assert.ok(Number(unread.displayed) > 0 && unread.unread > 0, 'a reply outside the thread is unread');
  assert.equal(unread.preview, unread.lastText);
  const date = new Date(unread.atMs);
  assert.equal(unread.time, `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
  await openThread(page, id);
  assert.equal(await page.evaluate(selected => window.__slg.game.phone.chatThreads.find(thread => thread.id === selected)?.unreadCount, id), 0);
  console.log('PASS button send, saved reload, paused reply, unread and time update');

  await input.fill('😀'.repeat(300));
  assert.equal(Array.from(await input.inputValue()).length, 280, 'length limit counts Unicode code points');
  await input.evaluate(element => {
    element.value = 'a\u0001b\u007f';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  assert.equal(await input.inputValue(), 'ab', 'control characters are removed');
  for (let i = 0; i < 4; i++) {
    await input.fill(`${i}${'長'.repeat(180)}`); await page.locator('.phone-chat-send').click();
  }
  await page.waitForFunction(() => {
    const scroll = document.querySelector('.phone-chat-messages');
    return !!scroll && scroll.scrollHeight > scroll.clientHeight;
  });
  const scroll = await page.locator('.phone-chat-messages').evaluate(element => {
    const max = element.scrollHeight - element.clientHeight;
    element.scrollTop = 0; const top = element.scrollTop;
    element.scrollTop = max; return { top, bottom: element.scrollTop, max };
  });
  assert.equal(scroll.top, 0); assert.ok(scroll.bottom > 0 && scroll.max > 0, 'conversation can scroll');
  console.log('PASS input bounds, control characters and scrollable conversation');
  await context.close();

  const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, review);
  await openMessages(mobile.page, true);
  const touchId = await mobile.page.locator('[data-chat-thread]').first().getAttribute('data-chat-thread');
  assert.ok(touchId); await openThread(mobile.page, touchId, true);
  const touchInput = mobile.page.locator('.phone-chat-input');
  await touchInput.tap(); await touchInput.fill('タッチ送信');
  const button = mobile.page.locator('.phone-chat-send'), box = await button.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, 'send touch target is at least 44px');
  const touchReplies = await mobile.page.locator('[data-direction="incoming"]').count();
  await button.tap();
  await mobile.page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: 'タッチ送信' }).first().waitFor({ state: 'visible' });
  await mobile.page.waitForFunction(count => document.querySelectorAll('[data-direction="incoming"]').length > count, touchReplies);
  await mobile.page.locator('#phone-back').tap();
  await mobile.page.locator('#phone-home').tap();
  assert.ok(await mobile.page.locator('[data-app="messages"]').isVisible());
  await mobile.page.locator('#phone-close').tap();
  assert.equal(await mobile.page.locator('#phone-overlay').isHidden(), true);
  await mobile.context.close();
  assert.deepEqual(blocked, [], 'no requests to external origins');
  assert.deepEqual(errors, [], 'no page, console or dialog errors');
  console.log('PASS touch send, navigation and external-network isolation');
  console.log('SUMMARY phone chat E2E PASS');
} finally { await browser.close(); }
