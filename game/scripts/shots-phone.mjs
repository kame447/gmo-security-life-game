/** Capture the actual game for review; all images go under SLG_SHOTS. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const url = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
url.searchParams.set('review', '1');
const output = process.env.SLG_SHOTS;
if (!output) throw new Error('Set SLG_SHOTS to the screenshot output directory');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['mobile', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ]) {
    const dir = join(output, name); await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.goto(url.href); await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#hud')?.textContent.trim());
    const shot = async file => { await page.screenshot({ path: join(dir, file) }); };
    await shot('01-map.png');
    await page.locator('#btn-phone').click(); await page.locator('#phone-device').waitFor({ state: 'visible' });
    await shot('02-home.png');
    await page.locator('[data-app="messages"]').click(); await shot('03-threads.png');
    await page.locator('[data-chat-thread]').first().click(); await shot('04-chat.png');
    const replies = await page.locator('[data-direction="incoming"]').count();
    // Hold only the reply clock so the outgoing and reply states are captured separately.
    await page.evaluate(() => window.__slg.game.phone.setPaused(true));
    await page.locator('.phone-chat-input').fill('こんにちは');
    await page.locator('.phone-chat-send').click();
    await page.locator('[data-direction="outgoing"] .phone-chat-bubble').filter({ hasText: 'こんにちは' }).first().waitFor({ state: 'visible' });
    await shot('05-sent.png');
    await page.evaluate(() => window.__slg.game.phone.setPaused(false));
    await page.waitForFunction(count => document.querySelectorAll('[data-direction="incoming"]').length > count, replies);
    await shot('06-reply.png');
    await page.locator('#phone-home').click(); await page.locator('[data-app="web"]').click(); await shot('07-web.png');
    await page.locator('#phone-home').click(); await page.locator('[data-app="data"]').click(); await shot('08-data.png');
    await page.locator('#phone-home').click(); await page.locator('[data-app="life"]').click(); await shot('09-unavailable.png');
    await page.locator('#phone-close').click(); await shot('10-return.png');
    await context.close(); console.log(`Captured ${name} under ${dir}`);
  }
} finally { await browser.close(); }
