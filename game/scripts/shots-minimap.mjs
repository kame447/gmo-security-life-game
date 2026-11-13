// Review screenshots are written only below SLG_SHOTS.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5193';
const shots = process.env.SLG_SHOTS;
if (!shots) throw new Error('Set SLG_SHOTS to the screenshot directory');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  for (const [name, viewport, touch] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'town-main');
    await page.screenshot({ path: `${shots}/${name}-01-town.png` });
    await page.locator('#minimap-button').click();
    await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${shots}/${name}-02-town-full.png` });
    await page.locator('#full-map-close').click();
    await page.keyboard.down('ArrowUp');
    try { await page.waitForFunction(() => window.__slg.game.player.areaId === 'home-family-interior', null, { timeout: 10000 }); }
    finally { await page.keyboard.up('ArrowUp'); }
    await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'home-family-interior');
    await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
    await page.screenshot({ path: `${shots}/${name}-03-home.png` });
    await page.locator('#minimap-button').click();
    await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
    await page.screenshot({ path: `${shots}/${name}-04-home-full.png` });
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    await context.close();
  }
  console.log(`PASS: town and indoor, local and full maps in ${shots}`);
} finally { await browser.close(); }
