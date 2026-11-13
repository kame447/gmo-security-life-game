/** Run against a local Vite preview. Each case uses an isolated browser context. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5212');
assert.ok(['http:', 'https:'].includes(base.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = process.env.SLG_SHOTS ? resolve(process.env.SLG_SHOTS) : undefined;
if (shots) await mkdir(shots, { recursive: true });
const errors = [], blocked = [], passed = [];
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });

async function ready(page) { await page.waitForFunction(() => !!window.__slg?.game); }
async function appearance(page) { return page.evaluate(() => ({ ...window.__slg.game.appearance })); }
async function position(page) { return page.evaluate(() => ({ ...window.__slg.game.player })); }
async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1') || 'null')); }
async function shot(page, name) { if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`) }); }

async function run(name, test) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin || url.protocol === 'data:') return route.continue();
    blocked.push(url.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    const url = new URL(socket.url());
    if (url.origin === base.origin.replace(/^http/, 'ws')) return socket.connectToServer();
    blocked.push(url.origin); void socket.close();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(base.href, { waitUntil: 'networkidle' }); await ready(page);
    await test(page);
    passed.push(name); console.log(`PASS ${name}`);
  } finally { await context.close(); }
}

async function establishSavedAppearance(page) {
  const original = await appearance(page);
  await page.locator('#btn-avatar').click();
  await page.locator('#avatar-ok').click();
  await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
  assert.deepEqual((await saved(page)).appearance, original);
  return original;
}

async function openAndChange(page) {
  await page.locator('#btn-avatar').click();
  await page.locator('#avatar-panel').waitFor({ state: 'visible' });
  await page.locator('[data-field="hairColor"] [data-step="1"]').click();
}

async function focusWithTab(page, id) {
  for (let count = 0; count < 16; count++) {
    if (await page.evaluate(id => document.activeElement?.id === id, id)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Tab did not reach #${id}`);
}

try {
  for (const action of ['click', 'Enter', 'Space']) {
    await run(`cancel by ${action} restores and reloads the original`, async page => {
      const original = await establishSavedAppearance(page);
      const before = await position(page);
      await openAndChange(page);
      assert.notDeepEqual(await appearance(page), original);
      // The pagehide save path must not persist an unconfirmed draft.
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.deepEqual((await saved(page)).appearance, original);
      if (action === 'click') await page.locator('#avatar-cancel').click();
      else {
        await focusWithTab(page, 'avatar-cancel');
        await shot(page, `cancel-focus-${action.toLowerCase()}`);
        await page.keyboard.press(action);
      }
      await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
      assert.deepEqual(await appearance(page), original);
      assert.deepEqual(await position(page), before);
      assert.deepEqual((await saved(page)).appearance, original);
      await page.reload(); await ready(page);
      assert.deepEqual(await appearance(page), original);
    });
  }

  for (const action of ['click', 'Enter', 'Space']) {
    await run(`confirm by ${action} commits and reloads the draft`, async page => {
      const original = await establishSavedAppearance(page);
      await openAndChange(page);
      const draft = await appearance(page);
      assert.notDeepEqual(draft, original);
      if (action === 'click') await page.locator('#avatar-ok').click();
      else { await focusWithTab(page, 'avatar-ok'); await page.keyboard.press(action); }
      await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
      assert.deepEqual(await appearance(page), draft);
      assert.deepEqual((await saved(page)).appearance, draft);
      await page.reload(); await ready(page);
      assert.deepEqual(await appearance(page), draft);
    });
  }

  await run('Escape cancels even when cancel has focus', async page => {
    const original = await establishSavedAppearance(page);
    await openAndChange(page); await focusWithTab(page, 'avatar-cancel');
    await page.keyboard.press('Escape');
    await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
    assert.deepEqual(await appearance(page), original);
    await page.reload(); await ready(page);
    assert.deepEqual(await appearance(page), original);
  });

  await run('arrow and WASD edit without movement; Z still commits', async page => {
    const original = await establishSavedAppearance(page), before = await position(page);
    await page.locator('#btn-avatar').click();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
    assert.notEqual((await appearance(page)).hairStyle, original.hairStyle);
    await page.keyboard.press('KeyS'); await page.keyboard.press('KeyD');
    assert.notEqual((await appearance(page)).hairColor, original.hairColor);
    await page.keyboard.press('KeyW'); await page.keyboard.press('KeyA');
    assert.equal((await appearance(page)).hairStyle, original.hairStyle);
    assert.deepEqual(await position(page), before);
    const draft = await appearance(page);
    await page.keyboard.press('KeyZ');
    await page.locator('#avatar-panel').waitFor({ state: 'hidden' });
    assert.deepEqual((await saved(page)).appearance, draft);
    await page.reload(); await ready(page);
    assert.deepEqual(await appearance(page), draft);
  });

  assert.deepEqual(errors, [], 'No page or console errors');
  assert.deepEqual(blocked, [], 'No external HTTP or WebSocket requests');
  console.log(`SUMMARY ${passed.length}/${passed.length} PASS; page errors=0; external requests=0`);
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed.length} PASS; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
