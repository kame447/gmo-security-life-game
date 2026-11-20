// ストーリーの流れ（docs/features/story.md）を実ブラウザで確認する：2階で目覚める → 階段 → 玄関で呼び止め →
// 母親からスマホ → お使い → 自転車の購入（偽サイトを選ぶ）→ 中学のステージ開始 → 再読み込みで再開。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5173';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let passed = 0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const state = page => page.evaluate(() => ({ area: window.__slg.game.player.areaId, phase: window.__slgStory?.phase,
  dialog: window.__slg.game.dialog, hud: document.querySelector('#story-hud')?.textContent ?? '' }));

/** Stand next to the interaction with this eventKey, facing it (position only; the talk itself uses the real key). */
async function face(page, eventKey) {
  const ok = await page.evaluate(key => {
    const game = window.__slg.game;
    for (const area of game.world.areas.values()) {
      const target = area.interactions.find(i => i.eventKey === key);
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
  assert.ok(ok, `cannot face ${eventKey}`);
}
/** Press Z until no dialog is open (the story may queue several). */
async function readAll(page) {
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(60);
    const open = await page.evaluate(() => !!window.__slg.game.dialog || !document.querySelector('#life-choice')?.hidden);
    if (!open) { await page.waitForTimeout(150); if (!(await page.evaluate(() => !!window.__slg.game.dialog))) return; }
    if (await page.evaluate(() => !document.querySelector('#life-choice')?.hidden)) return;
    await page.keyboard.press('KeyZ');
  }
}
async function hold(page, key, ms) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }

const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${url}/?story=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__slg?.game && !!window.__slgStory);
  await page.locator('#view').focus();

  await check('wakes up in the upstairs bedroom with no phone and no bicycle', async () => {
    await page.waitForFunction(() => document.querySelector('#story-hud')?.textContent?.includes('おかあさんに はなしかけよう'));
    assert.equal((await state(page)).area, 'home-family-2f');
    // The touch pad itself is off on desktop; the bicycle button carries its own hidden attribute.
    assert.equal(await page.locator('#touch [data-bike]').evaluate(b => b.hidden), true);
    await page.waitForFunction(() => window.__slg.game.dialog?.lines[0]?.includes('あさだ'));
    await page.waitForTimeout(1900); // let the wake-up fade finish for the screenshot
    await shot(page, '01-wake');
    await readAll(page);
    assert.equal(await page.evaluate(() => window.__slg.game.phone.isOwned), false);
    assert.doesNotMatch(await page.locator('#hint').textContent(), /じてんしゃ/);
  });

  await check('walks to the stairs and goes down to the first floor', async () => {
    await hold(page, 'ArrowRight', 1300);
    await hold(page, 'ArrowUp', 600);
    await page.waitForFunction(() => window.__slg.game.player.areaId === 'home-family-interior');
    await page.waitForTimeout(400);
    await shot(page, '02-downstairs');
  });

  await check('the front door is closed until the mother is met', async () => {
    await page.evaluate(() => { window.__slg.game.player = { areaId: 'home-family-interior', x: 7 * 16 + 16, y: 10 * 16 + 15, facing: 'down' }; });
    await hold(page, 'ArrowDown', 700);
    const s = await state(page);
    assert.equal(s.area, 'home-family-interior');
    assert.equal(s.dialog?.speaker, 'おかあさん');
    await shot(page, '03-door-blocked');
    await readAll(page);
  });

  await check('the mother hands over the phone and the errands', async () => {
    await face(page, 'home.mother');
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => window.__slg.game.phone.isOwned);
    await shot(page, '04-phone');
    await readAll(page);
    assert.match((await state(page)).hud, /おつかい 0\/4/);
    assert.equal(await page.locator('#menu button', { hasText: 'スマホ' }).isDisabled().catch(() => false), false);
  });

  await check('every errand is done by talking to its person', async () => {
    for (const key of ['school.teacher', 'shopping.konbini.clerk', 'park.friend', 'station.staff']) {
      await face(page, key);
      await page.keyboard.press('KeyZ');
      await readAll(page);
    }
    assert.equal((await state(page)).phase, 'return-home');
    await shot(page, '05-errands-done');
  });

  await check('buying the bicycle shows three sites; the fake one is explained and the bicycle still arrives', async () => {
    await face(page, 'home.mother');
    await page.keyboard.press('KeyZ');
    await readAll(page);
    await page.waitForSelector('#life-choice:not([hidden])');
    assert.equal(await page.locator('.life-choice-option').count(), 3);
    await shot(page, '06-bike-sites');
    await page.keyboard.press('Digit3');
    await readAll(page);
    await page.waitForFunction(() => window.__slgStory.phase === 'stage', null, { timeout: 5000 });
    await readAll(page);
    const s = await state(page);
    assert.match(s.hud, /ちゅうがく\s*のこり \d:\d\d/);
    assert.equal(await page.locator('#touch [data-bike]').evaluate(b => b.hidden), false);
    assert.match(await page.locator('#hint').textContent(), /B：じてんしゃ|しらべる/);
    await shot(page, '07-stage');
  });

  await check('away from school, a mail calls the player to the school event', async () => {
    await readAll(page);
    assert.notEqual((await state(page)).area, 'school-classroom-interior');
    await page.keyboard.press('KeyL');
    await page.waitForSelector('#dialog-log:not([hidden])');
    assert.match(await page.locator('#dialog-log').textContent(), /メール：ちゅうがっこう/);
    await page.keyboard.press('KeyL');
    await page.waitForSelector('#dialog-log', { state: 'hidden' });
  });

  await check('the dialog log re-reads the errands and the bicycle choice, and stops the clock while open', async () => {
    await readAll(page);
    await page.locator('#btn-log').click();
    await page.waitForSelector('#dialog-log:not([hidden])');
    const text = await page.locator('#dialog-log').textContent();
    assert.match(text, /おつかいを たのめる/);
    assert.match(text, /・がっこうの せんせい/);
    assert.match(text, /▶ C：スーパー激安セール/);
    assert.match(text, /にせの つうはんサイト/);
    const t0 = await page.evaluate(() => window.__slgStory.stageElapsed);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__slgStory.stageElapsed), t0);
    await shot(page, '08-dialog-log');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#dialog-log', { state: 'hidden' });
  });

  await check('the stage clock runs while exploring and resumes after a reload', async () => {
    await readAll(page);
    const t0 = await page.evaluate(() => window.__slgStory.stageElapsed);
    await page.waitForTimeout(1500);
    const t1 = await page.evaluate(() => window.__slgStory.stageElapsed);
    assert.ok(t1 > t0, `clock should advance (${t0} -> ${t1})`);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__slgStory);
    const resumed = await page.evaluate(() => ({ phase: window.__slgStory.phase, elapsed: window.__slgStory.stageElapsed, phone: window.__slg.game.phone.isOwned }));
    assert.equal(resumed.phase, 'stage');
    assert.ok(resumed.elapsed >= t1 - 0.01);
    assert.equal(resumed.phone, true);
  });

  assert.deepEqual(errors, []);
  console.log(`\n${passed} passed`);
} finally {
  await browser.close();
}
