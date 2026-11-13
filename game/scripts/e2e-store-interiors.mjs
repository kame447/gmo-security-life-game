// Execute against feat/store-interiors-wiring. This checks the real town, never the unit fixture.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { approach, assertSessionClean, closeTalk, connections, lastPortal, openStoreSession,
  ready, snapshot, state, STORE_VIEWPORTS, talk, walkTo } from './store-interior-helpers.mjs';

const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let session, passed = 0;
const pass = (name, detail) => { passed++; console.log('PASS', name, JSON.stringify(detail)); };
const expectedLanding = destination => ({ areaId: destination.areaId, x: destination.x * 16 + 8,
  y: destination.y * 16 + 14, facing: destination.facing });

try {
  session = await openStoreSession(browser, STORE_VIEWPORTS[0]);
  const { page } = session, stores = await connections(page);
  pass('all seven stores resolve on the actual game World', stores.map(store => store.storeId));
  for (const store of stores) {
    assert.equal((await state(page)).areaId, store.outdoorId);
    await walkTo(page, store.entrance.from);
    assert.equal((await state(page)).areaId, store.interiorAreaId);
    const entered = await lastPortal(page);
    assert.equal(entered.portalId, store.entrancePortalId);
    // Portal landing and the later release of walking input are distinct observations.
    assert.deepEqual(entered.player, expectedLanding(store.entrance.to));
    const display = await page.evaluate(() => window.__slg.game.area.interactions.find(item => item.kind === 'object'));
    assert.ok(display);
    const displayApproach = await approach(page, display.eventKey);
    await page.keyboard.down(displayApproach.key);
    try { await page.waitForTimeout(250); } finally { await page.keyboard.up(displayApproach.key); }
    const collision = await page.evaluate(async () => {
      const { canStand } = await import('/src/map/explorer.ts');
      const game = window.__slg.game;
      return { safe: canStand(game.area, game.player.x, game.player.y), target: game.facingInteraction()?.eventKey };
    });
    assert.equal(collision.safe, true); assert.equal(collision.target, display.eventKey);
    await talk(page); await closeTalk(page);
    pass(`${store.catalogId}: enters, walks around shelves and collides with the display`, { entered, stopped: await state(page) });

    await approach(page, store.clerkEventKey);
    const before = await talk(page);
    await page.keyboard.down('ArrowDown');
    try { await page.waitForTimeout(200); } finally { await page.keyboard.up('ArrowDown'); }
    assert.deepEqual(await state(page), before, 'Greeting blocks movement');
    assert.equal(await page.locator('#btn-avatar').isDisabled(), true);
    assert.equal(await page.locator('#shop-panel, #clerk-panel').count(), 0, 'Purchase UI remains outside this map branch');
    await closeTalk(page);
    pass(`${store.catalogId}: clerk greeting stops and restores input`, before);

    const inside = await snapshot(page);
    await page.reload(); await ready(page);
    assert.deepEqual(await snapshot(page), inside);
    assert.equal(await page.evaluate(() => window.__slg.game.facingInteraction()?.eventKey), store.clerkEventKey);
    pass(`${store.catalogId}: resumes the exact indoor position, direction and appearance`, inside);

    const exit = await page.evaluate(outdoorId => window.__slg.game.area.def.portals.find(portal => portal.to.areaId === outdoorId), store.outdoorId);
    assert.ok(exit); await walkTo(page, exit.from);
    const returned = await lastPortal(page);
    assert.equal(returned.portalId, exit.id);
    assert.deepEqual(returned.player, expectedLanding(exit.to));
    assert.equal(exit.to.x, store.entrance.from.x); assert.equal(exit.to.y, store.entrance.from.y + 1);
    assert.equal((await state(page)).areaId, store.outdoorId);
    const outside = await snapshot(page);
    await page.reload(); await ready(page);
    assert.deepEqual(await snapshot(page), outside);
    pass(`${store.catalogId}: returns through its own door and reloads outdoors`, { returned, afterInputReleased: outside });
  }
  assertSessionClean(session);
  console.log(`SUMMARY ${passed}/29 PASS`, JSON.stringify({ errors: session.errors, blocked: session.blocked, downloads: session.downloads }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${passed}/29 PASS; FAILED`); process.exitCode = 1;
} finally { if (session) await session.context.close(); await browser.close(); }
