/** Independent save UI journeys. Disposable contexts only; no user profile or external requests. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { build } = require('esbuild');
const root = fileURLToPath(new URL('..', import.meta.url));
const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5296');
const out = process.env.SLG_SHOTS;
const only = process.env.SLG_SAVE_ONLY;
if (out) await mkdir(out, { recursive: true });
const KEY = 'slg-map-save-v1';
const ids = { open: '#btn-save', panel: '#local-save-panel', write: '#local-save-write',
  resume: '#local-save-continue', fresh: '#local-save-new', confirm: '#local-save-confirm',
  back: '#local-save-back', status: '#local-save-status' };

// Build the existing pure Game/world only to make a valid fixture. Never imports an AWS entry point.
const compiled = await build({ stdin: { contents: `
  import { Game } from ${JSON.stringify(`${root}/src/session/game.ts`)};
  import { buildWorld } from ${JSON.stringify(`${root}/src/world/index.ts`)};
  import { parseChatSave } from ${JSON.stringify(`${root}/src/phone/chat/codec.ts`)};
  import { CHAT_LIMITS } from ${JSON.stringify(`${root}/src/phone/chat/limits.ts`)};
  export default new Game(buildWorld(), {phoneClock:()=>0,phoneEpochClock:()=>0}).serialize();
  export const largeChat = parseChatSave({v:1,
    contacts:Array.from({length:CHAT_LIMITS.contacts},(_,i)=>({id:'person-'+i,name:'連絡先'+i,icon:'person'})),
    threads:Array.from({length:CHAT_LIMITS.threads},(_,i)=>({id:'thread-'+i,contactId:'person-'+i,nextSequence:1,replyCursor:0,pending:[],
      messages:Array.from({length:CHAT_LIMITS.messagesPerThread},(_,n)=>({id:'message-'+n,from:'person-'+i,
        text:'あ'.repeat(CHAT_LIMITS.textCodePoints),atMs:n,read:false}))}))});
`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent' });
const { default: baseline, largeChat } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const seed = { ...baseline, assets: { moneyYen: 2480,
  items: [{ itemId: 'notebook', quantity: 1 }, { itemId: 'pencil', quantity: 3 }],
  layout: { v: 1, bag: ['pencil', ...Array(14).fill(null)], hotbar: [null, 'notebook', null, null, null], selectedHotbar: 1,
    futureLayout: { v: 7, mode: 'preserve-me' } },
  futureWallet: { keep: false } },
  phone: { v: 1, owned: true, futurePhone: { keep: true },
    dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 5000, futurePolicy: { v: 7 } },
    chat: { v: 1, contacts: [{ id: 'family', name: '家族', icon: 'person' }], threads: [
      { id: 'family-chat', contactId: 'family', messages: [{ id: 'saved', from: 'family', text: '保存した会話', atMs: 5, read: false }],
        pending: [], nextSequence: 1, replyCursor: 0 }], futureChat: [false, null] } },
  life: { v: 7, history: ['preserve-old-life'] }, future: { keep: [false, null, '未知欄'] } };
const largeSave = () => ({ ...seed,
  future: { ...seed.future, capacityProbe: 'あ'.repeat(64) },
  phone: { ...seed.phone, chat: { ...largeChat, futureChat: seed.phone.chat.futureChat } } });

if (process.argv.includes('--check-fixture')) {
  assert.equal(seed.v, 1); assert.equal(seed.assets.layout.bag.length, 15);
  assert.equal(seed.assets.layout.hotbar.length, 5);
  assert.ok(new TextEncoder().encode(JSON.stringify(largeChat)).length > 250 * 1024);
  const largeBytes = new TextEncoder().encode(JSON.stringify(largeSave())).length;
  assert.ok(largeBytes > 256 * 1024 && largeBytes < 320 * 1024);
  console.log(`fixtures OK: ordinary=${new TextEncoder().encode(JSON.stringify(seed)).length} bytes, large=${largeBytes} bytes`);
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
let passed = 0;
const diagnostics = [];
const ready = page => page.waitForFunction(() => !!window.__slg?.game);
const raw = page => page.evaluate(key => window.__saveUserAudit.storage.getItem(key), KEY);
const gameState = page => page.evaluate(() => window.__slg.game.serialize());
const click = async (page, selector, touch) => touch ? page.locator(selector).tap() : page.locator(selector).click();
async function open(page, touch = false) {
  if (!(await page.locator(ids.panel).isVisible())) await click(page, ids.open, touch);
  await page.locator(ids.panel).waitFor({ state: 'visible' });
}
async function back(page, touch = false) { await click(page, ids.back, touch); }
async function confirmReload(page, touch = false) {
  const navigated = page.waitForEvent('domcontentloaded');
  await click(page, ids.confirm, touch);
  await navigated; await ready(page);
}
async function noticeFailure(page) {
  await page.waitForFunction(selector => /失敗|できません|保存でき|容量|いっぱい|使えません|利用でき|守るため|保護/.test(
    document.querySelector(selector)?.textContent || ''), ids.status);
}
function extensions(data) {
  return { life: data.life, future: data.future, wallet: data.assets?.futureWallet,
    phone: data.phone?.futurePhone, budget: data.phone?.dataBudget?.futurePolicy, chat: data.phone?.chat?.futureChat };
}
async function session({ mobile = false, text = JSON.stringify(seed), denied = false, review = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  const errors = [], external = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin) { external.push(url.origin); return route.abort(); }
    if (url.pathname === '/__save_audit_back') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Save navigation test</title>' });
    return route.continue();
  });
  await context.addInitScript(({ key, initial, denied }) => {
    const storage = window.localStorage;
    const marker = '__save_user_seeded';
    if (!sessionStorage.getItem(marker)) {
      storage.setItem(key, initial);
      storage.setItem(`${key}.protected`, 'earlier-protected-copy');
      sessionStorage.setItem(marker, '1');
    }
    const state = { storage, reads: [], writes: [], failKey: null, denyRead: false };
    window.__saveUserAudit = state;
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) {
      if (this === storage && name.startsWith(key)) {
        state.reads.push(name);
        if (state.denyRead) throw new DOMException('test read denied', 'SecurityError');
      }
      return get.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (this === storage && name.startsWith(key)) {
        state.writes.push({ key: name, value });
        if (state.failKey === name) throw new DOMException('test quota', 'QuotaExceededError');
      }
      return set.call(this, name, value);
    };
    if (denied) Object.defineProperty(window, 'localStorage', { configurable: true,
      get() { throw new DOMException('test storage unavailable', 'SecurityError'); } });
  }, { key: KEY, initial: text, denied });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  const url = new URL(base); if (review) url.searchParams.set('review', '1');
  await page.goto(url.href); await ready(page);
  return { page, context, errors, external };
}
async function check(name, run) {
  if (only && !name.includes(only)) return;
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
async function finish(s) {
  assert.deepEqual(s.errors, []); assert.deepEqual(s.external, []); await s.context.close();
}

try {
  for (const mobile of [false, true]) await check(`${mobile ? 'mobile touch' : 'desktop'} save, cancel, resume, reload, new-game protection`, async () => {
    const s = await session({ mobile }); const { page } = s;
    await open(page, mobile);
    const original = await raw(page);
    const position = await page.evaluate(() => ({ ...window.__slg.game.player }));
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up('ArrowRight');
    assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), position);
    await page.waitForTimeout(3150);
    assert.equal(await raw(page), original, 'the save panel gates the 3-second autosave');
    await back(page, mobile); await open(page, mobile);
    await page.evaluate(() => window.__slg.game.assets.changeMoney(-100));
    await click(page, ids.write, mobile);
    const committed = JSON.parse(await raw(page));
    assert.equal(committed.assets.moneyYen, 2380);
    assert.deepEqual(extensions(committed), extensions(seed));
    assert.deepEqual(committed.assets.layout, seed.assets.layout);
    assert.deepEqual(committed.phone.chat.threads, seed.phone.chat.threads);
    await open(page, mobile);
    const committedRaw = await raw(page);
    await page.evaluate(() => window.__slg.game.assets.changeMoney(-200));
    await click(page, ids.resume, mobile); await back(page, mobile);
    assert.equal((await gameState(page)).assets.moneyYen, 2180, 'cancel leaves the current unsaved game intact');
    assert.equal(await raw(page), committedRaw);
    await open(page, mobile); await click(page, ids.resume, mobile); await confirmReload(page, mobile);
    assert.equal((await gameState(page)).assets.moneyYen, 2380, 'continue uses the durable checkpoint');
    assert.deepEqual(extensions(JSON.parse(await raw(page))), extensions(seed));
    await page.reload(); await ready(page);
    assert.equal((await gameState(page)).assets.moneyYen, 2380);
    await open(page, mobile); await click(page, ids.fresh, mobile); const old = await raw(page);
    await back(page, mobile);
    assert.equal(await raw(page), old, 'cancel new game preserves existing bytes');
    await open(page, mobile); await click(page, ids.fresh, mobile);
    const beforeNew = await raw(page); await confirmReload(page, mobile);
    const previous = await page.evaluate(key => localStorage.getItem(`${key}.previous`), KEY);
    assert.equal(previous, beforeNew);
    const fresh = JSON.parse(await raw(page));
    assert.equal(fresh.assets.moneyYen, baseline.assets.moneyYen);
    assert.deepEqual(fresh.assets.items, []);
    assert.equal(Object.hasOwn(fresh, 'life'), false);
    assert.equal(Object.hasOwn(fresh, 'future'), false);
    assert.equal(Object.hasOwn(fresh.assets, 'futureWallet'), false);
    assert.equal(Object.hasOwn(fresh.phone, 'futurePhone'), false);
    assert.equal(await page.evaluate(key => localStorage.getItem(`${key}.protected`), KEY), 'earlier-protected-copy');
    await open(page, mobile);
    const panel = await page.locator(ids.panel).boundingBox();
    assert.ok(panel && panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= (mobile ? 390 : 1280) + 1 && panel.y + panel.height <= (mobile ? 844 : 800) + 1);
    if (out) await page.screenshot({ path: `${out}/local-save-${mobile ? 'mobile' : 'desktop'}.png` });
    diagnostics.push({ mobile, moneyAfterResume: committed.assets.moneyYen, protectedPrevious: true, panel });
    await finish(s);
  });

  await check('quota failure is visible, keeps the checkpoint and manual retry saves the intended progress', async () => {
    const s = await session(); const { page } = s; await open(page);
    const before = await raw(page);
    await page.evaluate(key => { window.__saveUserAudit.failKey = key; window.__slg.game.assets.changeMoney(-300); }, KEY);
    await click(page, ids.write); await noticeFailure(page);
    assert.equal(await raw(page), before);
    assert.equal((await gameState(page)).assets.moneyYen, 2180);
    if (out) await page.screenshot({ path: `${out}/local-save-quota.png` });
    await page.evaluate(() => { window.__saveUserAudit.failKey = null; });
    await click(page, ids.write);
    assert.equal(JSON.parse(await raw(page)).assets.moneyYen, 2180);
    await page.reload(); await ready(page);
    assert.equal((await gameState(page)).assets.moneyYen, 2180);
    assert.deepEqual(extensions(JSON.parse(await raw(page))), extensions(seed));
    await finish(s);
  });

  for (const failSuffix of ['.previous', '']) await check(`failed new-game ${failSuffix || 'primary'} write never commits a fresh pending snapshot later`, async () => {
    const s = await session(); const { page } = s; await open(page);
    const before = await raw(page);
    await page.evaluate(({ key, suffix }) => { window.__saveUserAudit.failKey = `${key}${suffix}`; }, { key: KEY, suffix: failSuffix });
    await click(page, ids.fresh); await click(page, ids.confirm); await noticeFailure(page);
    assert.equal(await raw(page), before);
    assert.equal((await gameState(page)).assets.moneyYen, 2480);
    await page.evaluate(() => { window.__saveUserAudit.failKey = null; });
    await back(page); await open(page); await click(page, ids.write);
    const saved = JSON.parse(await raw(page));
    assert.equal(saved.assets.moneyYen, 2480);
    assert.deepEqual(extensions(saved), extensions(seed));
    await finish(s);
  });

  await check('storage getter rejection keeps the app usable and the original save unchanged', async () => {
    const s = await session({ denied: true }); const { page } = s;
    await open(page); const before = await raw(page);
    await click(page, ids.write); await noticeFailure(page);
    await click(page, ids.fresh); await back(page);
    await page.waitForTimeout(3150);
    assert.equal(await raw(page), before);
    assert.equal(await page.evaluate(() => window.__saveUserAudit.writes.length), 0);
    await finish(s);
  });

  for (const unsupported of ['{broken', JSON.stringify({ ...seed, v: 2 })]) await check(`unsupported save ${unsupported.startsWith('{broken') ? 'syntax' : 'version'} is untouched until confirmed new game`, async () => {
    const s = await session({ text: unsupported }); const { page } = s;
    await page.waitForTimeout(3150); assert.equal(await raw(page), unsupported);
    await open(page); await click(page, ids.fresh); await back(page);
    assert.equal(await raw(page), unsupported);
    await open(page); await click(page, ids.fresh); await confirmReload(page);
    assert.equal(await page.evaluate(key => localStorage.getItem(`${key}.previous`), KEY), unsupported);
    assert.equal(JSON.parse(await raw(page)).v, 1);
    await finish(s);
  });

  await check('review mode never reads or writes the ordinary checkpoint', async () => {
    const s = await session({ review: true }); const { page } = s;
    await page.waitForTimeout(3150);
    const result = await page.evaluate(() => ({ reads: [...window.__saveUserAudit.reads], writes: [...window.__saveUserAudit.writes] }));
    assert.deepEqual(result, { reads: [], writes: [] });
    await finish(s);
  });

  await check('browser back and forward retain the latest saved state and previous copy', async () => {
    const s = await session(); const { page } = s; await open(page);
    await page.evaluate(() => window.__slg.game.assets.changeMoney(-100));
    await click(page, ids.write); await back(page);
    const checkpoint = JSON.parse(await raw(page));
    await page.goto(new URL('/__save_audit_back', base).href);
    await page.goBack(); await ready(page);
    assert.equal((await gameState(page)).assets.moneyYen, checkpoint.assets.moneyYen);
    assert.deepEqual(extensions(JSON.parse(await raw(page))), extensions(seed));
    await page.goForward(); await page.goBack(); await ready(page);
    assert.equal((await gameState(page)).assets.moneyYen, checkpoint.assets.moneyYen);
    await finish(s);
  });

  await check('supplement: autosave/pagehide never commit an appearance draft, and cancel restores the confirmed value', async () => {
    const s = await session(); const { page } = s;
    const confirmed = JSON.parse(await raw(page)).appearance;
    await page.locator('#btn-avatar').click();
    await page.locator('[data-field="hairColor"] [data-step="1"]').click();
    assert.notDeepEqual((await gameState(page)).appearance, confirmed);
    assert.equal(await page.locator(ids.open).isDisabled(), true, 'save modal cannot overlap the appearance editor');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(3150);
    assert.deepEqual(JSON.parse(await raw(page)).appearance, confirmed);
    await page.locator('#avatar-cancel').click();
    assert.deepEqual((await gameState(page)).appearance, confirmed);
    await open(page); await click(page, ids.write);
    assert.deepEqual(JSON.parse(await raw(page)).appearance, confirmed);
    await finish(s);
  });

  await check('supplement: saturated Japanese chat survives manual save, continue and reload without trimming', async () => {
    const large = largeSave();
    const bytes = new TextEncoder().encode(JSON.stringify(large)).length;
    assert.ok(bytes > 256 * 1024 && bytes < 320 * 1024, `large fixture ${bytes} bytes`);
    const s = await session({ mobile: true, text: JSON.stringify(large) }); const { page } = s;
    await open(page, true); await click(page, ids.write, true);
    assert.deepEqual(JSON.parse(await raw(page)).phone.chat, large.phone.chat);
    assert.deepEqual(extensions(JSON.parse(await raw(page))), extensions(large));
    await click(page, ids.resume, true); await confirmReload(page, true);
    assert.deepEqual(JSON.parse(await raw(page)).phone.chat, large.phone.chat);
    await page.reload(); await ready(page);
    assert.deepEqual(JSON.parse(await raw(page)).phone.chat, large.phone.chat);
    assert.deepEqual(extensions(JSON.parse(await raw(page))), extensions(large));
    diagnostics.push({ saturatedChatBytes: new TextEncoder().encode(JSON.stringify(largeChat)).length, saveBytes: bytes });
    await finish(s);
  });

  console.log(JSON.stringify(diagnostics, null, 2));
  assert.ok(passed > 0, 'at least one requested scenario must run');
  console.log(`SUMMARY local save user E2E ${passed} PASS`);
} finally { await browser.close(); }
