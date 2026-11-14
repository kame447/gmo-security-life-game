import { mkdir, rename } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { launchBrowser, session, sizes, slot, hudSlot, openBag, movePair, click } from './bag-inventory-test-helpers.mjs';
if (!process.env.SLG_VIDEOS) throw new Error('Set SLG_VIDEOS');
const output = resolve(process.env.SLG_VIDEOS); await mkdir(output, { recursive: true });
process.env.TMPDIR = output; process.env.TMP = output; process.env.TEMP = output;
const browser = await launchBrowser();
try {
  for (const size of sizes) {
    const h = await session(browser, size, { videoDir: output }); const p = h.page; const video = p.video();
    const pause = () => p.waitForTimeout(650);
    await pause(); await openBag(p, size.mobile); await pause();
    await click(p, slot(p, 'bag', 0), size.mobile); await pause();
    await click(p, slot(p, 'hotbar', 0), size.mobile); await pause();
    if (size.mobile) await movePair(p, ['bag', 1], ['hotbar', 0], true);
    else await slot(p, 'bag', 1).dragTo(slot(p, 'hotbar', 0));
    await pause(); await slot(p, 'bag', 2).focus(); await p.keyboard.press('Enter'); await pause();
    await p.keyboard.press('3'); await pause(); await p.keyboard.press('Enter'); await pause();
    await click(p, '.bag-close', size.mobile); await pause(); await click(p, hudSlot(p, 2), size.mobile); await pause();
    await openBag(p, size.mobile); await pause(); await click(p, '.bag-close', size.mobile); await pause();
    await h.close(); const raw = await video.path(); const final = join(output, `inventory-${size.name}-${basename(raw)}`);
    await rename(raw, final); console.log(`Recorded ${final}`);
  }
} finally { await browser.close(); }
