import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5490';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const sizes = [
  ['desktop', 1280, 800, false], ['portrait', 390, 844, true],
  ['landscape', 844, 390, true], ['narrow', 320, 568, true],
];
let passed = 0;
const check = async (name, fn) => { await fn(); console.log('PASS ' + name); passed++; };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: shots + '/' + name + '.png' }); };

async function seedEnding(page) {
  await page.goto(url + '/?review=1&skipOpening=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game);
  const data = await page.evaluate(async () => {
    const { STORY_STAGES, STORY_ERRANDS, STORY_BEDROOM, STORY_BIKE, STORY_ERRAND_ALLOWANCE_YEN } = await import('/src/story/config.ts');
    const { STORY_EVENTS } = await import('/src/story/events.ts');
    const { newStoryState } = await import('/src/story/state.ts');
    const { meetsCondition } = await import('/src/story/director.ts');
    const game = window.__slg.game;
    const state = newStoryState();
    state.phase = 'milestone';
    state.stageIndex = STORY_STAGES.length - 1;
    state.errandsDone = STORY_ERRANDS.map(e => e.id);
    state.bikeChoice = 'site-a';
    state.choices[STORY_BIKE.eventId] = state.bikeChoice;
    let money = 1000 + STORY_ERRAND_ALLOWANCE_YEN - 160 + STORY_BIKE.budgetYen - STORY_BIKE.fairPriceYen;
    for (const stage of STORY_STAGES) {
      money += stage.incomeYen ?? 0;
      const done = [];
      for (const step of stage.steps) {
        if (step.when && !meetsCondition(step.when, state.choices)) continue;
        const event = STORY_EVENTS.find(e => e.id === step.eventId);
        const choice = event?.choices?.[0];
        if (choice) {
          state.choices[step.eventId] = choice.id;
          money = Math.max(0, money + (choice.score?.moneyYen ?? 0));
        }
        done.push(step.eventId);
      }
      state.stepsDone = done;
    }
    game.warp(STORY_BEDROOM);
    game.assets.changeMoney(money - game.assets.moneyYen);
    const save = game.serialize();
    save.story = state;
    localStorage.setItem('slg-map-save-v1', JSON.stringify(save));
    return save;
  });
  await page.goto(url + '/?skipOpening=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__slgStory?.phase === 'milestone');
  return data;
}

async function faceBed(page) {
  const ok = await page.evaluate(() => {
    const game = window.__slg.game;
    const area = game.world.areas.get('home-family-2f');
    const target = area.interactions.find(i => i.eventKey === 'home.bed');
    for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
      if (area.solid[y * area.width + x] || area.portalAt.has(y * area.width + x)) continue;
      for (const facing of ['up', 'right', 'down', 'left']) {
        game.player = { areaId: area.def.id, x: x * 16 + 8, y: y * 16 + 15, facing };
        if (game.facingInteraction()?.id === target.id) return true;
      }
    }
    return false;
  });
  assert.ok(ok);
  await page.locator('#view').focus();
}

async function finishAtBed(page) {
  await faceBed(page);
  await page.keyboard.press('KeyZ');
  for (let i = 0; i < 30; i++) {
    if (await page.locator('#life-choice').isVisible()) break;
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(50);
  }
  await page.locator('#life-choice').waitFor({ state: 'visible' });
  await page.keyboard.press('Digit1');
  for (let i = 0; i < 50; i++) {
    if (await page.locator('#story-result').isVisible()) return;
    if (await page.evaluate(() => !!window.__slg.game.dialog)) await page.keyboard.press('KeyZ');
    await page.waitForTimeout(50);
  }
  await page.locator('#story-result').waitFor({ state: 'visible' });
}

try {
  for (const [name, width, height, touch] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const fixture = await seedEnding(page);
    if (name === 'desktop' && process.env.SLG_FIXTURE) {
      fixture.story.phase = 'finished';
      await writeFile(process.env.SLG_FIXTURE, JSON.stringify(fixture, null, 2));
    }

    await check(name + ': final bed choice opens a saved finished result', async () => {
      assert.equal(await page.locator('#btn-story-result').isVisible(), false);
      await finishAtBed(page);
      assert.equal(await page.evaluate(() => window.__slgStory.phase), 'finished');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slg-map-save-v1')).story.phase), 'finished');
      assert.equal(await page.locator('#stage').evaluate(e => e.classList.contains('modal-open')), true);
    });
    const expected = await page.evaluate(() => window.__slgStory.evaluate());

    await check(name + ': daily values and all memories match the saved choices', async () => {
      assert.equal(await page.locator('.story-result-score-value').innerText(), String(expected.daily.total));
      assert.deepEqual(await page.locator('.story-result-part dd').allTextContents(),
        [expected.daily.money, expected.daily.ties, expected.daily.growth].map(n => n + ' 点'));
      assert.deepEqual(await page.locator('.story-result-history li').allTextContents(), expected.dailyMemories);
      assert.match(await page.locator('.story-result-facts').innerText(), /所持金/);
      await shot(page, name + '-daily');
    });

    await check(name + ': security tab displays outcomes and actual response counts', async () => {
      if (touch) await page.locator('#story-result-tab-security').tap();
      else await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#story-result-tab-security').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.story-result-score-value').innerText(), String(expected.security.total));
      assert.deepEqual(await page.locator('.story-result-part dd').allTextContents(),
        [expected.security.judgment, expected.security.damage, expected.security.response].map(n => n + ' 点'));
      assert.deepEqual(await page.locator('.story-result-history li').allTextContents(), expected.securityMemories);
      assert.equal(await page.locator('.story-result-facts').innerText(), '被害 ' + expected.damages + '回　対処 ' + expected.responses + '回');
      await shot(page, name + '-security');
    });

    await check(name + ': dialog and return button fit and focus remains inside', async () => {
      for (const selector of ['.story-result-window', '#story-result-close', '#story-result-tab-security']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, selector);
      }
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#story-result')), true);
      }
      await page.locator('#story-result-content').focus();
      const position = await page.evaluate(() => ({ ...window.__slg.game.player }));
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(160);
      await page.keyboard.up('ArrowDown');
      await page.keyboard.press('KeyP');
      assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), position);
      assert.equal(await page.locator('#story-result').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__slg.game.phone.isOpen), false);
    });

    await check(name + ': long history scrolls while the return button stays visible', async () => {
      await page.locator('#story-result-tab-security').click();
      const area = page.locator('#story-result-content');
      if (touch) {
        const box = await area.boundingBox();
        const client = await context.newCDPSession(page);
        const x = box.x + box.width / 2;
        const from = box.y + box.height * 0.85;
        const to = box.y + box.height * 0.25;
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
        for (let i = 1; i <= 6; i++) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 6 }] });
          await page.waitForTimeout(20);
        }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await client.detach();
      } else {
        await area.focus();
        await page.keyboard.press('PageDown');
      }
      await page.waitForFunction(() => document.querySelector('#story-result-content').scrollTop > 0);
      assert.equal(await page.locator('#story-result-close').isVisible(), true);
    });

    await check(name + ': close returns control and finished result can reopen and reload', async () => {
      if (touch) await page.locator('#story-result-close').tap();
      else await page.keyboard.press('Escape');
      await page.locator('#story-result').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('#btn-story-result').hidden);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'view');
      assert.equal(await page.locator('#stage').evaluate(e => e.classList.contains('modal-open')), false);
      if (touch) await page.locator('#btn-story-result').tap();
      else await page.keyboard.press('KeyR');
      await page.locator('#story-result').waitFor({ state: 'visible' });
      await page.keyboard.press('KeyR');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__slgStory?.phase === 'finished');
      assert.equal(await page.locator('#story-result').isVisible(), false);
      await page.locator('#btn-story-result').click();
      await page.locator('#story-result').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.story-result-score-value').innerText(), String(expected.daily.total));
      assert.deepEqual(await page.locator('.story-result-history li').allTextContents(), expected.dailyMemories);
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(passed + ' checks passed');
} finally {
  await browser.close();
}
