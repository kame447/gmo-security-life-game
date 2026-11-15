import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchBrowser, session, sizes, slot, openBag, movePair, click, emptyInventory } from './bag-inventory-test-helpers.mjs';
if (!process.env.SLG_SHOTS) throw new Error('Set SLG_SHOTS');
const output = resolve(process.env.SLG_SHOTS); await mkdir(output, { recursive: true });
process.env.TMPDIR = output; process.env.TMP = output; process.env.TEMP = output;
const browser = await launchBrowser();
try {
  for (const size of sizes) {
    const dir = join(output, size.name); await mkdir(dir, { recursive: true });
    const h = await session(browser, size); const p = h.page;
    const shot = file => p.screenshot({ path: join(dir, file) });
    await shot('01-map.png'); await openBag(p, size.mobile); await shot('02-inventory.png');
    await click(p, slot(p, 'bag', 0), size.mobile); await shot('03-selected.png');
    await click(p, slot(p, 'hotbar', 0), size.mobile); await shot('04-moved.png');
    await movePair(p, ['bag', 1], ['hotbar', 0], size.mobile); await shot('05-swapped.png');
    await click(p, slot(p, 'bag', 8), size.mobile); await shot('06-important.png');
    await click(p, '.bag-cancel-move', size.mobile); await click(p, '.bag-close', size.mobile); await shot('07-hud.png');
    await openBag(p, size.mobile); await emptyInventory(p); await shot('08-empty.png');
    await h.close(); console.log(`Captured 8 states: ${dir}`);
  }
} finally { await browser.close(); }
