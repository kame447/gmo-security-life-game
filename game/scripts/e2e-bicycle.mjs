// 自転車の乗り降り（B キー・タッチボタン）、屋内での自動降車、操作ヒントを確認する。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5173';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let passed = 0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const riding = page => page.evaluate(() => window.__slg.game.riding);

async function open(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}/?review=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
  return { context, page, errors };
}

try {
  {
    const { context, page, errors } = await open({ width: 1280, height: 800 }, false);
    await check('desktop: the hint offers the bicycle outdoors', async () => {
      await page.waitForFunction(() => document.querySelector('#hint')?.textContent?.includes('B：じてんしゃ'));
    });
    await check('desktop: B gets on, pedals, and B gets off', async () => {
      await page.keyboard.press('KeyB');
      assert.equal(await riding(page), true);
      await page.waitForFunction(() => document.querySelector('#hint')?.textContent?.includes('Shift：とばす　B：おりる'));
      const before = await page.evaluate(() => window.__slg.game.walkTime);
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(200); await page.keyboard.up('ArrowDown');
      assert.ok(await page.evaluate(() => window.__slg.game.walkTime) > before, 'the rider should move');
      if (shots) await page.screenshot({ path: `${shots}/desktop-riding.png` });
      await page.keyboard.press('KeyB');
      assert.equal(await riding(page), false);
    });
    await check('desktop: entering a building gets off, and B does nothing indoors', async () => {
      await page.keyboard.press('KeyB');
      const entered = await page.evaluate(() => {
        const game = window.__slg.game;
        const door = game.area.def.portals.find(p => game.world.areas.get(p.to.areaId)?.def.kind === 'indoor');
        game.player = { areaId: game.area.def.id, x: door.from.x * 16 + 8, y: door.from.y * 16 + 14, facing: 'down' };
        game.update(1 / 176, { dir: 'down', run: false });
        return game.area.def.kind;
      });
      assert.equal(entered, 'indoor');
      assert.equal(await riding(page), false);
      await page.keyboard.press('KeyB');
      assert.equal(await riding(page), false);
      await page.waitForFunction(() => !document.querySelector('#hint')?.textContent?.includes('B：'));
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const { context, page, errors } = await open(viewport, true);
    if (!await page.locator('#touch').evaluate(node => node.classList.contains('on'))) await page.locator('#btn-touch').click();
    const bike = page.locator('#touch [data-bike]');
    await check(`${name}: the bicycle button fits and does not overlap other controls`, async () => {
      const box = await bike.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
      for (const other of await page.locator('#touch button:not([data-bike]), #menu button, #hint, #minimap-button').all()) {
        if (!await other.isVisible()) continue;
        const otherBox = await other.boundingBox();
        assert.ok(otherBox && !overlaps(box, otherBox), `${name}: bicycle button overlaps ${await other.textContent()}`);
      }
      assert.equal(await bike.getAttribute('aria-label'), 'じてんしゃに のる・おりる');
    });
    await check(`${name}: tapping the button gets on and off`, async () => {
      await bike.tap();
      assert.equal(await riding(page), true);
      if (shots) await page.screenshot({ path: `${shots}/${name}-riding.png` });
      await bike.tap();
      assert.equal(await riding(page), false);
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`bicycle e2e: ${passed} checks passed`);
} finally {
  await browser.close();
}
