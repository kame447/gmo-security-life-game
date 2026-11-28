import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5494';
const shots = process.env.SLG_SHOTS;
const groupFilter = process.env.SLG_REVIEW_FILTER;
const sceneFilter = process.env.SLG_REVIEW_IDS?.split(',').map(value => value.trim()).filter(Boolean);
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], results = [];
const normalKey = 'slg-map-save-v1';
async function shot(page, name, fullPage = false) { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage }); }
async function readIntroduction(page, touch) {
  for (let remaining = 20; remaining > 0; remaining--) {
    if (await page.locator('#life-choice').isVisible()) return;
    const before = await page.evaluate(() => {
      const d = window.__slg.game.dialog; return d && { index: d.index, text: d.lines[d.index] };
    });
    if (!before) { await page.locator('#life-choice').waitFor({ state: 'visible' }); return; }
    if (touch) await page.locator('#dialog').tap(); else await page.locator('#dialog').click();
    await page.waitForFunction(before => {
      const d = window.__slg.game.dialog;
      return !d || d.index !== before.index || d.lines[d.index] !== before.text || !document.querySelector('#life-choice').hidden;
    }, before);
  }
  throw new Error('Introduction did not finish after 20 explicit inputs');
}
async function assertFits(page, selector, width, height) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${selector} fits ${width}x${height}`);
}

try {
  for (const [width, height, label] of [[1280, 800, 'desktop'], [390, 844, 'portrait']]) {
    const touch = width < 500;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    await page.goto(url + '/review.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#optional-events .event-card').length === 12);
    assert.match(await page.title(), /追加機能の確認/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const scenes = await page.evaluate(async () => (await import('/src/app/local-event-review-catalog.ts')).LOCAL_EVENT_REVIEW_SCENES);
    assert.equal(scenes.filter(scene => scene.group === 'optional').length, 12);
    assert.equal(await page.locator('#security-events .event-card').count(), scenes.filter(scene => scene.group === 'security').length);
    const hrefs = await page.locator('main a[href]').evaluateAll(links => links.map(a => a.getAttribute('href')));
    assert.ok(hrefs.every(href => href.startsWith('/') || href.startsWith('#')));
    assert.ok(hrefs.every(href => !/localReview=(?:save|ending|intro)(?:&|$)|world-editor|review=1&skipOpening=1/.test(href)), 'unrelated existing features excluded');
    await page.locator('#event-search').fill('カード会社');
    assert.equal(await page.locator('#security-events .event-card:visible').count(), 1);
    await page.locator('#event-search').fill('存在しないイベント');
    assert.equal(await page.locator('#no-events').isVisible(), true);
    await page.locator('#event-search').fill('');
    await shot(page, `revision-review-hub-${label}`, true);
    await page.evaluate(key => localStorage.setItem(key, 'ordinary-save-sentinel'), normalKey);
    console.log(`PASS review hub ${label}: correct scope, 12 optional scenes, search and layout`);

    if (sceneFilter) for (const id of sceneFilter) assert.ok(scenes.some(scene => scene.id === id), `Unknown scene: ${id}`);
    const selectedScenes = scenes.filter(scene => (!groupFilter || scene.group === groupFilter) && (!sceneFilter || sceneFilter.includes(scene.id)));
    assert.ok(selectedScenes.length > 0, 'at least one selected event');
    for (const scene of selectedScenes) {
      await page.goto(`${url}/?skipOpening=1&localReview=${scene.id}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(scene => window.__slg?.game.player.areaId === scene.areaId && window.__slg.game.dialog?.index === 0 && document.querySelector('#local-event-review'), scene);
      assert.equal(await page.locator('#life-choice').isHidden(), true, 'introduction is not skipped');
      assert.equal(await page.evaluate(() => window.__slg.game.dialog.index), 0);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), normalKey), 'ordinary-save-sentinel');
      await assertFits(page, '#local-event-review', width, height);
      if (scene.id === 'event-optional-univ-project' || scene.id === 'event-univ-phishing') await shot(page, `${scene.id}-${label}-intro`);
      await readIntroduction(page, touch);
      await page.locator('#life-choice').waitFor({ state: 'visible' });
      await assertFits(page, '#life-choice', width, height);
      await assertFits(page, '#dialog', width, height);
      await shot(page, `${scene.id}-${label}-choices`);
      const first = page.locator('#life-choice [data-choice-id]').first();
      const choiceId = await first.getAttribute('data-choice-id');
      if (touch) await first.tap(); else await first.click();
      await page.waitForFunction(({ eventId, choiceId }) => window.__slgStory.choices[eventId] === choiceId, { eventId: scene.eventId, choiceId });
      assert.equal(await page.locator('#life-choice').isHidden(), true);
      assert.ok(await page.evaluate(() => !!window.__slg.game.dialog?.lines.length), 'result dialogue is shown');
      await page.waitForFunction(({ id, eventId, choiceId }) => {
        const data = JSON.parse(localStorage.getItem(`slg-map-save-v1.review.${id}`));
        return data?.story?.choices[eventId] === choiceId;
      }, { id: scene.id, eventId: scene.eventId, choiceId });
      results.push({ scene: scene.id, viewport: label, choiceId, passed: true });
      console.log(`PASS ${label} ${scene.id}: direct introduction, selection, result, separate save`);
    }

    const scene = scenes.find(scene => scene.id === 'event-optional-univ-project');
    await page.goto(`${url}/?skipOpening=1&localReview=${scene.id}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__slgStory && !!document.querySelector('#local-event-review'));
    if (!selectedScenes.some(selected => selected.id === scene.id)) {
      await readIntroduction(page, touch); await page.locator('#life-choice [data-choice-id]').first().click();
    }
    const original = await page.evaluate(id => window.__slgStory.choices[id], scene.eventId);
    assert.ok(original);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__slgStory);
    assert.equal(await page.evaluate(id => window.__slgStory.choices[id], scene.eventId), original);
    assert.equal(await page.evaluate(() => window.__slg.game.dialog), null, 'reload keeps the choice without replay');
    await page.locator('[data-review-restart]').click();
    await page.waitForFunction(id => !!window.__slgStory && !window.__slgStory.choices[id] && window.__slg.game.dialog?.index === 0, scene.eventId);
    await readIntroduction(page, touch);
    const other = page.locator('#life-choice [data-choice-id]');
    const ids = await other.evaluateAll(buttons => buttons.map(button => button.dataset.choiceId));
    const alternative = ids.find(id => id !== original);
    await page.locator(`#life-choice [data-choice-id="${alternative}"]`).click();
    await page.waitForFunction(({ id, alternative }) => window.__slgStory.choices[id] === alternative, { id: scene.eventId, alternative });
    assert.equal(await page.evaluate(key => localStorage.getItem(key), normalKey), 'ordinary-save-sentinel');
    const history = await page.evaluate(id => JSON.parse(localStorage.getItem(`slg-map-save-v1.review.${id}.recovery-v1`)).points, scene.id);
    assert.ok(history.some(point => JSON.parse(point.raw).story.choices[scene.eventId] === original), 'reset retains the reviewed choice in its own history');
    await page.locator('#local-event-review a').filter({ hasText: '次の場面へ' }).click();
    await page.waitForFunction(() => new URLSearchParams(location.search).get('localReview') === 'event-optional-univ-circle' && window.__slg?.game.dialog?.index === 0);
    assert.equal(await page.locator('#life-choice').isHidden(), true);
    console.log(`PASS ${label}: reload, one-click retry, alternative choice, prior review retained and next event`);
    await page.goto(url + '/review.html', { waitUntil: 'networkidle' });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-event-id="story.optional.univ.project"] a').click();
    const popup = await popupPromise;
    popup.on('pageerror', error => errors.push(`${label} linked scene: ${error.message}`));
    await popup.waitForFunction(() => !!window.__slgStory && !window.__slgStory.choices['story.optional.univ.project'] && window.__slg.game.dialog?.index === 0);
    assert.equal(await popup.evaluate(key => localStorage.getItem(key), normalKey), 'ordinary-save-sentinel');
    console.log(`PASS ${label}: one hub click opens a fresh introduction in the game tab`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  if (shots) await writeFile(`${shots}/review-events-results.json`, JSON.stringify({ passed: results.length, results, errors }, null, 2));
  console.log(`PASS ${results.length} direct event browser scenarios and PC/mobile review navigation`);
} finally { await browser.close(); }
