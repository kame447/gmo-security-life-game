import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = new URL(process.env.SLG_URL ?? 'http://127.0.0.1:5173').origin;
const browser = await chromium.launch({ headless: true });
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
let passed = 0;
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const rows = page => page.locator('#entity-list [data-entity-key]');
const keys = page => rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.entityKey));
const snapshot = page => page.evaluate(() => ({
  document: JSON.stringify(window.__worldEditor.model.document),
  dirty: window.__worldEditor.model.dirty,
  camera: { ...window.__worldEditor.camera },
  area: window.__worldEditor.activeArea,
}));
async function check(name, run) { await run(); passed++; console.log('PASS', name); }
async function search(page, kind, query = '') {
  await page.locator('#entity-filter').selectOption(kind);
  await page.locator('#entity-search').fill(query);
}
function row(page, key) { return page.locator('#entity-list [data-entity-key="' + key + '"]'); }
async function showList(page, touch = false) {
  if (await page.locator('#entity-list-toggle').getAttribute('aria-expanded') !== 'true') {
    await page.locator('#entity-list-toggle')[touch ? 'tap' : 'click']();
  }
}
async function targetVisible(page, x, y, centered = false) {
  await frames(page);
  const result = await page.evaluate(({ x, y }) => {
    const app = window.__worldEditor, point = app.toScreen(x * 16, y * 16);
    const map = document.querySelector('#workspace').getBoundingClientRect();
    const panel = document.querySelector('#properties').getBoundingClientRect();
    return { x: point.x + map.left, y: point.y + map.top, left: map.left, right: panel.left, top: map.top, bottom: map.bottom };
  }, { x, y });
  assert.ok(result.x > result.left && result.x < result.right, JSON.stringify(result));
  assert.ok(result.y > result.top && result.y < result.bottom, JSON.stringify(result));
  if (centered) {
    assert.ok(Math.abs(result.x - (result.left + result.right) / 2) <= 2, JSON.stringify(result));
    assert.ok(Math.abs(result.y - (result.top + result.bottom) / 2) <= 2, JSON.stringify(result));
  }
}
async function panelInfoVisible(page, selectors) {
  const results = await page.evaluate(selectors => {
    const panel = document.querySelector('#properties').getBoundingClientRect();
    return selectors.map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, visible: rect.width > 0 && rect.height > 0 && rect.top >= panel.top && rect.bottom <= panel.bottom && rect.left >= panel.left && rect.right <= panel.right };
    });
  }, selectors);
  for (const result of results) assert.equal(result.visible, true, result.selector + ' must be inside the panel viewport');
}

