// Story guidance and indoor playfield regression checks in isolated, disposable saves.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5489';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const sizes = [[1280, 800], [390, 844], [844, 390], [320, 568]];
const errors = [];
let passed = 0;
let milestoneFixture;
async function check(name, action) { await action(); passed++; console.log('PASS ' + name); }
async function shot(page, name) { if (shots) await page.screenshot({ path: shots + '/' + name + '.png' }); }
async function click(page, selector, touch) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}
async function action(page, touch) {
  if (touch) await click(page, '#touch [data-act]', true);
  else { await page.locator('#view').focus(); await page.keyboard.press('KeyZ'); }
}
async function readAll(page, touch) {
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(80);
    if (!(await page.evaluate(() => !!window.__slg.game.dialog))) {
      await page.waitForTimeout(180);
      if (!(await page.evaluate(() => !!window.__slg.game.dialog))) return;
    }
    if (touch) await click(page, '#dialog', true);
    else await page.keyboard.press('KeyZ');
  }
  throw new Error('dialog did not finish');
}

async function readErrandIntroduction(page, touch, label) {
  const places = ['中学校の先生', 'コンビニでノートを買う', '公園の友達', '駅の駅員さん'];
  const targets = ['school', 'shop-konbini', 'park', 'station'];
  let count = 0;
  for (let step = 0; step < 20; step++) {
    const current = await page.evaluate(() => {
      const dialog = window.__slg.game.dialog;
      return dialog && { speaker: dialog.speaker, line: dialog.lines[dialog.index], index: dialog.index };
    });
    if (!current) break;
    assert.equal(current.speaker, '母');
    const task = places.findIndex(place => current.line === '・' + place);
    if (task >= 0) count = task + 1;
    const expected = targets.slice(0, count);
    await page.waitForFunction(({ count, expected }) => {
      const hud = document.querySelector('#story-hud');
      const points = JSON.parse(document.querySelector('#minimap-button canvas')?.dataset.goalLocations ?? '[]');
      return hud.hidden === (count === 0) &&
        hud.querySelectorAll('.story-tasks li').length === count &&
        JSON.stringify(points.map(point => point.id).sort()) === JSON.stringify([...expected].sort());
    }, { count, expected });
    if (task === 0) await shot(page, label + '-first-errand-dialog');
    if (touch) await click(page, '#dialog', true);
    else await page.keyboard.press('KeyZ');
    await page.waitForFunction(index => window.__slg.game.dialog?.index !== index, current.index);
  }
  assert.equal(count, 4);
  assert.equal(await page.evaluate(() => !!window.__slg.game.dialog), false);
  await page.waitForFunction(() => document.querySelectorAll('#story-hud .story-tasks li').length === 4);
}

