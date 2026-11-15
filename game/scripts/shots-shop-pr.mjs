// Capture the real integrated game for PR #55. No product code, DOM styling or saved user data is rewritten.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { afterPointer, assets, assertFits, closeShop, observe, ready, restrictNetwork, seed, shopUrl, VIEWPORTS } from './shop-review-helpers.mjs';

const output = process.env.SLG_SHOTS;
assert.ok(output && path.isAbsolute(output), 'Set SLG_SHOTS to an absolute output directory');
const approved = '434938b09cc17f20f5e834a2f99d675b7b18542e';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
const head = git('rev-parse', 'HEAD');
const exactFiles = ['game/src/ui/shop-panel.ts', 'game/src/ui/shop-panel.css', 'game/src/ui/bag-hotbar/icons.ts'];
for (const file of exactFiles) assert.equal(git('rev-parse', `${head}:${file}`), git('rev-parse', `${approved}:${file}`), `Keep the approved UI: ${file}`);
await mkdir(output, { recursive: true });
const report = { head, approved, url: shopUrl(true), exactFiles, captures: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.name !== 'desktop', acceptDownloads: false, serviceWorkers: 'block' });
    try {
      const network = await restrictNetwork(context), page = await context.newPage(), errors = observe(page);
      await page.clock.install();
      await page.goto(shopUrl(true)); await ready(page);
      await seed(page); await afterPointer(page);
      await page.evaluate(() => document.fonts.ready);
      const before = await assets(page), position = await page.evaluate(() => ({ ...window.__slg.game.player }));
      const capture = async state => {
        const file = path.join(output, `${viewport.name}-${state}.png`);
        const visibleText = await page.evaluate(() => {
          const text = selector => {
            const element = document.querySelector(selector);
            return element?.getClientRects().length ? element.textContent : '';
          };
          return { greeting: text('#shop-line'), speaker: text('.shop-speaker'), description: text('#shop-description'),
            selected: text('.shop-product.is-selected .shop-product-name'), money: text('#shop-money'),
            total: text('#shop-total'), after: text('#shop-after'), phase: document.querySelector('#shop-panel').dataset.phase };
        });
        await page.screenshot({ path: file, animations: 'disabled' });
        report.captures.push({ viewport, state, file: path.basename(file), ...visibleText });
        console.log('SHOT', JSON.stringify(report.captures.at(-1)));
      };

      // Freeze only the greeting capture so a slow screenshot cannot miss its 2-second display.
      // The real rendered frame advances before capture; no text, position, CSS or application method is replaced.
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
      try {
        await page.keyboard.press('KeyZ');
        await page.locator('#shop-panel[data-phase="catalog"]').waitFor({ state: 'visible' });
        await page.clock.runFor(50);
        assert.equal(await page.locator('#shop-line').isVisible(), true);
        assert.equal(await page.locator('#shop-description').isVisible(), false);
        assert.equal(await page.locator('#shop-icon').isVisible(), false);
        await capture('greeting');
      } finally { await page.clock.resume(); }
      await assertFits(page);

      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('.shop-product.is-selected .shop-product-name').innerText(), 'ノート');
      assert.equal(await page.locator('#shop-line').isVisible(), false);
      assert.equal(await page.locator('#shop-description').isVisible(), true);
      assert.equal(await page.locator('#shop-icon').isVisible(), true);
      await assertFits(page); await capture('selected');

      await page.keyboard.press('Enter'); await page.locator('#shop-more').click();
      assert.equal(await page.locator('#shop-quantity').innerText(), '2');
      assert.equal(await page.locator('#shop-total').innerText(), '320円');
      await assertFits(page); await capture('confirm');
      assert.deepEqual(await assets(page), before, 'Captures never pay for anything');
      await closeShop(page); await afterPointer(page);
      assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), position);
      assert.deepEqual(await assets(page), before);
      assert.deepEqual(errors, []); assert.deepEqual(network.blocked, []); assert.deepEqual(network.downloads, []);
    } finally { await context.close(); }
  }
  assert.equal(report.captures.length, 9);
  await writeFile(path.join(output, 'capture-info.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('SUMMARY 9/9 screenshots', JSON.stringify({ head, output, approved }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${report.captures.length}/9 screenshots; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
