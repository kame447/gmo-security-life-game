import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { approach, assertSessionClean, closeTalk, connections, openStoreSession,
  state, STORE_VIEWPORTS, talk, walkTo } from './store-interior-helpers.mjs';

const output = process.env.SLG_SHOTS;
assert.ok(output && path.isAbsolute(output), 'Set SLG_SHOTS to an absolute output directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let completed = 0;
try {
  for (const viewport of STORE_VIEWPORTS) {
    const session = await openStoreSession(browser, viewport), { page } = session;
    try {
      const stores = await connections(page);
      for (const store of stores) {
        await walkTo(page, store.entrance.from);
        assert.equal((await state(page)).areaId, store.interiorAreaId);
        const roomFile = path.join(output, `${viewport.name}-${store.catalogId}-room.png`);
        await page.screenshot({ path: roomFile }); completed++;
        await approach(page, store.clerkEventKey);
        await talk(page, viewport.touch);
        const greetingFile = path.join(output, `${viewport.name}-${store.catalogId}-greeting.png`);
        await page.screenshot({ path: greetingFile }); completed++;
        await closeTalk(page, viewport.touch);
        const exit = await page.evaluate(outdoorId => window.__slg.game.area.def.portals.find(portal => portal.to.areaId === outdoorId), store.outdoorId);
        await walkTo(page, exit.from);
        assert.equal((await state(page)).areaId, store.outdoorId);
        console.log('PASS', JSON.stringify({ viewport: viewport.name, store: store.storeId, roomFile, greetingFile }));
      }
      assertSessionClean(session);
    } finally { await session.context.close(); }
  }
  console.log(`SUMMARY ${completed}/42 screenshots`, JSON.stringify({ output }));
} catch (error) {
  console.error('FAIL', error); console.error(`SUMMARY ${completed}/42 screenshots; FAILED`); process.exitCode = 1;
} finally { await browser.close(); }
