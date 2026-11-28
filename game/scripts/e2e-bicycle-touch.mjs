import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL ?? 'http://127.0.0.1:5511');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
const browser = await chromium.launch({ headless: true });
let passed = 0;

async function check(name, action) {
  await action();
  passed++;
  console.log(`PASS ${name}`);
}

async function withPage(viewport, hasTouch, action) {
  const context = await browser.newContext({ viewport, hasTouch, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(5000);
    await page.goto(new URL('/?review=1&skipOpening=1', base).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__slg?.game, undefined, { timeout: 30_000 });
    await page.evaluate(async () => {
      const { canStand } = await import('/src/map/explorer.ts');
      const { getCrossings } = await import('/src/town-train/crossings.ts');
      const game = window.__slg.game;
      // Use an unobstructed part of the real map without changing speed or collision.
      function findStart() {
        for (const area of game.world.areas.values()) {
          if (area.def.kind !== 'outdoor') continue;
          for (let y = 4; y < area.height - 4; y++) {
            for (let x = 4; x < area.width - 4; x++) {
              const clear = (dx, dy) => canStand(area, (x + dx) * 16 + 8, (y + dy) * 16 + 14)
                && !area.portalAt.has((y + dy) * area.width + x + dx);
              const offsets = [-3, -2, -1, 0, 1, 2, 3];
              if (!offsets.every(dy => offsets.every(dx => clear(dx, dy)))) continue;
              if (getCrossings(area).some(c => x * 16 > c.left - 80 && x * 16 < c.right + 80
                && y * 16 > c.top - 80 && y * 16 < c.bottom + 80)) continue;
              return { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 14, facing: 'up' };
            }
          }
        }
        throw new Error('No unobstructed bicycle test area');
      }
      window.__bikeStart = findStart();
      game.player = { ...window.__bikeStart };
      window.__bikeSamples = [];
      window.__bikeEvents = [];
      const update = game.update.bind(game);
      game.update = (dt, input) => {
        const before = game.player;
        const { x, y } = before;
        update(dt, input);
        if (dt > 0) {
          window.__bikeSamples.push({ ...input, at: performance.now(),
            speed: Math.hypot(game.player.x - x, game.player.y - y) / dt });
        }
      };
      for (const type of ['gotpointercapture', 'lostpointercapture', 'pointerup', 'pointercancel']) {
        document.addEventListener(type, event => {
          if (event.pointerType !== 'touch') return;
          window.__bikeEvents.push({
            type, pointerId: event.pointerId, dir: event.target.dataset?.dir, trusted: event.isTrusted,
          });
        }, true);
      }
    });
    await page.locator('#view').focus();
    if (shots) await page.locator('#toast').waitFor({ state: 'hidden' });
    await action(page, context);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function checkpoint(page) {
  await page.evaluate(() => {
    window.__slg.game.player = { ...window.__bikeStart };
    window.__bikeSamples = [];
  });
}

async function findSample(page, dir, run, expected) {
  const match = await page.waitForFunction(({ dir, run }) => window.__bikeSamples.find(
    sample => sample.dir === dir && sample.run === run,
  ), { dir, run }).then(handle => handle.jsonValue());
  assert.ok(Math.abs(match.speed - expected) < 0.05, `Expected ${expected}px/s, got ${JSON.stringify(match)}`);
  return match;
}

async function expectAcceleration(page, dir) {
  const normal = await findSample(page, dir, false, 176);
  // Reset position before running out of space, preserving the original hold.
  await checkpoint(page);
  const boosted = await findSample(page, dir, true, 240);
  assert.ok(boosted.at > normal.at, 'Normal speed precedes acceleration');
}

async function center(page, selector, id) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, selector);
  return { id, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function assertFits(page, viewport, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    `${selector} outside viewport: ${JSON.stringify(box)}`);
  return box;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

try {
  await withPage({ width: 1280, height: 800 }, false, async page => {
    await check('desktop: B mounts and Shift changes speed from 176 to 240 and back', async () => {
      await page.keyboard.press('KeyB');
      await page.waitForFunction(() => window.__slg.game.riding);
      await checkpoint(page);
      await page.keyboard.down('ArrowUp');
      await findSample(page, 'up', false, 176);
      await checkpoint(page);
      await page.keyboard.down('Shift');
      await findSample(page, 'up', true, 240);
      if (shots) await page.screenshot({ path: `${shots}/desktop-bicycle.png` });
      await checkpoint(page);
      await page.keyboard.up('Shift');
      await findSample(page, 'up', false, 176);
      await page.keyboard.up('ArrowUp');
      await page.keyboard.press('KeyB');
      assert.equal(await page.evaluate(() => window.__slg.game.riding), false);
    });
  });

  for (const [name, viewport] of [['portrait', portrait], ['landscape', landscape], ['narrow', { width: 320, height: 568 }]]) {
    await withPage(viewport, true, async (page, context) => {
      const session = await context.newCDPSession(page);
      const touch = (type, touchPoints = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
      const toggle = page.locator('#btn-touch');
      const touchOn = () => page.locator('#touch').evaluate(node => node.classList.contains('on'));
      if (!await touchOn()) await toggle.click();
      const bike = page.locator('[data-bike]');
      await bike.tap();
      assert.equal(await page.evaluate(() => window.__slg.game.riding), true);
      await check(`${name}: directions, bicycle control and hint fit the viewport`, async () => {
        const bikeBox = await assertFits(page, viewport, '[data-bike]');
        for (const other of await page.locator('#touch button:not([data-bike]), #menu button, #hint, #minimap-button, .bag-quick-hud').all()) {
          if (!await other.isVisible()) continue;
          const box = await other.boundingBox();
          assert.ok(box && !overlaps(bikeBox, box),
          `Bicycle control ${JSON.stringify(bikeBox)} overlaps ${await other.getAttribute('id')
            || await other.getAttribute('class') || await other.textContent()} ${JSON.stringify(box)}`);
        }
        if (await page.locator('#hint').isVisible()) {
          const hint = await assertFits(page, viewport, '#hint');
          for (const button of await page.locator('#touch button').all()) {
            const box = await button.boundingBox();
            assert.ok(box && !overlaps(hint, box), `Hint overlaps ${await button.textContent()}`);
          }
        }
        await toggle.click();
        await assertFits(page, viewport, '#hint');
        await toggle.click();
        for (const dir of ['up', 'down', 'left', 'right']) await assertFits(page, viewport, `[data-dir="${dir}"]`);
        if (shots) await page.screenshot({ path: `${shots}/${name}-bicycle-ready.png` });
      });

      const up = await center(page, '[data-dir="up"]', 1);
      const right = await center(page, '[data-dir="right"]', 2);
      await check(`${name}: holding accelerates, turning restarts the hold, lifting all fingers stops`, async () => {
        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await checkpoint(page);
        await touch('touchStart', [up, right]);
        await expectAcceleration(page, 'right');
        if (shots) await page.screenshot({ path: `${shots}/${name}-bicycle-accelerating.png` });
        await checkpoint(page);
        await touch('touchEnd');
        await findSample(page, null, false, 0);
        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await touch('touchEnd');
      });

      await check(`${name}: cancellation and trusted capture loss stop a boosted ride`, async () => {
        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await checkpoint(page);
        await touch('touchCancel');
        await findSample(page, null, false, 0);

        await page.evaluate(() => { window.__bikeEvents = []; });
        await checkpoint(page);
        await touch('touchStart', [up]);
        // A substantial move clears Chromium touch slop and commits pending capture.
        await touch('touchMove', [{ ...up, x: up.x + 32 }]);
        const capture = await page.waitForFunction(() => window.__bikeEvents.find(
          event => event.type === 'gotpointercapture' && event.dir === 'up' && event.trusted,
        )).then(handle => handle.jsonValue());
        await expectAcceleration(page, 'up');
        await page.locator('[data-dir="up"]').evaluate((button, id) => {
          if (!button.hasPointerCapture(id)) throw new Error('Expected active capture before release');
          button.releasePointerCapture(id);
        }, capture.pointerId);
        await checkpoint(page);
        // The next delivered pointer event processes the pending release.
        await touch('touchMove', [{ ...up, x: up.x + 72 }]);
        await page.waitForFunction(id => window.__bikeEvents.some(event => event.type === 'lostpointercapture'
          && event.pointerId === id && event.dir === 'up' && event.trusted), capture.pointerId);
        assert.equal(await page.evaluate(id => window.__bikeEvents.some(event => event.pointerId === id
          && (event.type === 'pointerup' || event.type === 'pointercancel')), capture.pointerId), false);
        await findSample(page, null, false, 0);
        await touch('touchEnd');
      });

      await check(`${name}: conversation, menu and dismount clear acceleration`, async () => {
        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await checkpoint(page);
        await page.evaluate(() => window.__slg.game.say('確認用', ['会話中は加速しません。']));
        await findSample(page, 'up', false, 0);
        await touch('touchEnd');
        await page.locator('#dialog').tap();
        await page.waitForFunction(() => !window.__slg.game.dialog);

        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await checkpoint(page);
        await page.locator('#btn-avatar').click();
        await page.locator('#avatar-panel').waitFor();
        await findSample(page, null, false, 0);
        await touch('touchEnd');
        await page.locator('#avatar-cancel').tap();

        await checkpoint(page);
        await touch('touchStart', [up]);
        await expectAcceleration(page, 'up');
        await checkpoint(page);
        await touch('touchStart', [up, await center(page, '[data-bike]', 3)]);
        assert.equal(await page.evaluate(() => window.__slg.game.riding), false);
        await findSample(page, 'up', false, 72);
        await touch('touchEnd');

        await checkpoint(page);
        await touch('touchStart', [up]);
        const walking = await findSample(page, 'up', false, 72);
        await page.waitForFunction(at => window.__bikeSamples.some(sample => sample.at >= at + 350
          && sample.dir === 'up' && !sample.run && Math.abs(sample.speed - 72) < 0.05), walking.at);
        assert.equal(await page.evaluate(at => window.__bikeSamples.some(sample => sample.at >= at && sample.run), walking.at), false);
        await touch('touchEnd');
      });
      await session.detach();
    });
  }
  console.log(`bicycle touch e2e: ${passed} checks passed`);
} finally {
  await browser.close();
}
