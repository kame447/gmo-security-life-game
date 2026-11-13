/** Real moves, swaps, HUD and storage in isolated browser contexts. No user profile. */
import assert from 'node:assert/strict';
import { launchBrowser, session, sizes, slot, hudSlot, state, view, click, openBag, conserved, geometry, movePair, emptyInventory } from './bag-inventory-test-helpers.mjs';
const browser = await launchBrowser(); let passed = 0;
const check = async (label, action) => { await action(); passed++; console.log(`PASS ${label}`); };
try {
  const desktop = await session(browser, sizes[0]); const page = desktop.page;
  const before = await state(page); const seed = await page.evaluate(() => window.__slg.game.serialize());
  await openBag(page); const position = await page.evaluate(() => ({ ...window.__slg.game.player }));
  await check('click moves the stack out of the bag and into the same HUD slot', async () => {
    await movePair(page, ['bag', 0], ['hotbar', 0]);
    assert.equal(await slot(page, 'bag', 0).getAttribute('data-item-id'), '');
    assert.equal(await slot(page, 'hotbar', 0).getAttribute('data-item-id'), 'notebook');
    assert.equal(await hudSlot(page, 0).getAttribute('data-item-id'), 'notebook');
    assert.equal(await hudSlot(page, 0).getAttribute('data-quantity'), '2'); await conserved(page, before);
  });
  await check('real drag swaps occupied locations without duplicating a stack', async () => {
    await slot(page, 'bag', 1).dragTo(slot(page, 'hotbar', 0));
    assert.equal(await slot(page, 'bag', 1).getAttribute('data-item-id'), 'notebook');
    assert.equal(await slot(page, 'hotbar', 0).getAttribute('data-item-id'), 'pencil');
    await conserved(page, before);
  });
  await check('keyboard moves a stack, cancels a pending move and blocks map input', async () => {
    await slot(page, 'bag', 2).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('3');
    assert.equal(await slot(page, 'hotbar', 2).getAttribute('data-item-id'), 'bottled-water');
    await slot(page, 'bag', 3).focus(); await page.keyboard.press('Space'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.bag-window').isVisible(), true);
    assert.equal(await page.locator('.is-held').count(), 0);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowDown');
    assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), position);
    await conserved(page, before);
    await page.locator('.bag-close').focus(); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.bag-window').evaluate(node => node.contains(document.activeElement)), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.bag-close').evaluate(node => node === document.activeElement), true);
    for (const key of ['Enter', 'Space']) {
      await slot(page, 'bag', 3).click();
      await page.locator('.bag-cancel-move').focus(); await page.keyboard.press(key);
      assert.equal(await page.locator('.is-held').count(), 0);
      assert.equal(await page.locator('.bag-window').isVisible(), true);
      await conserved(page, before);
      await page.locator('.bag-close').focus(); await page.keyboard.press(key);
      assert.equal(await page.locator('.bag-window').isVisible(), false);
      assert.equal(await page.locator('#view').evaluate(node => node === document.activeElement), true);
      await openBag(page);
    }
    await page.locator('.bag-close').click();
  });
  await check('HUD selection is shared and modal guards prevent hidden interactions', async () => {
    await page.locator('#view').focus(); await page.keyboard.press('3');
    assert.equal((await view(page)).selectedHotbar, 2);
    assert.equal(await hudSlot(page, 2).getAttribute('aria-pressed'), 'true');
    await openBag(page); assert.ok((await slot(page, 'hotbar', 2).getAttribute('class')).includes('is-active'));
    await page.locator('.bag-close').click(); await page.locator('#btn-avatar').click();
    assert.equal(await page.locator('.bag-quick-hud').isVisible(), false);
    await page.keyboard.press('i'); assert.equal(await page.locator('.bag-window').isVisible(), false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__slg.game.dialog = { speaker: '確認', lines: ['確認中'], index: 0 }; });
    await page.waitForFunction(() => document.querySelector('#btn-inventory').disabled);
    await page.locator('#view').focus(); await page.keyboard.press('i');
    assert.equal(await page.locator('.bag-window').isVisible(), false);
    assert.equal(await page.locator('.bag-quick-hud').isVisible(), false);
    await page.evaluate(() => { window.__slg.game.dialog = null; });
    await page.waitForFunction(() => !document.querySelector('#btn-inventory').disabled);
  });
  await check('review never reads or writes the normal save', async () => {
    await page.locator('#btn-avatar').click();
    await page.locator('[data-field="hairColor"] [data-step="1"]').click();
    await page.locator('#avatar-ok').click();
    await page.locator('#btn-reset').click();
    await page.evaluate(() => {
      window.__slg.game.assets.changeMoney(7); window.__slg.game.reset();
      window.dispatchEvent(new Event('pagehide'));
    });
    await page.waitForTimeout(3200);
    const counts = await page.evaluate(() => ({ reads: window.__inventoryStorage.reads, writes: window.__inventoryStorage.writes, value: window.__inventoryStorage.peek() }));
    assert.deepEqual(counts, { reads: 0, writes: 0, value: '{"review-sentinel":true}' });
  });
  await desktop.close();
  for (const size of sizes.slice(1)) {
    const mobile = await session(browser, size); const p = mobile.page; const initial = await state(p);
    await check(`${size.name}: tap move, swap, details, HUD and empty inventory`, async () => {
      await openBag(p, true); await geometry(p, size);
      await movePair(p, ['bag', 0], ['hotbar', 4], true);
      await movePair(p, ['bag', 8], ['hotbar', 4], true);
      assert.equal(await slot(p, 'hotbar', 4).getAttribute('data-item-id'), 'key');
      assert.equal(await p.locator('.bag-detail-category').textContent(), '重要アイテム');
      await conserved(p, initial); await click(p, '.bag-close', true);
      await click(p, hudSlot(p, 4), true); assert.equal((await view(p)).selectedHotbar, 4);
      await openBag(p, true); await emptyInventory(p);
      assert.equal(await p.locator('.bag-detail h2').textContent(), 'もちものなし');
    });
    await mobile.close();
  }
  await check('normal save keeps legacy assets, layout/selection, chat, phone and appearance after reload', async () => {
    delete seed.assets.layout;
    seed.phone = { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123, capacityMb: 5000 }, chat: {
      v: 1, contacts: [{ id: 'saved-friend', name: '保存した相手', icon: 'person' }], threads: [{ id: 'saved-thread', contactId: 'saved-friend',
        messages: [{ id: 'message-1', from: 'saved-friend', text: '保存を保つ', atMs: 1000, read: false }], pending: [], nextSequence: 1, replyCursor: 0 }] } };
    const normal = await session(browser, sizes[0], { temporary: false, seed }); const p = normal.page;
    await openBag(p); await movePair(p, ['bag', 0], ['hotbar', 3]);
    let saved = await p.evaluate(() => JSON.parse(window.__inventoryStorage.peek()));
    assert.deepEqual(saved.phone, seed.phone); assert.deepEqual(saved.appearance, seed.appearance);
    assert.equal(saved.assets.layout.hotbar[3], 'notebook'); assert.equal(saved.assets.layout.selectedHotbar, 3);
    const change = await p.evaluate(() => window.__slg.game.assets.apply({ moneyDeltaYen: -120,
      itemDeltas: [{ itemId: 'bottled-water', quantityDelta: 1 }] }));
    assert.deepEqual(change, { ok: true });
    const expectedAssets = await state(p);
    assert.equal(expectedAssets.moneyYen, seed.assets.moneyYen - 120);
    await p.waitForFunction(() => window.__inventoryStorage.writes >= 2, null, { timeout: 7000 });
    await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    saved = await p.evaluate(() => JSON.parse(window.__inventoryStorage.peek()));
    await p.reload(); await p.waitForFunction(() => !!window.__slg?.game?.assets?.inventory);
    const after = await p.evaluate(() => window.__slg.game.serialize()); assert.deepEqual(after, saved);
    assert.deepEqual(after.assets, expectedAssets); assert.deepEqual(after.phone, seed.phone);
    await normal.close();
  });
  console.log(`SUMMARY ${passed}/${passed} PASS: unified inventory, input, storage and isolation`);
} finally { await browser.close(); }
