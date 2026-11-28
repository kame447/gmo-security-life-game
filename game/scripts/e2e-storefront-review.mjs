import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gameplayUrl } from './lib/gameplay-url.mjs';

const base = process.env.SLG_URL || 'http://127.0.0.1:5494';
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const sentinel = 'storefront-review-do-not-replace-normal-save';
const shops = [
  { host: 'hayate-cycle.example', theme: 'hayate', price: '19,800', company: 'はやてサイクル株式会社' },
  { host: 'machikado-bike.example', theme: 'machikado', price: '24,800', company: 'まちかどバイク' },
  { host: 'super-cycle-sale.example', theme: 'select', price: '12,800', company: 'セレクトコマース' },
];
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

try {
  for (const device of [
    { name: 'desktop', viewport: { width: 1280, height: 800 } },
    { name: 'portrait', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const { name, ...options } = device;
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    const errors = [], outside = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) { outside.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(value => localStorage.setItem('slg-map-save-v1', value), sentinel);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(gameplayUrl(`${base}/?review=1&bicycleReview=1`));
    await page.waitForFunction(() => !!window.__slg?.game);
    await page.locator('.phone-chat-web-link').first().waitFor();
    assert.equal(await page.locator('.phone-chat-web-link').count(), 3);
    const originalThread = await page.locator('[data-chat-conversation]').getAttribute('data-chat-conversation');
    const assets = await page.evaluate(() => window.__slg.game.assets.snapshot());
    const click = async selector => {
      const target = typeof selector === 'string' ? page.locator(selector) : selector;
      if (options.hasTouch) await target.tap(); else await target.click();
    };
    await shot(page, `${name}-mother-bicycle-links`);
    pass(`${name}: three candidate URLs arrive in the mother conversation`);
    for (const shop of shops) {
      const address = `https://${shop.host}/bicycle`, company = `https://${shop.host}/company`, delivery = `https://${shop.host}/delivery`;
      await click(`[data-chat-href="${address}"]`);
      await page.locator(`[data-storefront="${shop.theme}"]`).waitFor();
      assert.match(await page.locator('.bicycle-store-price').innerText(), new RegExp(shop.price));
      assert.equal(await page.locator('.bicycle-product-art').count(), 1);
      await shot(page, `${name}-${shop.theme}-product-top`);
      const originalColor = await page.locator('.bicycle-store-art-label').innerText();
      await click(page.locator('[data-bicycle-color]').nth(1));
      assert.notEqual(await page.locator('.bicycle-store-art-label').innerText(), originalColor);
      assert.equal(await page.locator('[data-bicycle-color][aria-pressed="true"]').count(), 1);
      await click('[data-bicycle-view="basket"]');
      assert.match(await page.locator('.bicycle-product-art title').textContent(), /前かご/);
      await click('[data-bicycle-view="side"]');
      const overflow = await page.locator('#phone-body').evaluate(element => element.scrollWidth > element.clientWidth + 1);
      assert.equal(overflow, false, `${name}/${shop.theme}: phone page stays within its viewport`);
      pass(`${name}/${shop.theme}: product, color and image details are usable`);
      await click(`.bicycle-store-nav [data-web-link="${delivery}"]`);
      await page.locator('.bicycle-store-info').waitFor();
      const guide = await page.locator('.bicycle-store-info').innerText();
      assert.match(guide, /お支払い/); assert.match(guide, /返品/);
      await shot(page, `${name}-${shop.theme}-delivery`);
      await click('#phone-back');
      await page.locator('.bicycle-store-product').waitFor();
      await click(`.bicycle-store-nav [data-web-link="${company}"]`);
      await page.locator('.bicycle-store-info').waitFor();
      const info = await page.locator('.bicycle-store-info').innerText();
      assert.ok(info.includes(shop.company));
      if (shop.theme === 'select') {
        assert.match(info, /個人名義/); assert.match(info, /掲載/); assert.match(guide, /返品・返金/);
        assert.doesNotMatch(info, /詐欺サイト|偽物|正解/);
      }
      await shot(page, `${name}-${shop.theme}-company`);
      await click('#phone-back');
      await page.locator('.bicycle-store-product').waitFor();
      await page.locator('.bicycle-store-specifications').scrollIntoViewIfNeeded();
      await shot(page, `${name}-${shop.theme}-product-details`);
      assert.match(await page.locator('.bicycle-store-specifications').innerText(), /26インチ/);
      if (shop.theme === 'machikado') assert.equal(await page.locator('.phone-web-order-start').isDisabled(), true);
      else {
        await click('.phone-web-order-start');
        await page.locator('.phone-web-order-confirm').waitFor();
        assert.match(await page.locator('.phone-web-order-confirmation').innerText(), new RegExp(shop.price));
        await shot(page, `${name}-${shop.theme}-confirm`);
        await click('.phone-web-order-cancel');
      }
      assert.deepEqual(await page.evaluate(() => window.__slg.game.assets.snapshot()), assets);
      assert.equal(await page.evaluate(() => window.__slgStory.save().bikeChoice), null);
      await click('#phone-back');
      await page.locator('[data-chat-conversation]').waitFor();
      assert.equal(await page.locator('[data-chat-conversation]').getAttribute('data-chat-conversation'), originalThread);
      assert.equal(await page.locator('.phone-chat-web-link').count(), 3);
      pass(`${name}/${shop.theme}: guides, seller, cancellation and return to mother keep the order unchanged`);
    }
    await click('#phone-home');
    await page.evaluate(() => window.__slg.game.phone.deliverMail({ id: 'storefront-library', from: 'まちの図書館',
      fromAddress: 'info@town-library.example', subject: '土曜日のおはなし会', body: '会場や参加方法は図書館のページをご覧ください。', atMs: 1,
      links: [{ label: 'おはなし会の案内', href: 'https://town-library.example/events' }] }));
    await click('[data-app="mail"]');
    await click('[data-mail="storefront-library"]');
    await click('.phone-mail-link');
    await click('.phone-mail-open-web');
    await page.locator('[data-town-site="library"]').waitFor();
    assert.match(await page.locator('.town-site-content').innerText(), /毎週土曜日/);
    await shot(page, `${name}-library-event-top`);
    await page.locator('.town-library-note').scrollIntoViewIfNeeded();
    await shot(page, `${name}-library-event-details`);
    await click('.town-site-nav [data-web-link="https://town-library.example/visit"]');
    await page.locator('.phone-web-title', { hasText: '開館時間' }).waitFor();
    assert.match(await page.locator('.town-site-content').innerText(), /2階/);
    await click('#phone-back');
    await page.locator('.phone-web-title', { hasText: 'おはなし会' }).waitFor();
    await click('#phone-back');
    await page.locator('[data-mail-detail="storefront-library"]').waitFor();
    pass(`${name}: rich library event and venue pages return to the originating mail`);
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    pass(`${name}: normal save preserved and no page errors or external requests`);
    await context.close();
  }
  console.log(`SUMMARY storefront review E2E: ${passed} checks passed`);
} finally { await browser.close(); }