try {
  for (const [label, viewport, touch] of [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch });
    const page = await context.newPage(), errors = [], writes = [], dialogs = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const click = locator => locator[touch ? 'tap' : 'click']();
    try {
      await page.goto(origin + '/world-editor.html');
      await page.waitForFunction(() => window.__worldEditor?.renderer.stats.chunksDrawn > 0);
      await showList(page, touch);
      const initial = await snapshot(page), source = JSON.parse(initial.document);
      const home = source.areas.find(area => area.id === initial.area);
      const mother = source.interactions.find(item => item.id === 'home-mother');
      const object = source.objects.find(item => item.areaId === initial.area && item.catalogId);
      assert.ok(home && mother && object, 'home fixture must have an editable person and catalog object');

      await check(label + ': name/ID search and kind filter only change the list', async () => {
        await search(page, 'npc', '  HOME-MOTHER  ');
        assert.deepEqual(await keys(page), ['npc:home-mother']);
        await page.locator('#entity-search').fill(mother.name);
        assert.ok((await keys(page)).includes('npc:home-mother'));
        await page.locator('#entity-filter').selectOption('object');
        assert.equal(await rows(page).count(), 0);
        assert.equal(await page.locator('#entity-list-empty').isVisible(), true);
        await search(page, 'object', object.id.toUpperCase());
        assert.deepEqual(await keys(page), ['object:' + object.id]);
        const after = await snapshot(page);
        assert.deepEqual(after, initial);
      });

      await check(label + ': selecting an object keeps its picture in the uncovered map', async () => {
        await click(row(page, 'object:' + object.id));
        assert.equal(await row(page, 'object:' + object.id).getAttribute('aria-pressed'), 'true');
        assert.ok((await page.locator('#object-id').textContent()).includes(object.id));
        await targetVisible(page, object.x + object.w / 2, object.y + object.h / 2);
        assert.equal((await snapshot(page)).document, initial.document);
      });

      await check(label + ': NPC selection and search keep the draft and map separate', async () => {
        await search(page, 'npc', mother.id);
        await click(row(page, 'npc:' + mother.id));
        await targetVisible(page, mother.x + .5, mother.y + .5);
        const selected = await snapshot(page);
        await page.locator('#npc-name').fill('未反映の入力');
        await search(page, 'object', object.id);
        await click(row(page, 'object:' + object.id));
        assert.equal(await page.locator('#npc-name').inputValue(), '未反映の入力');
        assert.equal(await page.locator('#npc-properties').isVisible(), true);
        assert.equal(await page.locator('#npc-apply').isEnabled(), true);
        assert.equal(await page.locator('#save').isDisabled(), true);
        assert.deepEqual(await snapshot(page), selected);
        await click(page.locator('#npc-revert'));
        assert.equal(await page.locator('#npc-name').inputValue(), mother.name);
      });

      if (!touch) {
        await check('desktop: literal names, rename, Undo and Redo refresh filtered rows', async () => {
          const literal = '<img src=x onerror=alert(1)>';
          await page.locator('#npc-name').fill(literal);
          await click(page.locator('#npc-apply'));
          await search(page, 'npc', '<IMG');
          assert.deepEqual(await keys(page), ['npc:' + mother.id]);
          assert.equal(await row(page, 'npc:' + mother.id).locator('.entity-row-name').textContent(), literal);
          assert.equal(await page.locator('#entity-list img').count(), 0);
          await click(page.locator('#undo'));
          assert.equal(await rows(page).count(), 0);
          assert.equal((await snapshot(page)).document, initial.document);
          await click(page.locator('#redo'));
          assert.deepEqual(await keys(page), ['npc:' + mother.id]);
          await click(page.locator('#undo'));
          assert.equal((await snapshot(page)).document, initial.document);
          assert.deepEqual(dialogs, []);
        });

        await check('desktop: search keys never delete, rotate, pan or clear the selected object', async () => {
          await search(page, 'object', object.id);
          await click(row(page, 'object:' + object.id));
          const before = await snapshot(page), field = page.locator('#entity-search');
          await field.click();
          for (const key of ['End', 'ArrowLeft', 'ArrowRight', 'Space', 'r', 'Backspace', 'Delete', 'Escape']) await page.keyboard.press(key);
          assert.deepEqual(await snapshot(page), before);
          assert.ok((await page.locator('#object-id').textContent()).includes(object.id));
          await search(page, 'object', object.id);
          await row(page, 'object:' + object.id).focus();
          await page.keyboard.press('Enter');
          assert.equal(await row(page, 'object:' + object.id).getAttribute('aria-pressed'), 'true');
        });
      }

      await check(label + ': area switching retains filters and never leaks the previous area', async () => {
        await search(page, 'npc', mother.id);
        await page.locator('#area-select').selectOption('town-main');
        assert.equal(await rows(page).count(), 0);
        assert.equal(await page.locator('#entity-search').inputValue(), mother.id);
        assert.equal(await page.locator('#entity-filter').inputValue(), 'npc');
        await page.locator('#area-select').selectOption(home.id);
        assert.deepEqual(await keys(page), ['npc:' + mother.id]);
        await page.locator('#area-select').selectOption('town-main');
        await search(page, 'all');
        const kinds = await rows(page).evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.entityKind))].sort());
        assert.deepEqual(kinds, ['facility', 'interaction', 'npc', 'object', 'portal']);
        assert.equal((await snapshot(page)).document, initial.document);
      });

      await check(label + ': selecting the last town object reveals its details and centers the map', async () => {
        const tail = source.objects.filter(item => item.areaId === 'town-main').at(-1);
        assert.ok(tail, 'town must contain objects');
        await search(page, 'object');
        const target = row(page, 'object:' + tail.id);
        assert.equal(await rows(page).last().getAttribute('data-entity-key'), 'object:' + tail.id);
        await target.scrollIntoViewIfNeeded();
        assert.ok(await page.locator('#properties').evaluate(node => node.scrollTop > 0), 'tail selection must start from a scrolled list');
        await click(target);
        assert.equal(await target.getAttribute('aria-pressed'), 'true');
        assert.ok((await page.locator('#object-id').textContent()).includes(tail.id));
        await panelInfoVisible(page, ['#object-name', '#object-position']);
        await targetVisible(page, tail.x + tail.w / 2, tail.y + tail.h / 2, true);
        assert.equal((await snapshot(page)).document, initial.document);
      });

      await check(label + ': facilities, doors and interactions remain references', async () => {
        const facility = source.facilities.find(item => item.areaId === 'town-main' && source.objects.some(object => object.areaId === 'town-main' && object.facilityId === item.id));
        const linked = source.objects.find(object => object.areaId === 'town-main' && object.facilityId === facility.id);
        const portal = source.portals.find(item => item.areaId === 'town-main');
        const interaction = source.interactions.find(item => item.areaId === 'town-main' && item.kind !== 'npc');
        for (const [kind, item] of [['facility', facility], ['portal', portal], ['interaction', interaction]]) {
          await search(page, kind, item.id);
          await click(row(page, kind + ':' + item.id));
          assert.equal(await page.locator('#reference-properties').isVisible(), true);
          assert.ok((await page.locator('#reference-id').textContent()).includes(item.id));
          assert.equal(await page.locator('#selection-actions').isVisible(), false);
          assert.equal(await page.locator('#npc-properties').isVisible(), false);
          assert.equal((await snapshot(page)).document, initial.document);
        }
        await search(page, 'facility', facility.id);
        await click(row(page, 'facility:' + facility.id));
        await click(page.locator('#reference-object'));
        assert.ok((await page.locator('#object-id').textContent()).includes(linked.id));
        assert.equal(await page.locator('#reference-properties').isVisible(), false);
      });

      await check(label + ': reference selection survives panel scrolling without moving the map', async () => {
        const facility = source.facilities.find(item => item.areaId === 'town-main');
        await search(page, 'facility', facility.id);
        await click(row(page, 'facility:' + facility.id));
        await search(page, 'all');
        await page.locator('#entity-list-title').scrollIntoViewIfNeeded();
        const panel = page.locator('#properties');
        const before = await snapshot(page), scrollBefore = await panel.evaluate(node => node.scrollTop);
        const box = await panel.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height * .75;
        if (touch) {
          const client = await context.newCDPSession(page);
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let step = 1; step <= 6; step++) {
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - Math.min(120, box.height * .5) * step / 6 }] });
            await page.waitForTimeout(20);
          }
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await client.detach();
        } else {
          await page.mouse.move(x, y);
          await page.mouse.wheel(0, 350);
        }
        await page.waitForFunction(top => document.querySelector('#properties').scrollTop > top, scrollBefore);
        assert.deepEqual(await snapshot(page), before);
        assert.equal(await page.locator('#reference-properties').isVisible(), true);
        assert.ok((await page.locator('#reference-id').textContent()).includes(facility.id));
        assert.equal(await row(page, 'facility:' + facility.id).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#selection-actions').isVisible(), false);
      });

      await check(label + ': viewport and runtime remain healthy, with no save requests', async () => {
        await search(page, 'facility', 'パン');
        await page.locator('#entity-list-title').scrollIntoViewIfNeeded();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const after = await snapshot(page);
        assert.equal(after.document, initial.document);
        assert.equal(after.dirty, 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(writes, []);
        assert.deepEqual(dialogs, []);
        if (shots) await page.screenshot({ path: path.join(shots, 'entity-search-' + label + '.png') });
      });
    } catch (error) {
      if (shots) await page.screenshot({ path: path.join(shots, 'entity-search-' + label + '-failure.png') }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  console.log('SUMMARY', passed + ' passed');
} finally { await browser.close(); }
