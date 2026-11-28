import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5494');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
const shots = process.env.SLG_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const activeKey = 'slg-map-save-v1.review.save';
const accountKey = account => `slg-cloud-review-v1:account-${account}:main`;
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
async function status(page, text) {
  await page.waitForFunction(text => document.querySelector('.local-cloud-status')?.textContent?.includes(text), text);
}
async function action(page, name) { await page.locator(`.local-cloud-review [data-cloud-action="${name}"]`).click(); }
async function balance(page, money) {
  assert.equal(await page.evaluate(money => {
    const assets = window.__slg.game.assets;
    return assets.changeMoney(money - assets.moneyYen).ok;
  }, money), true);
}
const money = page => page.evaluate(() => window.__slg.game.assets.moneyYen);
const raw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
async function login(page, account) {
  await page.locator('.local-cloud-review select').selectOption(`account-${account}`);
  await action(page, 'sign-in'); await status(page, 'ログインしました');
}
async function saveCloud(page) {
  await action(page, 'prepare-save'); await action(page, 'confirm-save'); await status(page, '保存しました');
}
async function shot(page, name) {
  if (shots) {
    await page.locator('.local-cloud-review').scrollIntoViewIfNeeded();
    await page.locator('.local-cloud-review').screenshot({ path: `${shots}/${name}.png` });
  }
}

try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['portrait', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: name === 'portrait' });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && url.origin !== base.origin) external.push(url.origin);
    });
    try {
      await page.goto(new URL('/?skipOpening=1&localReview=save', base).href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__slg?.game);
      await page.evaluate(() => localStorage.setItem('slg-map-save-v1', 'ordinary-save-sentinel'));
      await page.locator('#btn-save').click();
      await page.locator('#save-panel').waitFor({ state: 'visible' });
      await check(`${name}: the real save panel clearly identifies the account and storage as a local demonstration`, async () => {
        const text = await page.locator('.local-cloud-review').innerText();
        assert.ok(text.includes('本番の Cognito 認証は未接続'));
        assert.ok(text.includes('実際のクラウドには送信しません'));
        assert.equal(await page.locator('.local-cloud-review input[type="password"]').count(), 0);
        assert.equal(await page.locator('.local-cloud-review [data-cloud-action="prepare-save"]').count(), 0);
      });
      await check(`${name}: explicit save confirmation stores the complete A checkpoint separately`, async () => {
        await balance(page, 1000); await login(page, 'a');
        await saveCloud(page);
        const stored = JSON.parse(await raw(page, accountKey('a')));
        assert.equal(stored.save.revision, 1);
        assert.equal(stored.save.data.assets.moneyYen, 1000);
        assert.equal(await raw(page, 'slg-map-save-v1'), 'ordinary-save-sentinel');
        await shot(page, `${name}-cloud-save`);
      });
      await check(`${name}: logout and account B do not expose or replace A's save`, async () => {
        const previousA = await raw(page, accountKey('a'));
        await action(page, 'sign-out'); await login(page, 'b');
        await action(page, 'prepare-restore'); await status(page, '保存がありません');
        await balance(page, 2000); await saveCloud(page);
        assert.equal(JSON.parse(await raw(page, accountKey('b'))).save.data.assets.moneyYen, 2000);
        assert.equal(await raw(page, accountKey('a')), previousA);
        await action(page, 'sign-out'); await login(page, 'a');
        assert.equal(await money(page), 2000, 'Signing in never applies another saved game');
      });
      await check(`${name}: loading has a preview and cancellation keeps the current game`, async () => {
        await action(page, 'prepare-restore');
        assert.ok((await page.locator('.local-cloud-confirm').innerText()).includes('1,000円'));
        assert.equal(await money(page), 2000);
        await action(page, 'cancel'); assert.equal(await money(page), 2000);
      });
      await check(`${name}: a failed local replacement keeps the game and cloud candidate available`, async () => {
        await page.locator('[data-save-action="save"]').click();
        const before = await page.evaluate(key => {
          window.__originalStorageSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new DOMException('Review test quota failure', 'QuotaExceededError');
            return window.__originalStorageSetItem.call(this, name, value);
          };
          return localStorage.getItem(key);
        }, activeKey);
        await action(page, 'prepare-restore'); await action(page, 'confirm-restore');
        await status(page, '読み込みは完了していません');
        assert.equal(await money(page), 2000);
        assert.equal(await raw(page, activeKey), before);
        assert.equal(JSON.parse(await raw(page, accountKey('a'))).save.data.assets.moneyYen, 1000);
        await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
        await action(page, 'cancel');
      });
      await check(`${name}: another local device causes a real revision conflict without an automatic overwrite`, async () => {
        await balance(page, 3000); await action(page, 'conflict');
        await status(page, '上書きを止めました');
        const stored = JSON.parse(await raw(page, accountKey('a')));
        assert.equal(stored.save.revision, 2);
        assert.equal(stored.save.data.assets.moneyYen, 3000);
        assert.equal(await page.locator('[data-cloud-action="prepare-save"]').isDisabled(), true);
        assert.equal(await money(page), 3000);
        await shot(page, `${name}-cloud-conflict`);
      });
      await check(`${name}: approved cloud restore uses the host's safe local replacement and reloads signed out`, async () => {
        await balance(page, 4000); await page.locator('[data-save-action="save"]').click();
        await action(page, 'prepare-restore');
        assert.ok((await page.locator('.local-cloud-confirm').innerText()).includes('3,000円'));
        const previousDocument = await page.evaluate(() => performance.timeOrigin);
        await action(page, 'confirm-restore');
        await page.waitForFunction(origin => performance.timeOrigin !== origin && !!window.__slg?.game, previousDocument);
        assert.equal(await money(page), 3000);
        assert.equal(JSON.parse(await raw(page, activeKey)).assets.moneyYen, 3000);
        assert.equal(await raw(page, 'slg-map-save-v1'), 'ordinary-save-sentinel');
        await page.locator('#btn-save').click();
        assert.equal(await page.locator('[data-cloud-action="sign-in"]').count(), 1);
        assert.equal(await page.locator('[data-cloud-action="sign-out"]').count(), 0);
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(external, [], 'No real authentication or cloud network request');
    } finally { await context.close(); }
  }
  console.log(`local cloud review e2e: ${passed} checks passed`);
} finally { await browser.close(); }