// Only position is a fixture. Interaction and dialog advancement use the actual controls.
async function face(page, eventKey) {
  const found = await page.evaluate(key => {
    const game = window.__slg.game;
    for (const area of game.world.areas.values()) {
      const target = area.interactions.find(item => item.eventKey === key);
      if (!target) continue;
      for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
        if (area.solid[y * area.width + x] || area.portalAt.has(y * area.width + x)) continue;
        for (const facing of ['up', 'right', 'down', 'left']) {
          game.player = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 15, facing };
          if (game.facingInteraction()?.id === target.id) return true;
        }
      }
    }
    return false;
  }, eventKey);
  assert.ok(found, 'cannot face ' + eventKey);
  await settle(page);
}
async function position(page, areaId, x, y, facing = 'down') {
  await page.evaluate(p => { window.__slg.game.player = p; }, { areaId, x: x * 16 + 8, y: y * 16 + 15, facing });
  await settle(page);
}
async function settle(page) {
  await page.waitForFunction(() => window.__slg.renderer.stats.indoor === (window.__slg.game.area.def.kind === 'indoor') &&
    document.querySelector('#minimap-button')?.dataset.areaId === window.__slg.game.player.areaId);
  await page.waitForTimeout(120);
}
async function goalAt(page, id, target) {
  const expected = await page.evaluate(({ id, target }) => {
    const area = window.__slg.game.area;
    const rect = target.eventKey ? area.interactions.find(item => item.eventKey === target.eventKey)
      : area.def.portals.find(portal => portal.to.areaId === target.areaId)?.from;
    if (!rect) throw new Error('missing expected target for ' + id);
    return { id, x: rect.x + (rect.w ?? 1) / 2, y: rect.y + (rect.h ?? 1) / 2 };
  }, { id, target });
  await page.waitForFunction(expected => {
    const points = JSON.parse(document.querySelector('#minimap-button canvas')?.dataset.goalLocations ?? '[]');
    return points.some(point => point.id === expected.id && point.x === expected.x && point.y === expected.y);
  }, expected);
  return expected;
}
function overlaps(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
async function checklistLayout(page, width, height) {
  const list = page.locator('#story-hud .story-tasks li');
  assert.equal(await list.count(), 4);
  assert.deepEqual(await list.locator('.story-task-label').allTextContents(),
    ['学校の先生と話す', 'コンビニでノートを買う', '公園の友達に会う', '駅員さんと話す']);
  const hud = await page.locator('#story-hud').boundingBox();
  assert.ok(hud && hud.x >= 0 && hud.y >= 0 && hud.x + hud.width <= width && hud.y + hud.height <= height);
  for (const selector of ['#menu', '#hud', '#minimap-button']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && !overlaps(hud, box), 'checklist overlaps ' + selector + ': ' + JSON.stringify({ hud, box }));
  }
}
async function camera(page) {
  return page.evaluate(() => {
    const { zoom, viewW, viewH, camX, camY } = window.__slg.renderer.stats;
    return { zoom, viewW, viewH, camX, camY, width: document.querySelector('#view').width, height: document.querySelector('#view').height };
  });
}
async function indoorClearance(page) {
  const data = await page.evaluate(() => {
    const { game, renderer } = window.__slg;
    const view = document.querySelector('#view');
    const canvas = view.getBoundingClientRect();
    const hotbar = document.querySelector('.bag-quick-hud').getBoundingClientRect();
    const exit = game.area.def.portals.find(portal => portal.to.areaId === 'town-main');
    const { zoom, camX, camY } = renderer.stats;
    const scale = zoom * canvas.width / view.width;
    const project = (x, y, w, h) => ({ x: canvas.x + (x - camX) * scale,
      y: canvas.y + (y - camY) * scale, width: w * scale, height: h * scale });
    return { canvas: canvas.toJSON(), hotbar: hotbar.toJSON(),
      exit: project(exit.from.x * 16, exit.from.y * 16, (exit.from.w ?? 1) * 16, (exit.from.h ?? 1) * 16),
      player: project(game.player.x - 9, game.player.y - 26, 18, 26) };
  });
  assert.ok(data.canvas.bottom <= data.hotbar.top - 8, 'canvas overlaps hotbar: ' + JSON.stringify(data));
  for (const key of ['exit', 'player']) {
    const rect = data[key];
    assert.ok(rect.y >= data.canvas.top && rect.y + rect.height <= data.canvas.bottom + 1,
      key + ' is clipped: ' + JSON.stringify(data));
    assert.ok(!overlaps(rect, data.hotbar), key + ' overlaps hotbar');
  }
}

