/** Capture actual game states for visual review; output only under SLG_SHOTS. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const output = process.env.SLG_SHOTS;
if (!output) throw new Error('Set SLG_SHOTS to the screenshot output directory');
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });

try {
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['mobile', { width: 390, height: 720 }, true],
    ['landscape', { width: 640, height: 360 }, true],
  ]) {
    const dir = join(output, name); await mkdir(dir, { recursive: true });
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.goto(url); await page.waitForFunction(() => !!window.__slg?.game);
    const shot = async file => { await page.waitForTimeout(100); await page.screenshot({ path: join(dir, file) }); };
    await shot('01-map.png');
    await page.locator('#btn-phone').click();
    await page.locator('#phone-device').waitFor({ state: 'visible' });
    await shot('02-home-selected.png');
    await page.locator('[data-app="messages"]').click();
    await shot('03-message-list.png');
    await page.locator('[data-screen="example"]').click();
    await shot('04-message-detail.png');
    await page.locator('#phone-home').click();
    await page.locator('[data-app="web"]').click();
    await shot('05-web-home.png');
    await page.locator('[data-screen="example"]').click();
    await shot('06-web-page.png');
    await page.locator('#phone-home').click();
    await page.locator('[data-app="life"]').click();
    await shot('07-coming-soon.png');
    await page.locator('#phone-home').click();
    await page.evaluate(() => {
      const phone = window.__slg.game.phone;
      phone.setContent({ ...phone.content, notifications: [] });
    });
    await shot('08-no-notifications.png');
    await page.locator('#phone-close').click();
    await shot('09-return-to-map.png');
    await context.close();
    console.log(`Captured ${name} states under ${dir}`);
  }
} finally { await browser.close(); }
