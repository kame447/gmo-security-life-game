/** 変更前（7fe30ce）の「看板で選んですぐ移動」を録画する比較用。SLG_URL=5217 などの旧版に向ける。 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOutputDirectory } from './browser-output.mjs';

const base = process.env.SLG_URL || 'http://127.0.0.1:5217';
const out = resolve(process.env.SLG_OUT || browserOutputDirectory('record-old-flow'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const [name, w, h, touch] of [['desktop', 1280, 800, false], ['portrait', 390, 844, true]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch,
    recordVideo: { dir: resolve(out, name), size: { width: w, height: h } } });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game && !window.__slg.renderer.stats.fading);
  // 駅のホーム（乗車位置）へ直接置いて、看板の操作から録る。
  await page.evaluate(async () => {
    const { STATION_ACCESS } = await import('/src/world/landmarks.ts');
    const { positionAt } = await import('/src/map/explorer.ts');
    window.__slg.game.player = positionAt(STATION_ACCESS.boarding);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(out, `${name}-1-platform.png`) });
  await page.locator('#view').focus(); await page.keyboard.press('KeyZ');
  await page.locator('#train-travel-panel').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(out, `${name}-2-destinations.png`) });
  await page.locator('[data-action="select"]').first().click();
  await page.screenshot({ path: resolve(out, `${name}-3-confirm.png`) });
  await page.locator('[data-action="confirm"]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, `${name}-4-arrived-instantly.png`) });
  await context.close();
}
await browser.close();
console.log('recorded', out);