try {
  for (const [width, height] of sizes) {
    const label = width + 'x' + height;
    const touch = width !== 1280;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
      hasTouch: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(label + ': ' + error.message));
    page.setDefaultTimeout(10000);
    try {
      await page.goto(url + '/?story=1&skipOpening=1', { waitUntil: 'networkidle' });
      await page.bringToFront();
      await page.waitForFunction(() => !!window.__slg?.game && !!window.__slgStory);
      await readAll(page, touch);
      if (touch && !(await page.locator('#touch').evaluate(el => el.classList.contains('on')))) await click(page, '#btn-touch', touch);
      await check(label + ' guides downstairs to the actual mother', async () => {
        await goalAt(page, 'home-family', { areaId: 'home-family-interior' });
        await face(page, 'home.mother');
        await goalAt(page, 'home-family', { eventKey: 'home.mother' });
        await action(page, touch);
      });
      await check(label + ' reveals each task and map target with the corresponding spoken line', async () => {
        await readErrandIntroduction(page, touch, label);
        assert.equal(await page.evaluate(() => window.__slgStory.phase), 'errands');
      });
      await check(label + ' checklist and real outdoor goals fit beside the menu and minimap', async () => {
        await position(page, 'town-main', 30, 30);
        await checklistLayout(page, width, height);
        assert.equal(await page.locator('#story-hud .is-done').count(), 0);
        await goalAt(page, 'station', { eventKey: 'station.staff' });
        await goalAt(page, 'park', { eventKey: 'park.friend' });
        await goalAt(page, 'school', { areaId: 'school-classroom-interior' });
        await goalAt(page, 'shop-konbini', { areaId: 'shop-konbini-interior' });
        await shot(page, label + '-errands-town');
        if (!touch) {
          await click(page, '#minimap-button', touch);
          assert.equal(await page.locator('#full-map-canvas').getAttribute('data-goal-locations'),
            await page.locator('#minimap-button canvas').getAttribute('data-goal-locations'));
          await shot(page, label + '-full-map-goals');
          await click(page, '#full-map-close', touch);
        }
      });
      const outdoor = await camera(page);
      await check(label + ' reaches the clerk and completes the school task through real controls', async () => {
        await face(page, 'shopping.konbini.clerk');
        await goalAt(page, 'shop-konbini', { eventKey: 'shopping.konbini.clerk' });
        await face(page, 'school.teacher');
        await goalAt(page, 'school', { eventKey: 'school.teacher' });
        await action(page, touch);
        await readAll(page, touch);
        await page.waitForSelector('#story-hud li[data-errand="school"].is-done');
        assert.match(await page.locator('#story-hud li[data-errand="school"]').getAttribute('aria-label'), /完了/);
        assert.equal(await page.locator('#story-hud .is-done').count(), 1);
        assert.deepEqual(await page.evaluate(() => window.__slgStory.errandsDone), ['school']);
        await goalAt(page, 'school', { eventKey: 'school.teacher' });
        assert.ok((await page.locator('#minimap-button canvas').getAttribute('data-goal-done')).includes('school'));
      });
      await check(label + ' indoor exit and player stay above the hotbar at the outdoor scale', async () => {
        await position(page, 'school-classroom-interior', 8, 10, 'down');
        await checklistLayout(page, width, height);
        await indoorClearance(page);
        const indoor = await camera(page);
        assert.equal(indoor.zoom, outdoor.zoom);
        assert.equal(indoor.viewW, outdoor.viewW);
        assert.ok(indoor.height < outdoor.height);
        await shot(page, label + '-school-exit-checklist');
        await click(page, '#btn-inventory', touch);
        await page.locator('.bag-overlay').waitFor({ state: 'visible' });
        await page.waitForTimeout(150);
        assert.deepEqual(await camera(page), indoor, 'opening bag moves the camera');
        await click(page, '.bag-close', touch);
        await page.locator('.bag-overlay').waitFor({ state: 'hidden' });
        await page.waitForTimeout(150);
        assert.deepEqual(await camera(page), indoor, 'closing bag moves the camera');
        await indoorClearance(page);
      });
      await check(label + ' saved task completion survives reload', async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await page.goto(url + '/?skipOpening=1', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.__slgStory);
        await page.waitForSelector('#story-hud li[data-errand="school"].is-done');
        assert.equal(await page.locator('#story-hud .is-done').count(), 1);
        assert.deepEqual(await page.evaluate(() => window.__slgStory.errandsDone), ['school']);
        assert.equal(await page.evaluate(() => window.__slgStory.phase), 'errands');
        if (!milestoneFixture) milestoneFixture = await page.evaluate(() => ({ ...window.__slg.game.serialize(), story: window.__slgStory.save() }));
      });
    } catch (error) {
      await shot(page, label + '-failure');
      console.error(await page.evaluate(() => ({ phase: window.__slgStory?.phase, area: window.__slg?.game.player.areaId,
        dialog: window.__slg?.game.dialog, hidden: document.hidden, stage: document.querySelector('#stage')?.className,
        stats: window.__slg?.renderer.stats, minimapArea: document.querySelector('#minimap-button')?.dataset.areaId })));
      throw error;
    } finally { await context.close(); }
  }

  // A saved milestone avoids replaying the unrelated life-event branches just to check the bed route.
  milestoneFixture.story.phase = 'milestone';
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await context.addInitScript(fixture => localStorage.setItem('slg-map-save-v1', JSON.stringify(fixture)), milestoneFixture);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push('milestone: ' + error.message));
  await page.goto(url + '/?skipOpening=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slgStory);
  await check('milestone follows the upstairs stair and then the actual bed', async () => {
    await position(page, 'home-family-interior', 7, 10);
    await goalAt(page, 'home-family', { areaId: 'home-family-2f' });
    await position(page, 'home-family-2f', 5, 5);
    await goalAt(page, 'home-family', { eventKey: 'home.bed' });
    await shot(page, '1280x800-bedroom-bed-goal');
  });
  await context.close();
  assert.deepEqual(errors, []);
  console.log('\n' + passed + ' passed; no browser errors');
} finally { await browser.close(); }
