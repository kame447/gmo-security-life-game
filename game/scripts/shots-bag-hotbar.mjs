// Review-only screenshots; this script writes only below SLG_SHOTS.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const shots = process.env.SLG_SHOTS;
if (!shots) throw new Error('Set SLG_SHOTS to the screenshot directory');
await mkdir(shots, { recursive: true });
const base = process.env.SLG_URL ?? 'http://127.0.0.1:5186';
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport, touch] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
    const page = await context.newPage();
    await page.goto(`${base}/?bag=hotbar&review=1`, { waitUntil: 'networkidle' });
    await page.locator('.bag-quick-hud').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${shots}/${name}-01-map.png` });
    await page.locator('#btn-inventory').click();
    await page.locator('.bag-window').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${shots}/${name}-02-bag.png` });
    await page.locator('[data-group="important"]').click();
    await page.screenshot({ path: `${shots}/${name}-03-important.png` });
    await context.close();
  }
  console.log(`PASS: screenshots written to ${shots}`);
} finally {
  await browser.close();
}
