/** Local save UI checks and captures. Uses disposable browser storage only. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, session, sizes, click, openBag, movePair } from './bag-inventory-test-helpers.mjs';

if (!process.env.SLG_URL || !process.env.SLG_SHOTS) throw new Error('Set SLG_URL and SLG_SHOTS');
const output = resolve(process.env.SLG_SHOTS);
await mkdir(output, { recursive: true });
const root = fileURLToPath(new URL('../', import.meta.url));
const { build } = createRequire(import.meta.url)('esbuild');
const compiled = await build({ stdin: { contents: `
  import { Game } from ${JSON.stringify(`${root}/src/session/game.ts`)};
  import { buildWorld } from ${JSON.stringify(`${root}/src/world/index.ts`)};
  import { applyBagReviewFixture } from ${JSON.stringify(`${root}/src/data/bag-review-fixture.ts`)};
  const game = new Game(buildWorld(), {phoneClock:()=>0, phoneEpochClock:()=>0});
  applyBagReviewFixture(game.assets);
  game.assets.moveStack({section:'bag',index:0},{section:'hotbar',index:1});
  game.assets.selectHotbar(1);
  const save = game.serialize();
  save.assets.layout.futureLayout = {v:7,mode:'preserve-me'};
  export default save;
`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { default: seed } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
if (process.argv.includes('--check-fixture')) {
  assert.equal(seed.assets.layout.bag.length, 15);
  assert.equal(seed.assets.layout.hotbar.length, 5);
  console.log('local save capture fixture OK');
  process.exit(0);
}

const browser = await launchBrowser();
const results = [];
const hitChecks = [];
async function checkMenu(h, size) {
  const p = h.page;
  const measured = await p.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const mini = document.querySelector('#minimap-button');
    const targets = [...document.querySelectorAll('#menu button'), mini].map(element => {
      const rect = box(element);
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { id: element.id, rect, hit: hit?.closest('button')?.id };
    });
    return { targets, hud: box(document.querySelector('#hud')), minimap: box(mini) };
  });
  const intersects = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  assert.equal(measured.targets.length, 7, 'six menu controls and the minimap');
  for (const target of measured.targets) {
    assert.equal(target.hit, target.id, `${size.name}: ${target.id} must receive its center tap`);
    const r = target.rect;
    assert.ok(r.x >= 0 && r.y >= 0 && r.right <= size.viewport.width + 1 && r.bottom <= size.viewport.height + 1);
    assert.equal(intersects(r, measured.hud), false, `${target.id} must avoid the location label`);
    if (target.id !== 'minimap-button') assert.equal(intersects(r, measured.minimap), false, `${target.id} must avoid the minimap`);
  }
  const initial = await p.evaluate(() => ({ ...window.__slg.game.player }));
  await p.evaluate(() => {
    const game = window.__slg.game;
    game.player = { ...game.player, facing: game.player.facing === 'up' ? 'down' : 'up' };
  });
  await click(p, '#btn-reset', size.mobile);
  assert.deepEqual(await p.evaluate(() => ({ ...window.__slg.game.player })), initial);
  await click(p, '#minimap-button', size.mobile);
  await p.locator('#full-map-overlay').waitFor({ state: 'visible' });
  await click(p, '#full-map-close', size.mobile);
  await p.locator('#full-map-overlay').waitFor({ state: 'hidden' });
  hitChecks.push({ size: size.name, viewport: size.viewport, ...measured, resetWorks: true, minimapTapWorks: true });
  console.log(`PASS menu/minimap hit targets and real reset/map taps: ${size.name}`);
}
try {
  for (const size of sizes.filter(value => value.name !== 'landscape')) {
    const dir = join(output, size.name); await mkdir(dir, { recursive: true });
    const h = await session(browser, size, { temporary: false, seed });
    const p = h.page;
    await checkMenu(h, size);
    const shot = name => p.screenshot({ path: join(dir, `${name}.png`) });
    const activate = selector => click(p, selector, size.mobile);
    const styles = () => p.evaluate(() => Object.fromEntries(
      ['local-save-overlay', 'local-save-menu', 'local-save-confirm', 'local-save-question', 'local-save-indicator']
        .map(id => { const element = document.getElementById(id); return [id,
          { hidden: element.hidden, display: getComputedStyle(element).display }]; })));
    const assertHidden = async () => {
      const values = await styles();
      for (const [id, state] of Object.entries(values)) if (state.hidden) assert.equal(state.display, 'none', id);
      return values;
    };
    const closed = await assertHidden();
    assert.equal(closed['local-save-overlay'].display, 'none');
    await shot('01-map');
    await activate('#btn-save');
    await p.locator('#local-save-panel').waitFor({ state: 'visible' });
    const menu = await assertHidden();
    assert.equal(menu['local-save-menu'].hidden, false);
    for (const selector of ['#btn-inventory', '#btn-phone', '#btn-avatar']) assert.equal(await p.locator(selector).isDisabled(), true);
    const geometry = await p.locator('#local-save-panel').boundingBox();
    assert.ok(geometry && geometry.x >= 0 && geometry.y >= 0 &&
      geometry.x + geometry.width <= size.viewport.width + 1 && geometry.y + geometry.height <= size.viewport.height + 1);
    const targets = await p.locator('#local-save-panel button:visible').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(); return { width: box.width, height: box.height };
    }));
    assert.ok(targets.every(box => box.width >= 44 && box.height >= 44));
    await shot('02-menu');
    await activate('#local-save-write');
    assert.equal(await p.locator('#local-save-status').textContent(), 'セーブしました');
    await assertHidden(); await shot('03-saved');
    await p.keyboard.press('Tab');
    assert.equal(await p.evaluate(() => document.activeElement?.id), 'local-save-continue');
    await p.keyboard.press('Enter');
    const confirm = await assertHidden();
    assert.equal(confirm['local-save-menu'].display, 'none');
    assert.equal(confirm['local-save-confirm'].hidden, false);
    assert.equal(await p.locator('#local-save-status').isVisible(), false, 'old save success must not appear inside confirmation');
    await shot('04-continue');
    await p.keyboard.press('Escape');
    await activate('#local-save-new');
    await assertHidden();
    assert.match(await p.locator('#local-save-question').textContent(), /上書き/);
    assert.equal(await p.locator('#local-save-status').isVisible(), false);
    await shot('05-new-game');
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    assert.equal((await styles())['local-save-overlay'].display, 'none');

    await openBag(p, size.mobile);
    assert.equal(await p.locator('#btn-save').isDisabled(), true);
    await movePair(p, ['bag', 1], ['hotbar', 0], size.mobile);
    const moved = await p.evaluate(() => window.__slg.game.assets.snapshot());
    assert.deepEqual(moved.layout.futureLayout, seed.assets.layout.futureLayout);
    const persisted = await p.evaluate(() => JSON.parse(window.__inventoryStorage.peek()));
    assert.deepEqual(persisted.assets.layout, moved.layout);
    assert.deepEqual(moved.items, seed.assets.items);
    assert.equal(moved.moneyYen, seed.assets.moneyYen);
    await activate('.bag-close'); await shot('06-moved-map');
    await activate('#btn-phone');
    assert.equal(await p.locator('#btn-save').isDisabled(), true);
    await activate('#phone-close');
    await activate('#btn-save'); await activate('#local-save-back');
    assert.equal((await styles())['local-save-overlay'].display, 'none');
    await h.close();
    results.push({ size: size.name, viewport: size.viewport, geometry, closed, menu, confirm,
      movedLayoutPreserved: true, errors: h.issues, captures: 6 });
    console.log(`PASS local save visibility, keyboard, modal guards and moved layout: ${size.name}`);
  }
  for (const width of [320, 360]) {
    const size = { name: `mobile-${width}`, viewport: { width, height: 844 }, mobile: true };
    const h = await session(browser, size, { temporary: false, seed });
    await checkMenu(h, size);
    await h.page.screenshot({ path: join(output, `menu-${width}.png`) });
    await h.close();
  }
  await writeFile(join(output, 'summary.json'), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(join(output, 'menu-hit-checks.json'), `${JSON.stringify(hitChecks, null, 2)}\n`);
  console.log('SUMMARY local save display 2/2 PASS; menu hit checks 4/4 PASS; captured 14 images');
} finally { await browser.close(); }
