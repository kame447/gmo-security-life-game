import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [];

function intersects(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function ensureLaunchButtons() {
  const menu = document.querySelector('#menu'), touch = document.querySelector('#btn-touch');
  for (const [id, label] of [['btn-inventory', 'もちもの'], ['btn-phone', 'スマホ']]) {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.parentElement !== menu) throw new Error(`${id} must be a direct child of #menu`);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'panel'; button.id = id; button.textContent = label;
    menu.insertBefore(button, touch);
  }
}

try {
  for (const viewport of [{ width: 390, height: 720 }, { width: 640, height: 360 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__slg?.game);
    // Reuse real launch buttons when installed; add test-only buttons for missing features.
    await page.evaluate(ensureLaunchButtons);
    await page.evaluate(ensureLaunchButtons); // A second call must not duplicate real or test buttons.
    assert.equal(await page.locator('#menu button').count(), 5);
    if (await page.locator('#touch').getAttribute('aria-hidden') === 'true') await page.locator('#btn-touch').click();
    assert.equal(await page.locator('#touch').getAttribute('aria-hidden'), 'false');

    // Exercise every current area and district, including the longest location labels.
    const locations = await page.evaluate(() => [...window.__slg.game.world.areas.values()].flatMap(area => {
      const districts = area.def.districts ?? [];
      return districts.length ? districts.map(d => ({ areaId: area.def.id, x: d.x + Math.floor(d.w / 2), y: d.y + Math.floor(d.h / 2), label: `${area.def.name} / ${d.name}` })) :
        [{ areaId: area.def.id, x: 1, y: 1, label: area.def.name }];
    }));
    for (const location of locations) {
      await page.evaluate(({ areaId, x, y }) => {
        window.__slg.game.player = { areaId, x: x * 16 + 8, y: y * 16 + 14, facing: 'down' };
      }, location);
      await page.waitForFunction(label => document.querySelector('#hud').textContent === label, location.label);
      const layout = await page.evaluate(() => {
        const rect = element => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom };
        };
        return {
          menu: rect(document.querySelector('#menu')),
          hud: rect(document.querySelector('#hud')),
          hint: rect(document.querySelector('#hint')),
          buttons: [...document.querySelectorAll('#menu button')].map(rect),
          touch: [...document.querySelectorAll('#touch button')].map(rect),
        };
      });
      assert.ok(layout.menu.left >= 0 && layout.menu.right <= viewport.width && layout.menu.top >= 0 && layout.menu.bottom <= viewport.height, `menu outside ${viewport.width}x${viewport.height}: ${location.label}`);
      for (const [name, item] of [['hud', layout.hud], ['hint', layout.hint], ...layout.touch.map(item => ['touch', item])]) {
        assert.equal(intersects(layout.menu, item), false, `${name} overlaps menu at ${viewport.width}x${viewport.height}: ${location.label}`);
      }
      for (const [index, button] of layout.buttons.entries()) {
        assert.ok(button.left >= 0 && button.right <= viewport.width && button.top >= 0 && button.bottom <= viewport.height, `button ${index} outside viewport`);
        for (const other of layout.buttons.slice(index + 1)) assert.equal(intersects(button, other), false, 'menu buttons overlap');
      }
    }
    if (shots) await page.screenshot({ path: `${shots}/modal-menu-${viewport.width}x${viewport.height}.png` });
    console.log(`PASS menu layout ${viewport.width}x${viewport.height}: ${locations.length} locations`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser or console errors');
  console.log('SUMMARY 2/2 PASS: five menu buttons avoid HUD, hint and touch controls');
} finally {
  await browser.close();
}
