// Review-only, headless capture. All explicit output stays under SLG_VIDEOS.
// Run: SLG_URL=http://127.0.0.1:5182 SLG_VIDEOS=/absolute/output node scripts/video-shop.mjs
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { assets, assertFits, observe, openClerk, phase, position, ready, seed, shopUrl, VIEWPORTS } from './shop-review-helpers.mjs';

const requestedOutput = process.env.SLG_VIDEOS;
assert.ok(requestedOutput && path.isAbsolute(requestedOutput), 'Set SLG_VIDEOS to an absolute output directory');
const target = new URL(shopUrl(true));
assert.ok(['http:', 'https:'].includes(target.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname),
  'SLG_URL must use a loopback HTTP(S) server');
const origin = target.origin, wsOrigin = origin.replace(/^http/, 'ws');
const PAUSE_MS = 800, MAX_CLIP_MS = 35000;
await mkdir(requestedOutput, { recursive: true });
const output = await mkdtemp(path.join(await realpath(requestedOutput), 'shop-flow-'));
const browser = await chromium.launch({ headless: true, downloadsPath: output, args: ['--disable-background-networking'] });
let completed = 0;

async function record(name, width, height) {
  const started = Date.now(), mobile = name !== 'desktop';
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile,
    serviceWorkers: 'block', acceptDownloads: false, recordVideo: { dir: output, size: { width, height } } });
  const blocked = [], downloads = [];
  let expired = false;
  // Close a stalled capture before the requested 40-second ceiling.
  const watchdog = setTimeout(() => { expired = true; void context.close().catch(() => {}); }, MAX_CLIP_MS);
  let video, elapsedMs;
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin || url.protocol === 'data:') return route.continue();
      blocked.push(url.origin); return route.abort();
    });
    await context.routeWebSocket('**', socket => {
      const url = new URL(socket.url());
      if (url.origin === wsOrigin) socket.connectToServer();
      else { blocked.push(url.origin); void socket.close(); }
    });
    context.setDefaultTimeout(5000); context.setDefaultNavigationTimeout(8000);
    const page = await context.newPage(), errors = observe(page);
    video = page.video(); assert.ok(video, 'recordVideo is enabled');
    page.on('download', download => { downloads.push(download.suggestedFilename()); void download.cancel(); });
    // Conceal only setup frames: the review URL auto-opens its greeting on load.
    // No storage seeding or game-function overrides are installed in initScript.
    await page.addInitScript(() => {
      const hide = () => {
        if (!document.documentElement) return false;
        document.documentElement.style.setProperty('opacity', '0', 'important'); return true;
      };
      if (!hide()) {
        const observer = new MutationObserver(() => { if (hide()) observer.disconnect(); });
        observer.observe(document, { childList: true, subtree: true });
      }
    });
    await page.goto(shopUrl(true)); await ready(page);
    // Same temporary funds in all three clips: 2 notebooks cost 320, 1 costs 160.
    // This shows insufficient funds and a successful purchase without changing funds mid-flow.
    await seed(page, 300);
    if (mobile) await page.evaluate(() => {
      if (!document.querySelector('#touch').classList.contains('on')) document.querySelector('#btn-touch').click();
    });
    const room = await position(page), initial = await assets(page);
    assert.equal(initial.moneyYen, 300);
    assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.eventKey), 'shopping.konbini.clerk');
    await page.evaluate(() => document.documentElement.style.removeProperty('opacity'));
    await page.waitForTimeout(PAUSE_MS);

    const step = async (label, action, pauseMs = PAUSE_MS) => {
      await action();
      assert.deepEqual(await position(page), room, `${label}: the player stays at the clerk`);
      if (await page.locator('#shop-panel').isVisible()) await assertFits(page);
      console.log(`STEP ${name}: ${label}`);
      await page.waitForTimeout(pauseMs);
    };
    await step('talk to the clerk', async () => {
      await openClerk(page, mobile);
      assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
    });
    await step('select notebook', async () => {
      if (mobile) await page.locator('.shop-product').nth(1).tap(); else await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), 'ノート');
      assert.deepEqual(await assets(page), initial);
    });
    await step('review item and quantity', async () => {
      if (mobile) await page.locator('#shop-review').tap(); else await page.keyboard.press('KeyZ');
      assert.equal(await phase(page), 'confirm');
    });
    await step('two items: insufficient funds', async () => {
      if (mobile) await page.locator('#shop-more').tap(); else await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#shop-quantity').innerText(), '2');
      assert.match(await page.locator('#shop-notice').innerText(), /20円/);
      assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
      assert.deepEqual(await assets(page), initial);
    }, 1000);
    await step('one item: confirm total and remaining money', async () => {
      if (mobile) await page.locator('#shop-less').tap(); else await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#shop-quantity').innerText(), '1');
      assert.equal(await page.locator('#shop-total').innerText(), '160円');
      assert.equal(await page.locator('#shop-after').innerText(), '140円');
      assert.equal(await page.locator('#shop-confirm').isDisabled(), false);
    });
    await step('purchase and read the result', async () => {
      if (mobile) await page.locator('#shop-confirm').tap(); else await page.keyboard.press('KeyZ');
      assert.equal(await phase(page), 'receipt');
      const bought = await assets(page);
      assert.equal(bought.moneyYen, 140);
      assert.equal(bought.items.find(item => item.itemId === 'notebook').quantity,
        initial.items.find(item => item.itemId === 'notebook').quantity + 1);
      const receipt = page.locator('#shop-result');
      assert.equal(await receipt.isVisible(), true); assert.match(await receipt.innerText(), /ノート/);
    });
    await step('return to the same room', async () => {
      if (mobile) await page.locator('#shop-receipt button').tap(); else await page.keyboard.press('KeyZ');
      await page.locator('#shop-panel').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#view').evaluate(element => document.activeElement === element), true);
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), null, 'Review never writes the normal save');
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []); assert.deepEqual(downloads, []);
    elapsedMs = Date.now() - started;
    assert.ok(!expired && elapsedMs < MAX_CLIP_MS, 'Capture finishes within its 35-second budget');
  } finally {
    clearTimeout(watchdog);
    // Playwright finalizes recordVideo on context.close(): https://playwright.dev/docs/videos
    await context.close();
  }
  const raw = await video.path(), file = path.join(output, `${name}.webm`);
  const relative = path.relative(output, raw);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Video stays under SLG_VIDEOS');
  await rename(raw, file);
  completed++;
  console.log('PASS', JSON.stringify({ viewport: { width, height }, elapsedMs, file }));
}

try {
  for (const viewport of VIEWPORTS) await record(viewport.name, viewport.width, viewport.height);
  console.log(`SUMMARY ${completed}/3 videos`, JSON.stringify({ output, pauseMs: PAUSE_MS, maxClipMs: MAX_CLIP_MS }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${completed}/3 videos; FAILED`, JSON.stringify({ output }));
  process.exitCode = 1;
} finally { await browser.close(); }
