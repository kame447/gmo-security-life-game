import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gameplayUrl } from './lib/gameplay-url.mjs';

const base = process.env.SLG_URL || 'http://127.0.0.1:5494';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const sentinel = 'commerce-review-must-not-write-this-save';
let passed = 0;
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const pass = name => { passed++; console.log(`PASS ${name}`); };

async function visit(options, query) {
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  const requests = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(base).origin) {
      requests.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(value => localStorage.setItem('slg-map-save-v1', value), sentinel);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(gameplayUrl(`${base}/?review=1&${query}`));
  await page.waitForFunction(() => !!window.__slg?.game);
  return { context, page, requests };
}

async function readDialogs(page) {
  for (let n = 0; n < 90; n++) {
    const before = await page.evaluate(() => {
      const d = window.__slg.game.dialog;
      return d && JSON.stringify([d.speaker, d.index, d.lines]);
    });
    if (!before) {
      const settled = await page.evaluate(() => window.__slgStory.phase === 'stage' && window.__slgStory.canRide && !window.__slg.game.dialog);
      if (settled) return;
      await page.waitForFunction(() => !!window.__slg.game.dialog || window.__slgStory.phase === 'stage');
      continue;
    }
    await page.locator('#view').focus();
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(value => {
      const d = window.__slg.game.dialog;
      return !d || JSON.stringify([d.speaker, d.index, d.lines]) !== value;
    }, before);
  }
  throw new Error('dialogue did not settle');
}

try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const { name, ...options } = device;
    const { context, page, requests } = await visit(options, 'bicycleReview=1');
    const click = selector => options.hasTouch ? page.locator(selector).tap() : page.locator(selector).click();
    await page.locator('[data-chat-conversation="mother"]').waitFor();
    assert.equal(await page.locator('.phone-chat-web-link').count(), 3);
    await shot(page, `${name}-bicycle-results`);
    await click('[data-chat-href="https://machikado-bike.example/bicycle"]');
    assert.equal(await page.locator('.phone-web-order-start').isDisabled(), true);
    assert.match(await page.locator('.phone-web-order-message').innerText(), /予算を超え/);
    pass(`${name}: over-budget shop refuses the order`);
    await click('#phone-back');
    await click('[data-chat-href="https://hayate-cycle.example/bicycle"]');
    await click('.bicycle-store-nav [data-web-link="https://hayate-cycle.example/company"]');
    await page.locator('.phone-web-title', { hasText: '会社案内' }).waitFor();
    await shot(page, `${name}-bicycle-company`);
    await click('#phone-back');
    await shot(page, `${name}-bicycle-product`);
    const money = await page.evaluate(() => window.__slg.game.assets.moneyYen);
    await click('.phone-web-order-start');
    await shot(page, `${name}-bicycle-confirm`);
    await click('.phone-web-order-cancel');
    assert.equal(await page.evaluate(() => window.__slg.game.assets.moneyYen), money);
    assert.equal(await page.evaluate(() => window.__slgStory.save().bikeChoice), null);
    pass(`${name}: product details and cancelled confirmation leave assets unchanged`);
    await click('.phone-web-order-start');
    await click('.phone-web-order-confirm');
    await page.locator('.phone-web-order-complete').waitFor();
    assert.equal(await page.evaluate(() => window.__slgStory.save().bikeChoice), 'site-a');
    assert.equal(await page.evaluate(() => window.__slg.game.assets.moneyYen), money + 200);
    await shot(page, `${name}-bicycle-ordered`);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    await click('#phone-close');
    await readDialogs(page);
    assert.equal(await page.evaluate(() => window.__slgStory.canRide), true);
    pass(`${name}: confirmed order arrives and review does not write the normal save`);

    await page.locator('#btn-phone').click();
    await page.evaluate(() => window.__slg.game.phone.deliverMail({ id: 'commerce-review-link', from: 'まちの図書館',
      fromAddress: 'info@town-library.example', subject: 'おはなし会の案内', body: '案内をWebで確認できます。', atMs: 1,
      links: [{ label: '詳しい案内を見る', href: 'https://town-library.example/events' }] }));
    await click('[data-app="mail"]');
    await click('[data-mail="commerce-review-link"]');
    await click('.phone-mail-link');
    await shot(page, `${name}-mail-destination`);
    await click('.phone-mail-open-web');
    await page.locator('.phone-web-title', { hasText: 'おはなし会' }).waitFor();
    await shot(page, `${name}-mail-web`);
    await click('#phone-back');
    assert.equal(await page.locator('[data-mail-detail="commerce-review-link"]').count(), 1);
    pass(`${name}: mail opens its real game address and back returns to the same mail`);
    assert.deepEqual(requests, []);
    await context.close();
  }

  for (const catalog of ['konbini', 'greengrocer', 'bookstore', 'candy', 'bakery', 'cafe', 'pharmacy']) {
    const { context, page } = await visit({ viewport: { width: 1280, height: 800 } }, `shopReview=${catalog}`);
    await page.locator('#shop-panel').waitFor({ state: 'visible' });
    const before = await page.evaluate(() => window.__slg.game.assets.snapshot());
    await shot(page, `store-${catalog}`);
    await page.keyboard.press('Enter');
    await page.locator('#shop-confirm').click();
    const after = await page.evaluate(() => window.__slg.game.assets.snapshot());
    assert.ok(after.moneyYen < before.moneyYen, `${catalog}: money reduced once`);
    assert.ok(after.items.reduce((n, item) => n + item.quantity, 0) > before.items.reduce((n, item) => n + item.quantity, 0));
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    pass(`${catalog}: real clerk starts a purchase with saved-data isolation`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`SUMMARY local commerce E2E: ${passed} checks passed`);
} finally { await browser.close(); }
