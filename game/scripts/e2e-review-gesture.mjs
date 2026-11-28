import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.SLG_URL ?? 'http://127.0.0.1:5494';
const output = process.env.SLG_SHOTS;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, deviceScaleFactor: 1 });
    const errors = [], external = [];
    try {
      await context.route('**/*', route => {
        const address = new URL(route.request().url());
        if (address.origin === new URL(base).origin || ['data:', 'blob:'].includes(address.protocol)) return route.continue();
        external.push(address.href); return route.abort();
      });
      await context.addInitScript(() => localStorage.setItem('slg-map-save-v1', 'gesture-normal-save-sentinel'));
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?skipOpening=1&localReview=university`);
      await page.waitForFunction(() => window.__slg?.game && window.__slgStory && !window.__slg.game.dialog);
      if (!await page.locator('#touch').evaluate(element => element.classList.contains('on'))) await page.locator('#btn-touch').tap();
      const expected = await page.evaluate(async () => {
        const { STORY_EVENTS } = await import('/src/story/events.ts');
        const game = window.__slg.game, area = game.area;
        const target = area.interactions.find(item => item.eventKey === 'school.university.friend');
        for (let y = 1; y < area.height - 1; y++) for (let x = 1; x < area.width - 1; x++) {
          if (area.solid[y * area.width + x] || area.portalAt.has(y * area.width + x)) continue;
          for (const facing of ['up', 'right', 'down', 'left']) {
            game.player = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 15, facing };
            if (game.facingInteraction()?.id === target?.id) return STORY_EVENTS.find(item => item.id === 'story.optional.univ.project').intro[0];
          }
        }
        throw new Error('Cannot face actual university friend');
      });
      await page.locator('#touch [data-act]').tap();
      await page.evaluate(() => new Promise(resolve => {
        let frames = 0; const step = () => ++frames >= 4 ? resolve() : requestAnimationFrame(step); requestAnimationFrame(step);
      }));
      const first = await page.evaluate(() => ({ index: window.__slg.game.dialog?.index,
        text: document.querySelector('#dialog .text').textContent, choicesHidden: document.querySelector('#life-choice').hidden }));
      assert.deepEqual(first, { index: 0, text: expected, choicesHidden: true }, 'A single A gesture must leave the first intro line visible');
      if (output) await page.screenshot({ path: `${output}/university-${width}-first-tap.png` });
      for (let index = 0; index < 12 && await page.locator('#life-choice').isHidden(); index++) {
        const before = await page.evaluate(() => JSON.stringify(window.__slg.game.dialog));
        await page.locator('#dialog').tap();
        await page.waitForFunction(value => !document.querySelector('#life-choice').hidden || JSON.stringify(window.__slg.game.dialog) !== value, before);
      }
      await page.locator('#life-choice').waitFor({ state: 'visible' });
      const choice = page.locator('#life-choice [data-choice-id]').first();
      const id = await choice.getAttribute('data-choice-id');
      await choice.tap();
      await page.waitForFunction(id => window.__slgStory.choices['story.optional.univ.project'] === id, id);
      assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), 'gesture-normal-save-sentinel');
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      rows.push({ width, height, firstIntroPreserved: true, nextGestureAdvances: true, choiceRecorded: id, normalSavePreserved: true });
      console.log(`PASS ${width}x${height}: one tap keeps intro; next tap progresses; choice recorded`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (output) await writeFile(`${output}/gesture-results.json`, JSON.stringify(rows, null, 2));
console.log(`PASS ${rows.length}/2 gesture scenarios`);
