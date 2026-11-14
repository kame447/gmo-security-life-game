/** Life choices through the real Game/UI/storage flow. Disposable browser contexts only. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5298');
const root = fileURLToPath(new URL('..', import.meta.url));
const KEY = 'slg-map-save-v1';
const compiled = await build({ stdin: { contents: `
  import { Game } from ${JSON.stringify(`${root}/src/session/game.ts`)};
  import { buildWorld } from ${JSON.stringify(`${root}/src/world/index.ts`)};
  export default new Game(buildWorld(), {phoneClock:()=>0,phoneEpochClock:()=>0}).serialize();
`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent' });
const { default: baseline } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const seed = { ...baseline, assets: { moneyYen: 2480,
  items: [{ itemId: 'notebook', quantity: 1 }, { itemId: 'pencil', quantity: 3 }],
  layout: { v: 1, bag: ['pencil', ...Array(14).fill(null)], hotbar: [null, 'notebook', null, null, null], selectedHotbar: 1 } },
  phone: { ...baseline.phone, dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 5000 },
    chat: { v: 1, contacts: [{ id: 'family', name: '家族', icon: 'person' }], threads: [
      { id: 'family-chat', contactId: 'family', messages: [{ id: 'saved', from: 'family', text: '保存済みの会話', atMs: 5, read: false }],
        pending: [], nextSequence: 1, replyCursor: 0 }] } }, future: { keep: [false, null] } };
if (process.argv.includes('--check-fixture')) {
  assert.deepEqual(seed.life, { v: 1, stats: {}, flags: {}, history: [] });
  console.log('life save fixture OK'); process.exit(0);
}
const browser = await chromium.launch({ headless: true });
let passed = 0;
const ready = page => page.waitForFunction(() => !!window.__slg?.game);
const raw = page => page.evaluate(key => window.__lifeSaveAudit.storage.getItem(key), KEY);
const saved = async page => JSON.parse(await raw(page));
const state = page => page.evaluate(() => window.__slg.game.life.state.toJSON());
const click = (page, selector, touch = false) => touch ? page.locator(selector).tap() : page.locator(selector).click();
async function session(data = seed, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
  const errors = [], external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== base.origin) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(({ key, initial }) => {
    const storage = localStorage;
    if (!sessionStorage.getItem('__life_save_seeded')) {
      storage.setItem(key, initial); sessionStorage.setItem('__life_save_seeded', '1');
    }
    const original = Storage.prototype.setItem;
    const audit = { storage, failKey: null, writes: [] }; window.__lifeSaveAudit = audit;
    Storage.prototype.setItem = function (name, value) {
      if (this === storage && name.startsWith(key)) {
        audit.writes.push(name);
        if (name === audit.failKey) throw new DOMException('test quota', 'QuotaExceededError');
      }
      return original.call(this, name, value);
    };
  }, { key: KEY, initial: JSON.stringify(data) });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base.href); await ready(page);
  return { page, context, errors, external };
}
async function finish(s) {
  assert.deepEqual(s.errors, [], 'no page/console errors'); assert.deepEqual(s.external, [], 'no external requests');
  await s.context.close();
}
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
async function standNextTo(page, areaId, interactionId) {
  assert.ok(await page.evaluate(async ({ areaId, interactionId }) => {
    const { canStand } = await import('/src/map/explorer.ts');
    const game = window.__slg.game, area = game.world.areas.get(areaId);
    const item = area.interactions.find(i => i.id === interactionId);
    for (const [dx, dy, facing] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
      const x = (item.x + dx) * 16 + 8, y = (item.y + dy) * 16 + 14;
      if (canStand(area, x, y)) { game.player = { areaId, x, y, facing }; return true; }
    }
    return false;
  }, { areaId, interactionId }));
  await page.waitForFunction(id => window.__slg.game.facingInteraction()?.id === id, interactionId);
  await page.locator('#view').focus();
}
async function finishDialog(page) {
  for (let i = 0; i < 10 && await page.evaluate(() => !!window.__slg.game.dialog); i++) {
    const before = await page.evaluate(() => JSON.stringify(window.__slg.game.dialog));
    await page.keyboard.press('Space');
    await page.waitForFunction(before => JSON.stringify(window.__slg.game.dialog) !== before, before);
  }
  assert.equal(await page.evaluate(() => window.__slg.game.dialog), null);
}
async function advanceTo(page, text) {
  await page.keyboard.press('Space');
  await page.waitForFunction(text => {
    const dialog = window.__slg.game.dialog; return dialog?.lines[dialog.index]?.includes(text);
  }, text);
}
async function chooseTablet(page, touch = false) {
  await standNextTo(page, 'home-family-interior', 'home-tablet');
  await advanceTo(page, 'がめんが きりかわった');
  await advanceTo(page, 'おめでとう');
  await advanceTo(page, 'どうする？');
  await page.locator('#life-choice').waitFor({ state: 'visible' });
  const button = page.locator('#life-choice').getByRole('button', { name: 'おかあさんに きく' });
  if (touch) await button.tap(); else await button.click();
  await finishDialog(page);
}
async function choosePark(page) {
  await standNextTo(page, 'town-main', 'park-friend');
  await advanceTo(page, 'いっしょに あそぼう');
  await advanceTo(page, 'なにして あそぶ？');
  await page.locator('#life-choice').waitFor({ state: 'visible' });
  await page.locator('#life-choice').getByRole('button', { name: 'おにごっこ' }).click();
  await finishDialog(page);
}
async function openSave(page, touch = false) {
  await click(page, '#btn-save', touch); await page.locator('#local-save-panel').waitFor({ state: 'visible' });
}
async function write(page, expected, touch = false) {
  await click(page, '#local-save-write', touch);
  await page.waitForFunction(expected => document.querySelector('#local-save-status').dataset.state === expected, expected);
  const message = await page.locator('#local-save-status').textContent();
  if (expected === 'saved') assert.equal(message, 'セーブしました'); else assert.notEqual(message, 'セーブしました');
}
async function confirmReload(page, touch = false) {
  const loaded = page.waitForEvent('domcontentloaded'); await click(page, '#local-save-confirm', touch);
  await loaded; await ready(page);
}
const pagehide = page => page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

try {
  await check('manual save and continue share Game/Director state and retain all other saved sections', async () => {
    const s = await session(); const { page } = s;
    await choosePark(page); await chooseTablet(page);
    assert.equal((await state(page)).stats.friendship, 1);
    assert.equal((await state(page)).flags['asked-adult-about-ad'], true);
    await openSave(page); await write(page, 'saved');
    const checkpoint = await saved(page);
    assert.deepEqual(checkpoint.life, await state(page));
    assert.deepEqual(checkpoint.assets, seed.assets); assert.deepEqual(checkpoint.phone.chat, seed.phone.chat);
    assert.deepEqual(checkpoint.future, seed.future);
    await page.evaluate(() => window.__slg.game.life.state.flags.set('unsaved', true));
    await click(page, '#local-save-continue'); await confirmReload(page);
    assert.deepEqual(await state(page), checkpoint.life);
    await standNextTo(page, 'home-family-interior', 'home-tablet'); await page.keyboard.press('Space');
    assert.match(await page.evaluate(() => window.__slg.game.dialog.lines[0]), /みんなで つかう/);
    await finishDialog(page);
    await standNextTo(page, 'home-family-interior', 'home-mother'); await page.keyboard.press('Space');
    assert.match(await page.evaluate(() => window.__slg.game.dialog.lines[0]), /きいてくれて/);
    await finishDialog(page); await pagehide(page);
    assert.equal((await saved(page)).life.history.filter(h => h.eventId === 'sample.tablet-ad-followup-asked').length, 1);
    await page.reload(); await ready(page);
    assert.equal((await state(page)).stats.friendship, 1);
    assert.equal((await state(page)).history.filter(h => h.eventId === 'sample.tablet-ad').length, 1);
    await finish(s);
  });

  await check('mobile choices persist through pagehide, timer and phone-triggered saves', async () => {
    const { life: _life, ...legacy } = seed;
    const s = await session(legacy, true); const { page } = s;
    assert.deepEqual(await state(page), baseline.life);
    await chooseTablet(page, true); await pagehide(page);
    assert.equal((await saved(page)).life.flags['asked-adult-about-ad'], true);
    await page.reload(); await ready(page);
    await choosePark(page);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).life.stats.friendship === 1, KEY, { timeout: 5000 });
    await page.evaluate(() => {
      window.__slg.game.life.state.flags.set('phone-checkpoint', true); window.__slg.game.phone.setOwned(false);
    });
    assert.equal((await saved(page)).life.flags['phone-checkpoint'], true);
    assert.equal((await saved(page)).phone.owned, false);
    await page.reload(); await ready(page);
    assert.equal((await state(page)).stats.friendship, 1);
    assert.equal((await state(page)).flags['phone-checkpoint'], true);
    await finish(s);
  });

  await check('damaged life keeps raw data and once protection, saves other fields, and resets only after confirmation', async () => {
    const life = { v: 1, stats: { friendship: 4.5, bad: 'broken' }, flags: { retained: false },
      history: [{ eventId: 'sample.tablet-ad', choiceId: 42, future: [false, null] }], future: { v: 7 } };
    const s = await session({ ...seed, life }); const { page } = s;
    assert.equal(await page.evaluate(() => window.__slg.game.life.status), 'recovered');
    await standNextTo(page, 'home-family-interior', 'home-tablet'); await page.keyboard.press('Space');
    assert.match(await page.evaluate(() => window.__slg.game.dialog.lines[0]), /みんなで つかう/); await finishDialog(page);
    await page.evaluate(() => { window.__slg.game.assets.changeMoney(-100); window.__slg.game.life.state.flags.set('not-saved', true); });
    await openSave(page); await write(page, 'error');
    assert.deepEqual((await saved(page)).life, life); assert.equal((await saved(page)).assets.moneyYen, 2380);
    await click(page, '#local-save-continue'); await confirmReload(page);
    assert.equal((await state(page)).flags['not-saved'], undefined);
    assert.equal((await state(page)).history[0].choiceId, null);
    await openSave(page); const old = await raw(page);
    await click(page, '#local-save-new'); await confirmReload(page);
    assert.deepEqual(await state(page), baseline.life);
    assert.equal(await page.evaluate(key => localStorage.getItem(`${key}.previous`), KEY), old);
    await finish(s);
  });

  await check('a future life installed by another tab is retained at write time and never reported as full success', async () => {
    const s = await session(); const { page } = s;
    const life = { v: 9, progression: ['unknown'], nested: { keep: [false, null] } };
    await page.evaluate(({ key, life }) => {
      const disk = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...disk, life }));
      window.__slg.game.assets.changeMoney(-100);
    }, { key: KEY, life });
    await pagehide(page);
    assert.deepEqual((await saved(page)).life, life); assert.equal((await saved(page)).assets.moneyYen, 2380);
    await openSave(page); await write(page, 'error');
    await page.reload(); await ready(page);
    assert.equal(await page.evaluate(() => window.__slg.game.life.status), 'protected');
    assert.deepEqual(await state(page), baseline.life);
    await finish(s);
  });

  await check('quota failure preserves the whole checkpoint and retries current life without a false success', async () => {
    const s = await session(); const { page } = s; await chooseTablet(page);
    await openSave(page); const before = await raw(page);
    await page.evaluate(key => { window.__lifeSaveAudit.failKey = key; }, KEY);
    await write(page, 'error'); assert.equal(await raw(page), before);
    await page.evaluate(() => { window.__lifeSaveAudit.failKey = null; });
    await write(page, 'saved'); assert.equal((await saved(page)).life.flags['asked-adult-about-ad'], true);
    await click(page, '#local-save-continue'); await confirmReload(page);
    assert.equal((await state(page)).flags['asked-adult-about-ad'], true);
    await finish(s);
  });

  await check('serialization exceptions reach manual and pagehide notices without a partial save or page error', async () => {
    const s = await session(); const { page } = s;
    await page.evaluate(() => window.__slg.game.life.state.stats.set('overflow', Infinity));
    await openSave(page); const before = await raw(page); await write(page, 'error');
    assert.equal(await raw(page), before);
    await click(page, '#local-save-back'); await pagehide(page); assert.equal(await raw(page), before);
    await page.locator('#local-save-indicator').waitFor({ state: 'visible' });
    await page.evaluate(() => window.__slg.game.life.state.stats.delete('overflow'));
    await openSave(page); await write(page, 'saved');
    await finish(s);
  });
  console.log(`SUMMARY life save E2E ${passed} PASS`);
} finally { await browser.close(); }
