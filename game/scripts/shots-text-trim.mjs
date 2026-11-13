// Before/after review images. Outputs are confined to SLG_SHOTS.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const before = process.env.SLG_BEFORE_URL;
const after = process.env.SLG_AFTER_URL ?? 'http://127.0.0.1:5192';
const shots = process.env.SLG_SHOTS;
if (!before || !shots) throw new Error('Set SLG_BEFORE_URL and SLG_SHOTS');
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
try {
  for (const [size, viewport, hasTouch] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ]) {
    for (const [name, origin, hint] of [['before', before, null], ['quiet', after, 'quiet'], ['first', after, 'first']]) {
      const context = await browser.newContext({ viewport, hasTouch, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = new URL(origin);
      if (hint) { url.searchParams.set('hint', hint); url.searchParams.set('review', '1'); }
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__slg?.game);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: `${shots}/${size}-${name}-01-explore.png` });
      if (hint) {
        await page.locator('#control-help summary').click();
        await page.screenshot({ path: `${shots}/${size}-${name}-02-help.png` });
        await page.keyboard.press('Escape');
      }
      if (!await page.locator('#touch').evaluate(element => element.classList.contains('on'))) await page.locator('#btn-touch').click();
      await page.screenshot({ path: `${shots}/${size}-${name}-03-touch.png` });
      const targetSet = await page.evaluate(() => {
        const game = window.__slg.game;
        const npc = game.area.interactions.find(item => item.id === 'neighbor-grandma');
        if (!npc) return false;
        for (const [dx, dy, facing] of [[1, 0, 'left'], [-1, 0, 'right'], [0, 1, 'up'], [0, -1, 'down']]) {
          const tx = npc.x + dx, ty = npc.y + dy;
          if (game.area.solid[ty * game.area.width + tx]) continue;
          game.player = { ...game.player, x: tx * 16 + 8, y: ty * 16 + 14, facing };
          if (game.facingInteraction()?.id === npc.id) return true;
        }
        return false;
      });
      if (!targetSet) throw new Error('Could not place the review player beside the existing NPC');
      await page.locator('#hint').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#hint')?.textContent?.includes(window.__slg.game.facingInteraction()?.name ?? '___'));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: `${shots}/${size}-${name}-04-target.png` });
      await page.locator('#view').focus();
      await page.keyboard.press('z');
      await page.locator('#dialog').waitFor({ state: 'visible' });
      await page.screenshot({ path: `${shots}/${size}-${name}-05-dialog.png` });
      if (errors.length) throw new Error(`Page errors in ${size}/${name}: ${errors.join('; ')}`);
      await context.close();
    }
  }
  console.log(`PASS: before / quiet / first screenshots in ${shots}`);
} finally {
  await browser.close();
}
