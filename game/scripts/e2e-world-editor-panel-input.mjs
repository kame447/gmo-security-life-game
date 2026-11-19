/**
 * World editor: input on the side panel (#properties) must never move the map camera, and the panel must scroll itself.
 * Read-only: nothing is saved, so this uses the shared dev server (SLG_URL) like e2e.mjs.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.SLG_URL ?? 'http://127.0.0.1:5173').origin;
const browser = await chromium.launch({ headless: true });
let passed = 0, failed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.log('FAIL', name, '-', String(error.message ?? error).split('\n').slice(0, 4).join(' | ')); }
}

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const view = page => page.evaluate(() => {
  const app = window.__worldEditor, panel = document.querySelector('#properties'), sprites = document.querySelector('#npc-sprites');
  return { centerX: app.camera.centerX, centerY: app.camera.centerY, zoom: app.camera.zoom, area: app.activeArea, overview: app.overview,
    panelTop: panel.scrollTop, spritesTop: sprites.scrollTop, document: JSON.stringify(app.model.document) };
});
const camera = v => ({ centerX: v.centerX, centerY: v.centerY, zoom: v.zoom, area: v.area, overview: v.overview });
const center = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
/** A point on the map that the panel does not cover. */
const mapPoint = page => page.evaluate(() => {
  const r = document.querySelector('#workspace').getBoundingClientRect(), p = document.querySelector('#properties').getBoundingClientRect();
  const x = Math.round(r.left + (p.left - r.left) / 2), y = Math.round(r.top + r.height / 2);
  if (document.elementFromPoint(x, y)?.id !== 'scene') throw new Error('No free map point');
  return { x, y };
});

