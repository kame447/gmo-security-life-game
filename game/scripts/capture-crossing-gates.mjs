import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOutputDirectory } from './browser-output.mjs';
import { assertSafe, base, contextFor, crossingsFor, frames, putPlayer, recordFor, revision, seek, sizes, withDirection } from './crossing-gates-helpers.mjs';

const output = browserOutputDirectory('capture-crossing-gates');
const manualOnly = process.env.SLG_CAPTURE_ONLY === 'manual';
const shots = resolve(output, 'shots'), videos = resolve(output, 'video');
await mkdir(shots, { recursive: true }); await mkdir(videos, { recursive: true });
const report = { revision, url: base.href, screenshots: [], videos: [], errors: [], blocked: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const size of sizes) {
    const { context, page } = await contextFor(browser, size, report);
    let crossings;
    try {
      crossings = [...await crossingsFor(page, 'town-main'), ...await crossingsFor(page, 'town-neighbor')];
      for (const c of manualOnly ? [] : crossings) {
        await putPlayer(page, c); await page.clock.runFor(300);
        for (const phase of ['open', 'closing', 'passing-down', 'passing-up', 'opening']) {
          await seek(page, c, phase);
          const file = resolve(shots, `${size.name}-${c.id.replace(':', '-')}-${phase}.png`);
          await page.screenshot({ path: file }); report.screenshots.push(file);
          console.log('SHOT', file);
        }
      }
    } finally { await context.close(); }
    for (const c of manualOnly ? [] : crossings) {
      const name = `${size.name}-${c.id.replace(':', '-')}`;
      const { context, page } = await contextFor(browser, size, report, {
        recordVideo: { dir: resolve(videos, 'raw'), size: { width: size.width, height: size.height } },
      });
      const video = page.video();
      try {
        await putPlayer(page, c); await page.clock.runFor(300); await seek(page, c, 'before-warning');
        // Walk onto the crossing just before the warning: the video includes the safe automatic exit.
        await putPlayer(page, c, c.top + 8);
        const duration = await page.evaluate(async c => {
          const { crossingState } = await import('/src/town-train/crossings.ts');
          const { TOWN_TRAIN_PROTOTYPE } = await import('/src/town-train/config.ts');
          const area = window.__slg.game.area, now = performance.now() / 1000;
          for (let dt = 1; dt < TOWN_TRAIN_PROTOTYPE.intervalSeconds; dt += 0.04) {
            if (!crossingState(area, c, now + dt).blocked) return (dt + 0.8) * 1000;
          }
          throw new Error(`No reopening for ${c.id}`);
        }, c);
        await recordFor(page, duration);
        assertSafe(await frames(page));
      } finally { await context.close(); }
      const file = resolve(videos, `${name}.webm`); await video.saveAs(file); await video.delete();
      report.videos.push(file); console.log('VIDEO', file);
    }
    // Representative wide/narrow crossings also show manual north walking and south running through closed bars.
    for (const c of crossings.filter(c => c.id === 'town-main:78' || c.id === 'town-neighbor:12')) {
      for (const [dir, run] of [['up', false], ['down', true]]) {
        const name = `${size.name}-${c.id.replace(':', '-')}-manual-${dir}-${run ? 'run' : 'walk'}`;
        const { context, page } = await contextFor(browser, size, report, {
          recordVideo: { dir: resolve(videos, 'raw'), size: { width: size.width, height: size.height } },
        });
        const video = page.video();
        try {
          await putPlayer(page, c); await page.clock.runFor(300); await seek(page, c, 'before-warning');
          await putPlayer(page, c, dir === 'up' ? c.top + 4 : c.bottom - 4);
          await page.clock.runFor(160);
          // Stop just beyond the waiting line so even a landscape capture keeps the closed gate in view.
          const inputMs = run ? 240 : 450;
          await withDirection(page, dir, size.touch, run, () => recordFor(page, inputMs));
          const file = resolve(shots, `${name}-exit.png`); await page.screenshot({ path: file }); report.screenshots.push(file);
          await recordFor(page, 2000 - inputMs); assertSafe(await frames(page));
        } finally { await context.close(); }
        const file = resolve(videos, `${name}.webm`); await video.saveAs(file); await video.delete();
        report.videos.push(file); console.log('VIDEO', file);
      }
    }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blocked, []);
  console.log(`SUMMARY screenshots=${report.screenshots.length}, videos=${report.videos.length}`);
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; console.error(report.failure); }
finally { await browser.close(); await writeFile(resolve(output, manualOnly ? 'manual-capture-summary.json' : 'capture-summary.json'), `${JSON.stringify(report, null, 2)}\n`); }
