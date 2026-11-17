/**
 * 会話のあいだ、タッチ操作のボタンがすべて隠れ、隠れたボタンは反応せず、会話の欄のタップで進み、閉じたら戻ることを、
 * 縦・横・PC の実際のタップ・キーで確かめる（Issue #67）。他の e2e-*.mjs と同じく SLG_URL（既定 http://127.0.0.1:5173）で動き、
 * 写真と result.json は SLG_SHOTS（なければ SLG_DIALOG_OUT、どちらも無ければ一時のフォルダ）へ書く。
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const url = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
assert.equal(url.hostname, '127.0.0.1');
const output = path.resolve(process.env.SLG_SHOTS || process.env.SLG_DIALOG_OUT || path.join(os.tmpdir(), 'slg-e2e-dialog-touch'));
await mkdir(output, { recursive: true });
const SCENES = [{"id": "mother", "areaId": "home-family-interior", "kind": "dialog", "player": {"areaId": "home-family-interior", "x": 216, "y": 62, "facing": "down"}, "walk": {"dir": "left", "key": "ArrowLeft"}, "target": {"id": "home-mother", "name": "おかあさん", "eventKey": "home.mother", "lines": ["おかえり！ てを あらったら、おやつにしよう。"]}}, {"id": "grandma", "areaId": "town-main", "kind": "dialog", "player": {"areaId": "town-main", "x": 648, "y": 526, "facing": "down"}, "walk": {"dir": "right", "key": "ArrowRight"}, "target": {"id": "neighbor-grandma", "name": "きんじょのおばあさん", "eventKey": "neighborhood.grandma", "lines": ["おかえり。きょうも がっこう、たのしかった？"]}}, {"id": "teacher", "areaId": "school-classroom-interior", "kind": "dialog", "player": {"areaId": "school-classroom-interior", "x": 168, "y": 30, "facing": "down"}, "walk": {"dir": "left", "key": "ArrowLeft"}, "target": {"id": "school-teacher", "name": "せんせい", "eventKey": "school.teacher", "lines": ["おはよう。きょうも いろんなことを みつけようね。"]}}, {"id": "clerk", "areaId": "shop-konbini-interior", "kind": "shop", "player": {"areaId": "shop-konbini-interior", "x": 168, "y": 46, "facing": "down"}, "walk": {"dir": "left", "key": "ArrowLeft"}, "target": {"id": "konbini-clerk", "name": "てんいんさん", "eventKey": "shopping.konbini.clerk", "lines": ["いらっしゃいませ。おやつも のみものも あるよ。ゆっくり みてね。"]}}];
const VIEWPORTS = [{ id: 'portrait', width: 390, height: 844, touch: true },
  { id: 'landscape', width: 844, height: 390, touch: true }, { id: 'pc', width: 1280, height: 800, touch: false }];
const records = [], errors = [], blocked = [], downloads = [], loads = [];
let loadWaitBudget = 120000;
async function loadGate(stage) {
  const { loadavg } = await import('node:os');
  for (;;) {
    const value = loadavg()[0]; loads.push({ stage, value, at: new Date().toISOString() });
    if (Number.isFinite(value) && value >= 0 && value <= 8) return;
    if (loadWaitBudget <= 0) { const e = new Error('load wait budget exhausted'); e.code = 75; throw e; }
    const wait = Math.min(5000, loadWaitBudget); loadWaitBudget -= wait;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
}
const check = (row, ok, kind, message, detail) => {
  row.checks.push({ ok: !!ok, kind, message, ...(detail === undefined ? {} : { detail }) });
  if (!ok) console.log(`CHECK FAIL ${row.viewport.id}/${row.scene.id}: ${message}`);
};
const flush = extra => writeFile(path.join(output, 'result.json'), JSON.stringify({ records, errors, blocked, downloads, loads, ...extra }, null, 2) + '\n');

async function pressPoint(page, selector, touch) {
  const point = await page.evaluate(selector => {
    const el = document.querySelector(selector), r = el.getBoundingClientRect();
    const c = getComputedStyle(el); if (!r.width || !r.height || c.visibility === 'hidden' || c.display === 'none') throw new Error(`input hidden: ${selector}`);
    const x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    if (hit !== el && !el.contains(hit)) throw new Error(`input blocked: ${selector}`);
    return { x, y };
  }, selector);
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await page.clock.runFor(100);
}
async function key(page, code) {
  await page.evaluate(() => document.querySelector('#view').focus());
  await page.keyboard.down(code); await page.clock.runFor(80); await page.keyboard.up(code); await page.clock.runFor(50);
}
async function snapshot(page) {
  return page.evaluate(() => ({ player: { ...window.__slg.game.player }, dialog: window.__slg.game.dialog && { index: window.__slg.game.dialog.index, lines: [...window.__slg.game.dialog.lines] },
    shop: !!document.querySelector('#shop-panel:not([hidden])'), stage: document.querySelector('#stage').className }));
}
async function measure(page) {
  return page.evaluate(() => {
    const box = r => ({ x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const dialog = document.querySelector('#dialog'), dialogRect = box(dialog.getBoundingClientRect());
    const visible = el => {
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden' && !!el.getClientRects().length;
    };
    const buttons = [...document.querySelectorAll('#touch button')].map(el => {
      const rect = box(el.getBoundingClientRect()), show = visible(el), hit = show && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { id: el.dataset.dir || (el.dataset.act ? 'A' : 'bicycle'), rect, visible: show, centerHit: !!hit && (hit === el || el.contains(hit)), dialogArea: show ? overlap(rect, dialogRect) : 0 };
    });
    const glyphs = [], intersections = [];
    for (const [role, selector] of [['speaker', '.who'], ['body', '.text'], ['next', '.next']]) {
      const root = dialog.querySelector(selector); if (!root || !visible(root)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node, index = 0;
      while ((node = walker.nextNode())) {
        let offset = 0;
        for (const char of node.textContent) {
          const start = offset; offset += char.length; const glyphIndex = index++;
          if (!char.trim()) continue;
          const range = document.createRange(); range.setStart(node, start); range.setEnd(node, offset);
          for (const raw of range.getClientRects()) {
            if (!raw.width || !raw.height) continue;
            const rect = box(raw), entry = { role, index: glyphIndex, char, rect }; glyphs.push(entry);
            for (const button of buttons) if (button.visible) {
              const area = overlap(rect, button.rect);
              if (area > 0) {
                const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('#touch button');
                intersections.push({ ...entry, button: button.id, intersectionArea: area, glyphCenterHitsButton: !!hit &&
                  (hit.dataset.dir || (hit.dataset.act ? 'A' : 'bicycle')) === button.id });
              }
            }
          }
        }
      }
    }
    const counts = Object.fromEntries(['speaker', 'body', 'next'].map(role => [role, new Set(intersections.filter(x => x.role === role).map(x => x.index)).size]));
    const ds = getComputedStyle(dialog);
    return { date: new Date().toISOString(), dialogVisible: visible(dialog), dialog: dialogRect, text: { speaker: dialog.querySelector('.who').textContent, body: dialog.querySelector('.text').textContent },
      glyphs, intersections, counts, buttons, dialogStyle: { bottom: ds.bottom, fontSize: ds.fontSize, lineHeight: ds.lineHeight, overflowY: ds.overflowY },
      stage: document.querySelector('#stage').className, touchOn: document.querySelector('#touch').classList.contains('on'),
      glyphsWithinViewport: glyphs.every(g => g.rect.x >= 0 && g.rect.y >= 0 && g.rect.right <= innerWidth && g.rect.bottom <= innerHeight),
      glyphsWithinDialog: glyphs.every(g => g.rect.x >= dialogRect.x && g.rect.y >= dialogRect.y && g.rect.right <= dialogRect.right && g.rect.bottom <= dialogRect.bottom) };
  });
}
async function clickDialog(page, touch) {
  const point = await page.evaluate(() => {
    const el = document.querySelector('#dialog'), r = el.getBoundingClientRect();
    for (const fy of [.5, .3, .7, .15, .85]) for (const fx of [.5, .3, .7, .15, .85]) {
      const x = r.x + r.width * fx, y = r.y + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('#dialog') === el) return { x, y };
    }
    throw new Error('No exposed point of dialog box');
  });
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await page.clock.runFor(100);
}
/** 十字・A・自転車のボタンの中心が、いまそのボタンに当たるか（見えない・押せない状態を、実際の当たり判定で見る）。 */
const buttonHits = page => page.evaluate(() => [...document.querySelectorAll('#touch button')].map(el => {
  const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { id: el.dataset.dir || (el.dataset.act ? 'A' : 'bicycle'), hit: !!hit && (hit === el || el.contains(hit)) };
}));
const buttonPoint = (page, selector) => page.evaluate(selector => {
  const r = document.querySelector(`#touch ${selector}`).getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
  return { x, y, underDialog: !!document.elementFromPoint(x, y)?.closest('#dialog') };
}, selector);
const dirPoint = (page, dir) => buttonPoint(page, `[data-dir="${dir}"]`);
/** 指を十字に置いたまま会話が開き、会話のあいだに指を離しても、閉じたあとに足が勝手に動かない（押していた指の記録が残らない）。 */
async function heldFingerCase(page, context, scene, row) {
  const point = await dirPoint(page, scene.walk.dir), start = (await snapshot(page)).player;
  const cdp = await context.newCDPSession(page);
  let hiddenWhileHeld;
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, radiusX: 3, radiusY: 3, id: 1 }] });
    await page.clock.runFor(120);
    const moved = (await snapshot(page)).player;
    check(row, Math.hypot(moved.x - start.x, moved.y - start.y) > 1, 'flow', 'a finger held on the arrow walks the player before the dialog');
    await page.evaluate(() => { window.__slg.game.dialog = { speaker: 'テスト', lines: ['いち', 'に'], index: 0 }; });
    await page.clock.runFor(100);
    hiddenWhileHeld = (await measure(page)).buttons.every(b => !b.visible);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(100);
  } finally { await cdp.detach(); }
  check(row, hiddenWhileHeld, 'flow', 'touch buttons are hidden while a finger is still held on one');
  for (let i = 0; i < 4 && (await snapshot(page)).dialog; i++) await clickDialog(page, true);
  check(row, !(await snapshot(page)).dialog, 'flow', 'the dialog box tap closes the test dialog');
  const settled = (await snapshot(page)).player;
  await page.clock.runFor(400);
  const later = (await snapshot(page)).player;
  check(row, Math.hypot(later.x - settled.x, later.y - settled.y) < 0.5, 'flow', 'a finger lifted during the dialog leaves no held direction behind', { settled, later });
  await page.evaluate(scene => { window.__slg.game.player = { ...scene.player }; document.querySelector('#view').focus(); }, scene);
  await page.clock.runFor(100);
}
async function startTalk(page, scene, touch) {
  if (touch) await pressPoint(page, '#touch [data-act]', true); else await key(page, 'KeyZ');
  const s = await snapshot(page);
  assert.ok(scene.kind === 'shop' ? s.shop && !s.dialog : s.dialog && !s.shop, 'actual input must open expected conversation');
  return s;
}
async function finishTalk(page, method, touch) {
  for (let i = 0; i < 8; i++) {
    const before = await snapshot(page); if (!before.dialog) return;
    if (method === 'A') await pressPoint(page, '#touch [data-act]', touch);
    else if (method === 'box') await clickDialog(page, touch);
    else await key(page, 'KeyZ');
    const after = await snapshot(page);
    assert.ok(!after.dialog || after.dialog.index !== before.dialog.index, `${method} must advance or close dialog`);
  }
  throw new Error('dialog did not finish in 8 advances');
}