async function open(viewport, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/world-editor.html`);
  await page.waitForFunction(() => window.__worldEditor?.renderer.stats.chunksDrawn > 0);
  // Open the list of people and pick the first one: the panel now holds the form, the sprite picker and the list.
  const click = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
  if (await page.locator('#npc-list-toggle').getAttribute('aria-expanded') !== 'true') await click('#npc-list-toggle');
  await click('#npc-list button');
  await page.locator('#npc-properties').waitFor({ state: 'visible' });
  await page.locator('#properties').evaluate(panel => { panel.scrollTop = 0; });
  await frames(page);
  return { context, page, errors, click };
}

try {
  for (const [name, viewport] of [['pc-1525x992', { width: 1525, height: 992 }], ['pc-1280x800', { width: 1280, height: 800 }]]) {
    const s = await open(viewport), { page } = s;
    const start = await view(page);
    const scrollable = await page.locator('#properties').evaluate(panel => panel.scrollHeight > panel.clientHeight + 1);
    const panelPoint = await center(page, '#object-name');

    await check(`${name}: wheel over the panel scrolls the panel and leaves the camera alone`, async () => {
      const before = await view(page);
      // The side panel must overflow here, otherwise this scenario would not prove that it scrolls.
      assert.equal(scrollable, true, 'panel content should overflow');
      await page.mouse.move(panelPoint.x, panelPoint.y);
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => document.querySelector('#properties').scrollTop > 0, null, { timeout: 2000 }).catch(() => {});
      const after = await view(page);
      assert.deepEqual(camera(after), camera(before));
      assert.ok(after.panelTop > 0, `panel scrollTop ${after.panelTop}`);
      await page.locator('#properties').evaluate(panel => { panel.scrollTop = 0; });
    });

    await check(`${name}: ctrl+wheel, sideways wheel and shift+wheel over the panel do not zoom or pan the map`, async () => {
      const before = await view(page);
      await page.mouse.move(panelPoint.x, panelPoint.y);
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.mouse.wheel(0, 120); await page.keyboard.up('Control');
      await page.mouse.wheel(300, 0);
      await page.keyboard.down('Shift'); await page.mouse.wheel(0, 300); await page.keyboard.up('Shift');
      await frames(page);
      assert.deepEqual(camera(await view(page)), camera(before));
      await page.locator('#properties').evaluate(panel => { panel.scrollTop = 0; });
    });

    await check(`${name}: wheel over the sprite picker scrolls only the picker`, async () => {
      const picker = page.locator('#npc-sprites');
      await picker.scrollIntoViewIfNeeded();
      const before = await view(page), point = await center(page, '#npc-sprites');
      const overflow = await picker.evaluate(node => node.scrollHeight > node.clientHeight + 1);
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, 60);
      if (overflow) await page.waitForFunction(top => document.querySelector('#npc-sprites').scrollTop > top, before.spritesTop, { timeout: 2000 }).catch(() => {});
      const after = await view(page);
      assert.deepEqual(camera(after), camera(before));
      if (overflow) assert.ok(after.spritesTop > before.spritesTop, `picker scrollTop ${before.spritesTop} -> ${after.spritesTop}`);
      await page.locator('#properties').evaluate(panel => { panel.scrollTop = 0; });
    });

    await check(`${name}: hover, a drag that starts on the panel, and double click on the panel leave the map alone`, async () => {
      const before = await view(page);
      const map = await mapPoint(page);
      await page.mouse.move(panelPoint.x, panelPoint.y);
      await page.mouse.move(panelPoint.x + 20, panelPoint.y + 10, { steps: 4 });
      await page.mouse.down(); await page.mouse.move(map.x, map.y, { steps: 8 }); await page.mouse.up();
      await page.mouse.dblclick(panelPoint.x, panelPoint.y);
      await frames(page);
      const after = await view(page);
      assert.deepEqual(camera(after), camera(before));
      assert.equal(after.document, start.document);
    });

    await check(`${name}: keys typed into the form stay in the form`, async () => {
      const before = await view(page);
      const field = page.locator('#npc-name'), original = await field.inputValue();
      await field.click();
      for (const key of ['End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'r', 'Space', 'Backspace', 'Delete']) await page.keyboard.press(key);
      await page.locator('#npc-lines').click();
      for (const key of ['ArrowUp', 'ArrowDown', 'Delete', 'Backspace', '+', '-']) await page.keyboard.press(key);
      await frames(page);
      const after = await view(page);
      assert.deepEqual(camera(after), camera(before));
      assert.equal(after.document, start.document, 'typing must not delete, rotate or move anything on the map');
      assert.notEqual(await field.inputValue(), original, 'the keys reached the text field');
      await page.locator('#npc-revert').click();
      assert.equal(await field.inputValue(), original);
    });

    await check(`${name}: buttons and the selector on the panel do not move the camera`, async () => {
      const before = await view(page);
      await page.locator('#npc-facing').selectOption('left');
      await page.locator('#npc-sprites button').first().click();
      await page.locator('#npc-revert').click();
      await page.locator('#object-details summary').click();
      await frames(page);
      const after = await view(page);
      assert.deepEqual(camera(after), camera(before));
      assert.equal(after.document, start.document);
    });

    await check(`${name}: wheel, ctrl+wheel, drag and the zoom buttons still work on the map`, async () => {
      const before = await view(page);
      const map = await mapPoint(page);
      await page.mouse.move(map.x, map.y);
      await page.mouse.wheel(0, 120);
      await page.waitForFunction(y => window.__worldEditor.camera.centerY !== y, before.centerY, { timeout: 2000 });
      const wheeled = await view(page);
      assert.ok(wheeled.centerY > before.centerY && wheeled.zoom === before.zoom);
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control');
      await page.waitForFunction(zoom => window.__worldEditor.camera.zoom !== zoom, before.zoom, { timeout: 2000 });
      const zoomed = await view(page);
      await page.locator('#zoom-out').click();
      assert.equal((await view(page)).zoom, zoomed.zoom - 1);
      // Dragging empty map pans; the picked person may be under the pointer, so hold Space to force a pan.
      const unpanned = await view(page);
      await page.locator('#workspace').focus();
      await page.keyboard.down('Space');
      await page.mouse.move(map.x, map.y); await page.mouse.down(); await page.mouse.move(map.x - 60, map.y - 40, { steps: 6 }); await page.mouse.up();
      await page.keyboard.up('Space');
      const panned = await view(page);
      assert.ok(panned.centerX > unpanned.centerX && panned.centerY > unpanned.centerY, 'drag pans the map');
    });

    await check(`${name}: the area selector still switches the screen, and no console errors`, async () => {
      const before = await view(page);
      const next = await page.locator('#area-select').evaluate((select, area) => [...select.options].map(option => option.value).find(value => value !== area), before.area);
      await page.locator('#area-select').selectOption(next);
      await page.waitForFunction(area => window.__worldEditor.activeArea === area, next);
    });

    await check(`${name}: double click on the panel does not enter the building behind it, and no console errors`, async () => {
      await page.locator('#area-select').selectOption('town-main');
      await page.waitForFunction(() => window.__worldEditor.activeArea === 'town-main');
      await frames(page);
      const target = await center(page, '#npc-list-title');
      // Put the family home exactly behind the panel's heading.
      await page.evaluate(({ x, y }) => {
        const app = window.__worldEditor, home = app.model.runtime().areas.get('town-main').objects.find(object => object.facilityId === 'home-family');
        const rect = document.querySelector('#workspace').getBoundingClientRect(), cx = (home.x + home.w / 2) * 16, cy = (home.y + home.h / 2) * 16;
        const at = app.toScreen(cx, cy), scale = (app.toScreen(cx + 16, cy).x - at.x) / 16;
        app.camera.centerX += (at.x - (x - rect.x)) / scale;
        app.camera.centerY += (at.y - (y - rect.y)) / scale;
      }, target);
      await frames(page);
      const behind = await page.evaluate(async ({ x, y }) => {
        const app = window.__worldEditor, { hitItem } = await import('/src/world-editor/hit-test.ts');
        const rect = document.querySelector('#workspace').getBoundingClientRect(), area = app.model.runtime().areas.get('town-main');
        const home = area.objects.find(object => object.facilityId === 'home-family'), cx = (home.x + home.w / 2) * 16, cy = (home.y + home.h / 2) * 16;
        const at = app.toScreen(cx, cy);
        return { offset: Math.hypot(at.x - (x - rect.x), at.y - (y - rect.y)), hit: hitItem(area, cx, cy)?.id === home.id,
          onPanel: !!document.elementFromPoint(x, y)?.closest('#properties') };
      }, target);
      assert.ok(behind.offset < 2 && behind.hit && behind.onPanel, JSON.stringify(behind));
      await page.mouse.dblclick(target.x, target.y);
      await frames(page);
      assert.equal((await view(page)).area, 'town-main');
      assert.deepEqual(s.errors, []);
    });
    await s.context.close();
  }

  {
    const name = 'touch-390x844', s = await open({ width: 390, height: 844 }, true), { page } = s;
    const cdp = await s.context.newCDPSession(page);
    const fingers = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, i) => ({ x: point.x, y: point.y, id: i + 1, radiusX: 2, radiusY: 2 })) });
    const swipe = async (from, dx, dy) => {
      await fingers('touchStart', [from]);
      for (let n = 1; n <= 8; n++) { await fingers('touchMove', [{ x: from.x + dx * n / 8, y: from.y + dy * n / 8 }]); await page.waitForTimeout(20); }
      await fingers('touchEnd', []);
      await frames(page);
    };
    const start = await view(page);
    await check(`${name}: a finger dragged on the panel scrolls the panel, not the map`, async () => {
      const box = await page.locator('#properties').boundingBox();
      const scrollable = await page.locator('#properties').evaluate(panel => panel.scrollHeight > panel.clientHeight + 1);
      assert.equal(scrollable, true, 'panel content should overflow');
      // Start on the panel's heading: lower down, the sprite picker is its own scroller.
      const top = await center(page, '#object-position');
      await swipe(top, 0, -120);
      await page.waitForFunction(() => document.querySelector('#properties').scrollTop > 0, null, { timeout: 2000 }).catch(() => {});
      const after = await view(page);
      assert.deepEqual(camera(after), camera(start));
      assert.ok(after.panelTop > 0, `panel scrollTop ${after.panelTop}`);
    });
    await check(`${name}: taps on the panel's buttons do not move the camera`, async () => {
      await page.locator('#properties').evaluate(panel => { panel.scrollTop = 0; });
      await page.locator('#object-details summary').tap();
      await page.locator('#npc-facing').selectOption('left');
      await page.locator('#npc-revert').tap();
      await frames(page);
      assert.deepEqual(camera(await view(page)), camera(start));
    });
    await check(`${name}: a finger dragged on the map still pans it, and no console errors`, async () => {
      const r = await page.locator('#workspace').boundingBox(), p = await page.locator('#properties').boundingBox();
      // Close the panel first so that the map is exposed, then drag below where the person stands.
      await page.keyboard.press('Escape');
      await s.click('#npc-list-toggle');
      await frames(page);
      const before = await view(page);
      await swipe({ x: r.x + 30, y: r.y + r.height - 40 }, 60, -80);
      const after = await view(page);
      assert.ok(after.centerX !== before.centerX || after.centerY !== before.centerY, `map did not pan (panel was ${Math.round(p.width)}px wide)`);
      assert.deepEqual(s.errors, []);
    });
    await cdp.detach();
    await s.context.close();
  }
} finally {
  await browser.close();
}
console.log(`SUMMARY ${passed}/${passed + failed} ${failed ? 'FAIL' : 'PASS'}`);
if (failed) process.exitCode = 1;
