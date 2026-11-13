// Review screenshots are written only below SLG_SHOTS.
import { mkdir, readFile } from 'node:fs/promises';
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
    await page.waitForFunction(() => !window.__slg.renderer.stats.fading);
    await page.screenshot({ path: `${shots}/${name}-01-town.png` });
    await page.locator('#minimap-button').screenshot({ path: `${shots}/${name}-01-town-mini.png` });
    await page.locator('#minimap-button').click();
    await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#full-map-canvas');
      return !canvas.dataset.markerCount || canvas.dataset.markerCount === canvas.dataset.labelCount;
    });
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
    await page.locator('#full-map-close').click();
    for (const [scene, landmark] of [['05-shops', 'shoppingStreet'], ['06-park', 'parkPlaza'], ['07-school', 'schoolDoorFront']]) {
      await page.evaluate(async key => {
        const { LANDMARKS } = await import('/src/world/landmarks.ts');
        const { TILE } = await import('/src/core/coords.ts');
        const point = LANDMARKS[key];
        window.__slg.game.player = { areaId: 'town-main', x: (point.x + .5) * TILE, y: (point.y + .75) * TILE, facing: 'down' };
      }, landmark);
      await page.waitForFunction(() => document.querySelector('#minimap-button')?.dataset.areaId === 'town-main' && !window.__slg.renderer.stats.fading);
      await page.screenshot({ path: `${shots}/${name}-${scene}.png` });
      await page.locator('#minimap-button').screenshot({ path: `${shots}/${name}-${scene}-mini.png` });
    }
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    await context.close();
    if (process.env.SLG_BEFORE_SHOTS) {
      const compare = await browser.newContext({ viewport: { width: viewport.width * 2, height: viewport.height + 36 }, deviceScaleFactor: 1 });
      const comparison = await compare.newPage();
      for (const scene of ['01-town', '02-town-full', '03-home', '04-home-full', '05-shops', '06-park', '07-school']) {
        const before = (await readFile(`${process.env.SLG_BEFORE_SHOTS}/${name}-${scene}.png`)).toString('base64');
        const after = (await readFile(`${shots}/${name}-${scene}.png`)).toString('base64');
        await comparison.setContent(`<style>body{margin:0;background:#243034;color:#fff;font:16px sans-serif;display:flex}section{width:50%}p{height:36px;margin:0;display:flex;align-items:center;padding-left:12px;box-sizing:border-box}img{display:block;width:100%}</style><section><p>Before · origin/feat/minimap</p><img src="data:image/png;base64,${before}"></section><section><p>After · semantic landmarks</p><img src="data:image/png;base64,${after}"></section>`);
        await comparison.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await comparison.screenshot({ path: `${shots}/../${name}-${scene}-compare.png` });
      }
      await compare.close();
    }
  }
  console.log(`PASS: town and indoor, local and full maps in ${shots}`);
} finally { await browser.close(); }
