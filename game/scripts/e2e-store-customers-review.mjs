import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.SLG_URL ?? 'http://127.0.0.1:5494';
const shots = process.env.SLG_SHOTS;
const stores = ['konbini', 'greengrocer', 'bookstore', 'candy', 'bakery', 'cafe', 'pharmacy'];
const sentinel = 'store-customers-review-preserves-normal-progress';
const results = [], errors = [], requests = [];
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function inspect(page, store) {
  return page.evaluate(async store => {
    const { game } = window.__slg, area = game.area;
    const entry = [...game.world.areas.values()].flatMap(room => room.def.portals)
      .find(portal => portal.id === `${store}-enter`);
    if (!entry) throw new Error(`Missing store entrance: ${store}`);
    const key = (x, y) => `${x},${y}`;
    const reached = new Set(), queue = [entry.to];
    const moves = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let head = 0; head < queue.length; head++) {
      const { x, y } = queue[head], index = y * area.width + x;
      if (x < 0 || x >= area.width || y < 0 || y >= area.height || area.solid[index] || reached.has(key(x, y))) continue;
      reached.add(key(x, y));
      if (area.portalAt.has(index)) continue;
      for (const [dx, dy] of moves) queue.push({ x: x + dx, y: y + dy });
    }
    const touches = item => moves.some(([dx, dy]) => reached.has(key(item.x + dx, item.y + dy)));
    const customers = area.interactions.filter(item => item.id.startsWith(`${store}-customer-`));
    const clerk = area.interactions.find(item => item.eventKey === `shopping.${store}.clerk`);
    const visits = customers.map(customer => {
      const furniture = area.objects.filter(object => object.solid && customer.x >= object.x && customer.x < object.x + object.w &&
        customer.y >= object.y && customer.y < object.y + object.h);
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[customer.facing];
      const front = { x: customer.x + dx, y: customer.y + dy };
      const product = area.objects.find(object => object.solid && front.x >= object.x && front.x < object.x + object.w &&
        front.y >= object.y && front.y < object.y + object.h);
      return { id: customer.id, x: customer.x, y: customer.y, sprite: customer.sprite, facing: customer.facing,
        reachable: touches(customer), furniture: furniture.map(object => ({ kind: object.kind, facing: object.facing, layer: object.layer })),
        product: product?.kind };
    });
    let sittingPixels;
    if (store === 'cafe') {
      const { characterSprite } = await import('/src/render/sprites.ts');
      const topPixel = id => {
        const canvas = characterSprite(id, 'left', 0).canvas;
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3]) return y;
        }
        return null;
      };
      sittingPixels = [
        { seated: topPixel('grandma-reading-seated'), standing: topPixel('grandma') },
        { seated: topPixel('friend-seated'), standing: topPixel('friend') },
      ];
    }
    return { areaId: area.def.id, clerkReachable: !!clerk && touches(clerk), exitReachable: reached.has(key(area.def.portals[0].from.x, area.def.portals[0].from.y)),
      visits, sittingPixels, save: localStorage.getItem('slg-map-save-v1'), shopOpen: !!document.querySelector('#shop-panel:not([hidden])') };
  }, store);
}

async function faceCustomer(page, id) {
  const found = await page.evaluate(id => {
    const game = window.__slg.game, area = game.area;
    const target = area.interactions.find(item => item.id === id);
    if (!target) return false;
    for (const [dx, dy, facing] of [[0, 1, 'up'], [1, 0, 'left'], [0, -1, 'down'], [-1, 0, 'right']]) {
      const x = target.x + dx, y = target.y + dy, index = y * area.width + x;
      if (area.solid[index] || area.portalAt.has(index)) continue;
      game.player = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 15, facing };
      if (game.facingInteraction()?.id === id) return true;
    }
    return false;
  }, id);
  assert.ok(found, `can interact with seated customer ${id}`);
}

try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1280, height: 800 }, hasTouch: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  ]) {
    const { name, ...options } = device;
    const context = await browser.newContext({ ...options, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(value => localStorage.setItem('slg-map-save-v1', value), sentinel);
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== new URL(base).origin) { requests.push(request.url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    for (const store of stores) {
      await page.goto(`${base}/?skipOpening=1&review=1&shopReview=${store}&shopScene=1`, { waitUntil: 'networkidle' });
      await page.waitForFunction(store => window.__slg?.game.player.areaId === `shop-${store}-interior` && window.__slg?.renderer.stats.indoor, store);
      const checked = await inspect(page, store);
      assert.equal(checked.areaId, `shop-${store}-interior`);
      assert.equal(checked.shopOpen, false, 'review starts with the room visible');
      assert.ok(checked.clerkReachable && checked.exitReachable, `${store}: exit and clerk remain reachable`);
      assert.ok(checked.visits.length > 0);
      for (const visit of checked.visits) {
        assert.ok(visit.reachable, visit.id);
        if (store === 'cafe') {
          assert.match(visit.sprite, /-seated$/);
          assert.deepEqual(visit.furniture, [{ kind: 'cafe-chair', facing: visit.facing, layer: 'decal' }]);
          assert.equal(visit.product, 'cafe-table');
        } else {
          assert.deepEqual(visit.furniture, [], `${visit.id}: customer does not overlap a fixture`);
          assert.ok(visit.product, `${visit.id}: customer faces a product display`);
        }
      }
      assert.equal(checked.save, sentinel);
      if (store === 'cafe') {
        assert.equal(checked.visits.length, 2);
        assert.ok(checked.sittingPixels.every(pair => pair.seated > pair.standing), 'seated figures have visibly lowered upper bodies');
      }
      if (shots) await page.screenshot({ path: `${shots}/store-${store}-${name}.png` });
      results.push({ device: name, store, ...checked });
      console.log(`PASS ${name}/${store}: customers, product-facing or seats, clerk/exit route, normal save untouched`);
      if (store === 'cafe') {
        for (const id of ['cafe-customer-reader', 'cafe-customer-friend']) {
          await faceCustomer(page, id);
          if (options.hasTouch && !(await page.locator('#touch').evaluate(element => element.classList.contains('on')))) await page.locator('#btn-touch').tap();
          if (options.hasTouch) await page.locator('#touch [data-act]').tap();
          else { await page.locator('#view').focus(); await page.keyboard.press('KeyZ'); }
          await page.waitForFunction(() => !!window.__slg.game.dialog);
          const speaker = await page.evaluate(() => window.__slg.game.dialog.speaker);
          assert.ok(speaker.includes(id.endsWith('reader') ? '読書' : '友達'));
          if (shots) await page.screenshot({ path: `${shots}/${id}-${name}.png` });
          await page.locator('#dialog').click();
          await page.waitForFunction(() => !window.__slg.game.dialog);
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  if (shots) await writeFile(`${shots}/store-customer-results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} store scenes, seated customer conversations on desktop and mobile, no external requests or page errors`);
} finally { await browser.close(); }