const browser = await chromium.launch({ headless: true });
let complete = false, executionError, exitCode = 0;
try {
  for (const vp of VIEWPORTS) for (const scene of SCENES) {
    await loadGate(`${vp.id}/${scene.id}/before`);
    const row = { viewport: vp, scene, checks: [] };
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.touch, hasTouch: vp.touch,
      deviceScaleFactor: 1, acceptDownloads: false, serviceWorkers: 'block' });
    try {
      await context.route('**/*', route => {
        const request = route.request(), target = new URL(request.url());
        if (['data:', 'blob:'].includes(target.protocol) || target.origin === url.origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
        blocked.push(request.url()); return route.abort('blockedbyclient');
      });
      await context.routeWebSocket('**/*', socket => { if (new URL(socket.url().replace(/^ws/, 'http')).origin === url.origin) socket.connectToServer(); else { blocked.push(socket.url()); socket.close(); } });
      await context.addInitScript(() => {
        const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
        write.call(localStorage, 'slg-map-save-v1', '__issue67_sentinel__');
        window.__dialogAuditAccess = []; window.__dialogReadSentinel = () => read.call(localStorage, 'slg-map-save-v1');
        for (const name of ['getItem', 'setItem', 'removeItem', 'clear']) { const fn = Storage.prototype[name]; Storage.prototype[name] = function (...args) {
          if (this === localStorage && (name === 'clear' || String(args[0]).startsWith('slg-'))) window.__dialogAuditAccess.push({ method: name, key: args[0] });
          return fn.apply(this, args);
        }; }
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('download', d => { downloads.push(d.suggestedFilename()); void d.cancel(); });
      await page.clock.install({ time: new Date('2026-11-16T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-11-16T00:00:01Z'));
      await page.goto(url.origin + '/?review=1', { waitUntil: 'load' });
      await page.evaluate(async scene => {
        const game = window.__slg.game, { canStand } = await import('/src/map/explorer.ts');
        if (!canStand(game.world.areas.get(scene.areaId), scene.player.x, scene.player.y)) throw new Error('fixture pose not standable');
        game.player = { ...scene.player }; document.querySelector('#view').focus();
        if (game.facingInteraction()?.id !== scene.target.id) throw new Error('fixture does not face real NPC');
      }, scene);
      await page.clock.runFor(1000);
      if (vp.touch && !await page.evaluate(() => document.querySelector('#touch').classList.contains('on'))) await pressPoint(page, '#btn-touch', true);
      row.before = await measure(page);
      if (vp.touch && scene.kind === 'dialog') await heldFingerCase(page, context, scene, row);
      const state = await startTalk(page, scene, vp.touch);
      row.measurement = await measure(page); row.photo = `${vp.id}-${scene.id}-dialog.png`;
      await page.screenshot({ path: path.join(output, row.photo), fullPage: false });
      if (scene.kind === 'dialog') {
        check(row, row.measurement.dialogVisible, 'flow', 'dialog visible');
        check(row, row.measurement.text.speaker === scene.target.name && row.measurement.text.body === scene.target.lines[0], 'flow', 'real NPC text drawn');
        check(row, row.measurement.intersections.length === 0, 'overlap', 'speaker/body/indicator glyph rectangles do not meet visible touch buttons', row.measurement.counts);
        check(row, row.measurement.glyphsWithinViewport && row.measurement.glyphsWithinDialog, 'layout', 'all glyph rectangles fit viewport and dialog');
        if (vp.touch) {
          const hits = await buttonHits(page);
          check(row, row.measurement.buttons.every(b => !b.visible) && hits.every(h => !h.hit), 'flow', 'every touch button is hidden and none can be hit while the dialog is open', hits);
          // 隠れたボタンの位置を実際にタップしても、会話も足も動かない（そこに会話の欄が重なるボタンは、欄のタップなので試さない）。
          row.hiddenTap = { tapped: [], underDialog: [] };
          for (const selector of ['[data-dir="up"]', '[data-dir="down"]', '[data-dir="left"]', '[data-dir="right"]', '[data-act]', '[data-bike]']) {
            const spot = await buttonPoint(page, selector);
            if (spot.underDialog) { row.hiddenTap.underDialog.push(selector); continue; }
            const before = await snapshot(page);
            await page.touchscreen.tap(spot.x, spot.y); await page.clock.runFor(200);
            const after = await snapshot(page);
            row.hiddenTap.tapped.push(selector);
            check(row, after.dialog?.index === before.dialog.index && JSON.stringify(after.player) === JSON.stringify(before.player), 'flow', `tapping where the hidden ${selector} button was does nothing`);
          }
          check(row, row.hiddenTap.tapped.length > 0, 'flow', 'at least one hidden button position could be tapped without hitting the dialog box', row.hiddenTap);
        } else check(row, row.measurement.buttons.every(b => !b.visible), 'flow', 'touch buttons are not shown on the PC screen');
        await page.evaluate(() => document.querySelector('#view').focus());
        await page.keyboard.down(scene.walk.key); await page.clock.runFor(160); await page.keyboard.up(scene.walk.key); await page.clock.runFor(50);
        check(row, JSON.stringify((await snapshot(page)).player) === JSON.stringify(state.player), 'flow', 'dialog stops held movement');
        // タッチでは A も十字も隠れるので、会話の欄のタップとキーで進める。
        const methods = vp.touch ? ['box', 'key'] : ['key', 'box'];
        row.advanceMethods = [];
        for (let i = 0; i < methods.length; i++) {
          if (i) await startTalk(page, scene, vp.touch);
          await finishTalk(page, methods[i], vp.touch); row.advanceMethods.push(methods[i]);
        }
        check(row, !((await snapshot(page)).dialog), 'flow', 'conversation finished using supported actual inputs');
      } else {
        check(row, state.shop && !state.dialog && row.measurement.buttons.every(b => !b.visible), 'flow', 'existing shop modal hides touch controls');
        await pressPoint(page, '#shop-exit', vp.touch);
        check(row, !(await snapshot(page)).shop, 'flow', 'shop control closes normally without purchase');
      }
      row.after = await measure(page);
      if (vp.touch) check(row, row.after.buttons.every(b => b.visible && b.centerHit), 'flow', 'all touch parts return and can be hit');
      const beforeWalk = (await snapshot(page)).player;
      if (vp.touch) {
        const point = await page.evaluate(dir => { const r = document.querySelector(`#touch [data-dir="${dir}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, scene.walk.dir);
        const cdp = await context.newCDPSession(page);
        try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 3, radiusY: 3, id: 1 }] }); await page.clock.runFor(160); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        finally { await cdp.detach(); }
      } else { await page.keyboard.down(scene.walk.key); await page.clock.runFor(160); await page.keyboard.up(scene.walk.key); }
      await page.clock.runFor(50); const afterWalk = (await snapshot(page)).player;
      row.walk = { before: beforeWalk, after: afterWalk };
      check(row, beforeWalk.areaId === afterWalk.areaId && Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.y - beforeWalk.y) > 1, 'flow', 'walking resumes after dialog');
      row.save = await page.evaluate(() => ({ access: window.__dialogAuditAccess, sentinel: window.__dialogReadSentinel() }));
      check(row, row.save.access.length === 0 && row.save.sentinel === '__issue67_sentinel__', 'safety', 'review context preserves save sentinel without save access');
    } catch (error) { row.executionError = error.stack || String(error); check(row, false, 'execution', 'case completed without harness/application exception', row.executionError); }
    finally { await context.close(); }
    records.push(row); await flush({ complete: false });
    console.log(`CASE ${vp.id}/${scene.id}: overlaps=${row.measurement?.intersections.length ?? '?'} failures=${row.checks.filter(c => !c.ok).length}`);
    await loadGate(`${vp.id}/${scene.id}/after`);
  }
  complete = records.length === 12 && records.every(r => !r.executionError);
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []); assert.deepEqual(downloads, []);
  const failures = records.flatMap(r => r.checks.filter(c => !c.ok));
  if (!complete || failures.length) exitCode = 1;
} catch (error) { executionError = error.stack || String(error); exitCode = error.code === 75 ? 75 : 1; }
finally {
  await browser.close();
  await flush({ complete, executionError, exitCode });
}
const overlapCases = records.filter(r => r.scene.kind === 'dialog' && r.measurement?.intersections.length > 0).length;
console.log(`SUMMARY ${records.length}/12 CASES; glyph-overlap-cases=${overlapCases}; exit=${exitCode}`);
process.exitCode = exitCode;
