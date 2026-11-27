import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5494');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const sizes = [
  ['desktop', { width: 1280, height: 800 }],
  ['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
  ['narrow', { width: 320, height: 568 }],
];
const browser = await chromium.launch({ headless: true });
let passed = 0;
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

async function setup(page) {
  await page.goto(new URL('/?review=1&skipOpening=1', base).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game);
  if (!await page.locator('#touch').evaluate(node => node.classList.contains('on'))) await page.locator('#btn-touch').click();
  await page.evaluate(async () => {
    const { canStand } = await import('/src/map/explorer.ts');
    const { getCrossings } = await import('/src/town-train/crossings.ts');
    const game = window.__slg.game;
    // Find an actual clear part of the existing map; do not alter world collision or speed.
    let point;
    for (const area of game.world.areas.values()) {
      if (area.def.kind !== 'outdoor') continue;
      for (let y = 4; y < area.height - 4 && !point; y++) for (let x = 4; x < area.width - 4 && !point; x++) {
        let clear = true;
        for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (!canStand(area, (x + dx) * 16 + 8, (y + dy) * 16 + 14) || area.portalAt.has((y + dy) * area.width + x + dx)) {
            clear = false; break;
          }
        }
        if (clear && !getCrossings(area).some(c => x * 16 > c.left - 80 && x * 16 < c.right + 80 && y * 16 > c.top - 80 && y * 16 < c.bottom + 80)) {
          point = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 14, facing: 'up' };
        }
      }
      if (point) break;
    }
    if (!point) throw new Error('No unobstructed bicycle test area');
    window.__bikeStart = point;
    game.player = { ...point };
    window.__bikeSamples = [];
    const update = game.update.bind(game);
    game.update = (dt, input) => {
      const before = { ...game.player };
      update(dt, input);
      if (dt > 0) window.__bikeSamples.push({ ...input, speed: Math.hypot(game.player.x - before.x, game.player.y - before.y) / dt });
      if (window.__bikeSamples.length > 240) window.__bikeSamples.shift();
    };
    document.querySelector('[data-accelerate]').addEventListener('pointerdown', event => { window.__bikeBoostPointer = event.pointerId; });
  });
  await page.locator('[data-bike]').tap();
  await page.waitForFunction(() => window.__slg.game.riding && !document.querySelector('[data-accelerate]').hidden);
}

async function center(page, selector, id) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, selector);
  return { id, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), radiusX: 1, radiusY: 1, force: 1 };
}
async function measuredSpeed(page, dir, run, expected) {
  await page.evaluate(() => { window.__slg.game.player = { ...window.__bikeStart }; window.__bikeSamples = []; });
  await page.waitForTimeout(120);
  const samples = await page.evaluate(() => window.__bikeSamples);
  const matching = samples.filter(sample => sample.dir === dir && sample.run === run);
  assert.ok(matching.length > 0, `Expected ${dir}, run=${run}; received ${JSON.stringify(samples)}`);
  assert.ok(matching.some(sample => Math.abs(sample.speed - expected) < 0.05), `Expected ${expected}px/s; received ${JSON.stringify(matching)}`);
  assert.equal(samples.at(-1).run, run, 'The final input matches the held fingers');
}
async function released(page) {
  await page.waitForFunction(() => document.querySelector('[data-accelerate]').getAttribute('aria-pressed') === 'false'
    && !(window.__bikeSamples.at(-1)?.run ?? false));
}

try {
  for (const [name, viewport] of sizes) {
    const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const session = await context.newCDPSession(page);
    const touch = (type, touchPoints = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
    try {
      await setup(page);
      await check(`${name}: acceleration and bicycle buttons fit without covering other controls`, async () => {
        for (const selector of ['[data-accelerate]', '[data-bike]']) {
          const own = page.locator(selector), box = await own.boundingBox();
          assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height);
          for (const other of await page.locator(`#touch button:not(${selector}), #menu button, #hint, #minimap-button, .bag-quick-hud`).all()) {
            if (!await other.isVisible()) continue;
            const otherBox = await other.boundingBox();
            assert.ok(otherBox && !overlap(box, otherBox), `${selector} overlaps ${await other.getAttribute('id') || await other.textContent()}`);
          }
        }
        assert.equal(await page.locator('[data-accelerate]').getAttribute('aria-label'), '押している間、自転車を加速');
        if (shots) await page.screenshot({ path: `${shots}/${name}-bicycle-ready.png` });
      });
      const up = await center(page, '[data-dir="up"]', 1);
      const boost = await center(page, '[data-accelerate]', 2);
      const right = await center(page, '[data-dir="right"]', 3);
      await check(`${name}: a second held finger accelerates from 176 to 240 pixels per second`, async () => {
        await touch('touchStart', [up]);
        await measuredSpeed(page, 'up', false, 176);
        await touch('touchStart', [up, boost]);
        await measuredSpeed(page, 'up', true, 240);
        assert.equal(await page.locator('[data-accelerate]').getAttribute('aria-pressed'), 'true');
        if (shots) await page.screenshot({ path: `${shots}/${name}-bicycle-accelerating.png` });
      });
      await check(`${name}: changing direction preserves acceleration and releasing boost restores normal speed`, async () => {
        await touch('touchEnd', [boost]);
        await touch('touchStart', [boost, right]);
        await measuredSpeed(page, 'right', true, 240);
        await touch('touchEnd', [right]);
        await measuredSpeed(page, 'right', false, 176);
        assert.equal(await page.locator('[data-accelerate]').getAttribute('aria-pressed'), 'false');
        await touch('touchEnd');
      });
      await check(`${name}: cancellation and lost capture release acceleration`, async () => {
        await touch('touchStart', [boost]);
        await touch('touchCancel');
        await page.waitForTimeout(40);
        await released(page);
        await touch('touchStart', [boost]);
        await page.evaluate(() => document.querySelector('[data-accelerate]').releasePointerCapture(window.__bikeBoostPointer));
        await touch('touchMove', [{ ...boost, x: boost.x + 3 }]);
        await page.waitForTimeout(40);
        await released(page);
        await touch('touchEnd');
      });
      await check(`${name}: dialogs and modal screens require a fresh acceleration press`, async () => {
        await touch('touchStart', [boost]);
        await page.evaluate(() => window.__slg.game.say('確認用', ['会話中は加速しません。']));
        await page.waitForTimeout(40);
        await released(page);
        await touch('touchEnd');
        await page.locator('#dialog').tap();
        await page.waitForFunction(() => !window.__slg.game.dialog);
        await released(page);
        await touch('touchStart', [boost]);
        await page.locator('#btn-avatar').evaluate(button => button.click());
        await page.waitForTimeout(40);
        await released(page);
        await touch('touchEnd');
        await page.locator('#avatar-cancel').tap();
        await released(page);
      });
      await check(`${name}: dismounting hides the button and does not turn acceleration into running`, async () => {
        await touch('touchStart', [boost]);
        await page.evaluate(() => window.__slg.game.toggleBicycle());
        await page.waitForTimeout(40);
        await released(page);
        assert.equal(await page.locator('[data-accelerate]').isVisible(), false);
        await touch('touchEnd');
        await page.locator('[data-bike]').tap();
        await released(page);
      });
      assert.deepEqual(errors, []);
    } finally {
      await session.detach();
      await context.close();
    }
  }
  console.log(`bicycle touch e2e: ${passed} checks passed`);
} finally { await browser.close(); }
