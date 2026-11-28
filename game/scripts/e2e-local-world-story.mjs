import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5500';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const scenes = [
  { id: 'high-school', areaId: 'high-school-interior', stageIndex: 1, x: 9, y: 12, key: 'school.high.teacher', eventId: 'story.optional.hs.study', choice: 'plan' },
  { id: 'university', areaId: 'university-interior', stageIndex: 2, x: 11, y: 14, key: 'school.university.friend', eventId: 'story.optional.univ.project', choice: 'research' },
  { id: 'office', areaId: 'office-interior', stageIndex: 3, x: 10, y: 12, key: 'office.colleague', eventId: 'story.optional.work.break', choice: 'ask' },
  { id: 'cafe', areaId: 'shop-cafe-interior', stageIndex: 4, x: 8, y: 12, key: 'optional.cafe.friend', eventId: 'story.optional.later.cafe', choice: 'memories' },
];
const browser = await chromium.launch({ headless: true });
const errors = [];
let passed = 0;
async function shot(page, name) { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); }
async function settle(page, areaId) {
  await page.waitForFunction(id => window.__slg?.game.player.areaId === id &&
    document.querySelector('#minimap-button')?.dataset.areaId === id && window.__slg?.renderer.stats.indoor, areaId);
}
async function face(page, key) {
  const found = await page.evaluate(eventKey => {
    const game = window.__slg.game, area = game.area;
    const target = area.interactions.find(item => item.eventKey === eventKey);
    if (!target) return false;
    for (let y = 1; y < area.height - 1; y++) for (let x = 1; x < area.width - 1; x++) {
      if (area.solid[y * area.width + x] || area.portalAt.has(y * area.width + x)) continue;
      for (const facing of ['up', 'right', 'down', 'left']) {
        game.player = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 15, facing };
        if (game.facingInteraction()?.id === target.id) return true;
      }
    }
    return false;
  }, key);
  assert.ok(found, `cannot face ${key}`);
}
async function action(page, touch) {
  if (touch) await page.locator('#touch [data-act]').tap();
  else { await page.locator('#view').focus(); await page.keyboard.press('KeyZ'); }
}
async function readLine(page, touch) {
  const before = await page.evaluate(() => {
    const d = window.__slg.game.dialog;
    return d && { index: d.index, line: d.lines[d.index] };
  });
  if (!before) return;
  if (touch) await page.locator('#dialog').tap();
  else await page.locator('#dialog').click();
  await page.waitForFunction(before => {
    const d = window.__slg.game.dialog;
    return !d || d.index !== before.index || d.lines[d.index] !== before.line;
  }, before);
}

try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const touch = width < 500;
    for (const scene of scenes) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      // Every scene uses a disposable context; the user's real saves are never opened.
      await context.addInitScript(scene => {
        if (sessionStorage.getItem('local-world-review-seeded')) return;
        localStorage.setItem('slg-map-save-v1', JSON.stringify({
          v: 1, variantId: 'childhood', areaId: scene.areaId, x: scene.x * 16 + 8, y: scene.y * 16 + 15, facing: 'up',
          story: { v: 2, phase: 'milestone', stageIndex: scene.stageIndex, bikeChoice: 'site-a', errandsDone: ['school', 'konbini', 'park', 'station'],
            stepsDone: [], stepElapsed: 0, choices: {} },
        }));
        sessionStorage.setItem('local-world-review-seeded', '1');
      }, scene);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(`${scene.id}/${width}: ${error.message}`));
      try {
        await page.goto(url + '/?skipOpening=1', { waitUntil: 'networkidle' });
        await settle(page, scene.areaId);
        await page.waitForFunction(() => !!window.__slgStory && !window.__slg.game.dialog);
        if (touch && !await page.locator('#touch').evaluate(el => el.classList.contains('on'))) await page.locator('#btn-touch').tap();
        await shot(page, `${scene.id}-${width}-room`);
        const npcCount = await page.evaluate(() => window.__slg.game.area.interactions.filter(item => item.kind === 'npc').length);
        assert.ok(npcCount >= 2, 'room has conversational people');
        await face(page, scene.key); await action(page, touch);
        await page.waitForFunction(() => !!window.__slg.game.dialog);
        await readLine(page, touch);
        await page.locator('#life-choice').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#life-choice button').count(), 3);
        const box = await page.locator('#life-choice').boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, 'choices fit viewport');
        await shot(page, `${scene.id}-${width}-choices`);
        const button = page.locator(`#life-choice [data-choice-id="${scene.choice}"]`);
        if (touch) await button.tap(); else await button.click();
        await page.locator('#life-choice').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(id => window.__slgStory.choices[id], scene.eventId), scene.choice);
        assert.deepEqual(await page.evaluate(() => window.__slgStory.stepsDone), []);
        assert.equal(await page.evaluate(() => window.__slgStory.phase), 'milestone');
        await readLine(page, touch);
        await page.reload({ waitUntil: 'networkidle' });
        await settle(page, scene.areaId);
        if (touch && !await page.locator('#touch').evaluate(el => el.classList.contains('on'))) await page.locator('#btn-touch').tap();
        assert.equal(await page.evaluate(id => window.__slgStory.choices[id], scene.eventId), scene.choice);
        await face(page, scene.key); await action(page, touch); await readLine(page, touch);
        assert.equal(await page.locator('#life-choice').isHidden(), true, 'completed activity does not replay');
        passed++;
        console.log(`PASS ${scene.id} ${width}×${height}: room, optional choice, save/resume, no replay`);
      } finally { await context.close(); }
    }
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${passed} local world/story browser scenarios`);
} finally { await browser.close(); }
