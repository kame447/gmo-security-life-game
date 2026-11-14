// 人生イベント（選択肢つきの会話）の実画面での確認。開発サーバーが SLG_URL で起動している前提。
// 位置合わせだけはデバッグ用の window.__slg で行い、会話・選択は実際のキー／クリック／タップで操作する。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.SLG_URL || 'http://127.0.0.1:5173';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const errors = [];

async function openPage(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__slg?.game);
  await page.locator('#view').focus();
  return page;
}

const shot = async (page, name) => {
  if (shots) { await page.waitForTimeout(100); await page.screenshot({ path: `${shots}/${name}.png` }); }
};
const dialogText = page => page.evaluate(() => {
  const d = window.__slg.game.dialog;
  return d ? d.lines[d.index] : null;
});
const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
const choice = page => page.locator('#life-choice');

/** Stand on a free tile next to the interaction, facing it. */
async function standNextTo(page, areaId, interactionId) {
  const ok = await page.evaluate(async ({ areaId, interactionId }) => {
    const { canStand } = await import('/src/map/explorer.ts');
    const game = window.__slg.game;
    const area = game.world.areas.get(areaId);
    const item = area.interactions.find(i => i.id === interactionId);
    for (const [dx, dy, facing] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
      const x = (item.x + dx) * 16 + 8, y = (item.y + dy) * 16 + 14;
      if (canStand(area, x, y)) { game.player = { areaId, x, y, facing }; return true; }
    }
    return false;
  }, { areaId, interactionId });
  assert.ok(ok, `No free tile next to ${interactionId}`);
  await page.waitForFunction(id => window.__slg.game.facingInteraction()?.id === id, interactionId);
}

/** Press a key until the dialog closes (at most `limit` times). */
async function finishDialog(page, key = 'Space', limit = 10) {
  for (let i = 0; i < limit && await dialogText(page) !== null; i++) await page.keyboard.press(key);
  assert.equal(await dialogText(page), null, 'dialog should close');
}

async function check(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
}

try {
  const page = await openPage({ viewport: { width: 1280, height: 800 } });
  const home = 'home-family-interior';

  await check('security sample: intro → choices → result, with movement and dialog advance blocked', async () => {
    await standNextTo(page, home, 'home-tablet');
    await page.keyboard.press('Space');
    assert.match(await dialogText(page), /がめんが きりかわった/);
    assert.equal(await choice(page).isHidden(), true, 'no choices during the intro');
    await page.keyboard.press('Space');
    assert.match(await dialogText(page), /おめでとう/);
    await page.keyboard.press('Space');
    await choice(page).waitFor({ state: 'visible' });
    assert.equal(await dialogText(page), 'どうする？');
    assert.deepEqual(await choice(page).locator('button').allTextContents(), ['おかあさんに きく', 'タップしてみる', 'とじて どうがを みる']);
    assert.equal(await choice(page).locator('[aria-current="true"]').textContent(), 'おかあさんに きく');
    await shot(page, 'tablet-choices');

    // Arrow keys move the cursor (once per press) and must not walk.
    const before = await player(page);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowDown');
    assert.deepEqual(await player(page), before, 'choosing blocks movement');
    assert.equal(await choice(page).locator('[aria-current="true"]').textContent(), 'タップしてみる');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    assert.equal(await choice(page).locator('[aria-current="true"]').textContent(), 'とじて どうがを みる', 'cursor wraps');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Clicking the dialog box or the map button must not skip the choice.
    await page.locator('#dialog').click();
    assert.equal(await page.locator('#minimap-button').isDisabled(), true, 'map cannot open while choosing');
    assert.equal(await choice(page).isVisible(), true, 'choices stay open');
    assert.equal(await dialogText(page), 'どうする？');
    assert.equal(await page.locator('#btn-avatar').isDisabled(), true);

    await page.keyboard.press('Space');
    await choice(page).waitFor({ state: 'hidden' });
    assert.match(await dialogText(page), /なまえと じゅうしょ/);
    await shot(page, 'tablet-result');
    await finishDialog(page);
  });

  await check('a past choice changes what mother says later', async () => {
    await standNextTo(page, home, 'home-mother');
    await page.keyboard.press('KeyZ');
    assert.match(await dialogText(page), /タブレット/);
    await finishDialog(page, 'KeyZ');
  });

  await check('an experienced event falls back to the default lines', async () => {
    await standNextTo(page, home, 'home-tablet');
    await page.keyboard.press('Enter');
    assert.equal(await dialogText(page), 'みんなで つかう タブレットだ。つぎは なにを みようかな。');
    await finishDialog(page, 'Enter');
    assert.equal(await choice(page).isHidden(), true);
  });

  await check('daily sample: choose with the mouse', async () => {
    await standNextTo(page, 'town-main', 'park-friend');
    await page.keyboard.press('Space');
    assert.match(await dialogText(page), /いっしょに あそぼう/);
    await page.keyboard.press('Space');
    await choice(page).waitFor({ state: 'visible' });
    await choice(page).getByRole('button', { name: 'すなばで おしろづくり' }).click();
    await choice(page).waitFor({ state: 'hidden' });
    assert.match(await dialogText(page), /おしろ/);
    await finishDialog(page);
    // Back to exploring: walking works again.
    const before = await player(page);
    await page.keyboard.down('ArrowDown');
    await page.waitForFunction(y => window.__slg.game.player.y !== y, before.y, { timeout: 3000 }).catch(() => {});
    await page.keyboard.up('ArrowDown');
    const after = await player(page);
    assert.ok(after.y !== before.y || after.facing === 'down', 'player can move after the event');
  });

  const phone = await openPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await check('phone width: choices fit on screen, avoid the dialog, and work by tap', async () => {
    await standNextTo(phone, 'home-family-interior', 'home-tablet');
    for (let i = 0; i < 3; i++) await phone.keyboard.press('Space');
    await choice(phone).waitFor({ state: 'visible' });
    const box = await choice(phone).boundingBox();
    const dialog = await phone.locator('#dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0, 'inside the viewport');
    assert.ok(box.y + box.height <= dialog.y, 'above the dialog box');
    for (const b of await choice(phone).locator('button').all()) assert.ok((await b.boundingBox()).height >= 40, 'tap target');
    await shot(phone, 'phone-choices');
  });

  await check('reset while choosing cancels without recording, so the event can happen again', async () => {
    await phone.locator('#btn-reset').click();
    await choice(phone).waitFor({ state: 'hidden' });
    assert.equal(await dialogText(phone), null);
    await standNextTo(phone, 'home-family-interior', 'home-tablet');
    for (let i = 0; i < 3; i++) await phone.keyboard.press('Space');
    await choice(phone).waitFor({ state: 'visible' });
    await choice(phone).getByRole('button', { name: 'おかあさんに きく' }).tap();
    assert.match(await dialogText(phone), /だまそうとする こうこく/);
    await finishDialog(phone);
  });

  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no page errors');
} finally {
  await browser.close();
}
