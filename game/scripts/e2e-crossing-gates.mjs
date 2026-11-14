import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { auditSchedule, assertSafe, base, clearProbe, contextFor, crossingsFor, frames, hold,
  installProbe, isInside, player, putPlayer, revision, seek, sizes, snapshot } from './crossing-gates-helpers.mjs';

const schedule = await auditSchedule();
console.log(JSON.stringify(schedule, null, 2));
if (process.argv.includes('--schedule')) process.exit(0);
const output = resolve(process.env.SLG_OUTPUT || '/private/tmp/slg-audit/SolarNoether/crossing-gates');
await mkdir(output, { recursive: true });
const report = { revision, url: base.href, schedule, passed: [], errors: [], blocked: [], samples: 0, postExitCornerCorrections: [] };
const browser = await chromium.launch({ headless: true });
const pass = label => { report.passed.push(label); console.log('PASS', label); };
try {
  for (const size of sizes) {
    const { context, page } = await contextFor(browser, size, report);
    try {
      for (const areaId of ['town-main', 'town-neighbor']) for (const c of await crossingsFor(page, areaId)) {
        const label = `${size.name} ${c.id}`;
        await putPlayer(page, c); await page.clock.runFor(300);
        const solid = await page.evaluate(() => Array.from(window.__slg.game.area.solid));
        assert.ok(c.top - c.northGateY >= 0 && c.top - c.northGateY <= 4, 'North hardware is beside rail');
        assert.ok(c.southGateY - c.bottom >= 0 && c.southGateY - c.bottom <= 12, 'South hardware is beside rail');
        const buffer = await page.evaluate(async () => (await import('/src/world/rail-protection.ts')).RAIL_BUFFER_TILES);
        const guardX = c.left - 8;
        for (const [y, dir] of [[c.top - buffer * 16, 'down'], [c.bottom + buffer * 16 + 8, 'up']]) {
          await putPlayer(page, c, y, guardX); await clearProbe(page);
          await hold(page, dir, 300, size.touch);
          assert.equal((await player(page)).y, y, 'The continuous fence rejects approach from outside');
          assertSafe(await frames(page));
        }
        await putPlayer(page, c); await seek(page, c, 'open', 2);
        for (const y of [(c.northWaitY + c.top) / 2, (c.bottom + c.southWaitY) / 2]) {
          await putPlayer(page, c, y); await clearProbe(page); await hold(page, 'left', 650, size.touch);
          const p = await player(page); assert.ok(p.x >= c.left + 5, 'The crossing flank does not leak into the protected verge');
          assert.ok(p.x < c.left + 6.1, 'The person actually reaches the side fence');
          assert.equal(p.y, y); assertSafe(await frames(page));
        }
        pass(`${label}: close rail hardware and continuous collision-backed fencing`);
        await putPlayer(page, c);
        for (const dir of ['down', 'up']) {
          await seek(page, c, 'open', 2);
          await putPlayer(page, c, dir === 'down' ? c.northWaitY : c.southWaitY); await clearProbe(page);
          await hold(page, dir, 1350, size.touch);
          const p = await player(page);
          assert.ok(dir === 'down' ? p.y >= c.southWaitY : p.y <= c.northWaitY, `${label} crosses ${dir} when open`);
          assertSafe(await frames(page));
        }
        pass(`${label}: open passage in both directions using ${size.touch ? 'touch' : 'keys'}`);
        for (const trainDir of ['down', 'up']) {
          await putPlayer(page, c); await seek(page, c, `passing-${trainDir}`);
          for (const dir of ['down', 'up']) {
            const y = dir === 'down' ? c.northWaitY : c.southWaitY;
            await putPlayer(page, c, y); await clearProbe(page);
            await hold(page, dir, 220, size.touch);
            assert.equal((await player(page)).y, y, `${label}: closed ${trainDir} train blocks ${dir}`);
            assertSafe(await frames(page));
          }
        }
        pass(`${label}: both lines block both entrances`);
        await putPlayer(page, c); await seek(page, c, 'opening');
        await hold(page, 'down', 40, size.touch);
        assert.equal((await player(page)).y, c.northWaitY, 'Opening bars still block entry');
        await seek(page, c, 'open', 2); await clearProbe(page);
        await hold(page, 'down', 1350, size.touch);
        assert.ok((await player(page)).y >= c.southWaitY); assertSafe(await frames(page));
        pass(`${label}: passage returns after the tail and full raising`);

        for (const run of [false, true]) for (const dir of ['up', 'down']) {
          await putPlayer(page, c); await seek(page, c, 'before-warning');
          await putPlayer(page, c, dir === 'up' ? c.top + 4 : c.bottom - 4);
          await page.clock.runFor(160); // Closure has begun; hand control from automatic to manual escape.
          await clearProbe(page); await hold(page, dir, 650, size.touch, run);
          const log = await frames(page); report.samples += log.length; assertSafe(log);
          assert.ok(!isInside(c, await player(page)), 'A person can leave through the closed bar');
          const speeds = log.slice(1).flatMap((b, i) => {
            const a = log[i];
            return isInside(c, a.player) && isInside(c, b.player) ?
              [Math.abs(b.player.y - a.player.y) / (b.t - a.t)] : [];
          });
          assert.ok(speeds.some(v => Math.abs(v - (run ? 128 : 72)) < 0.1), `The ${dir} input controls ${run ? 'run' : 'walk'} speed`);
          assert.ok(log.some(f => f.moving && f.player.facing === dir), 'The person faces the selected exit');
          const waitY = dir === 'up' ? c.northWaitY : c.southWaitY;
          await putPlayer(page, c, waitY); await clearProbe(page);
          await hold(page, dir === 'up' ? 'down' : 'up', 220, size.touch, run);
          assert.equal((await player(page)).y, waitY, 'After exiting, a new entry remains blocked');
          assertSafe(await frames(page));
          pass(`${label}: manual ${dir} ${run ? 'run' : 'walk'} exits a closed crossing; re-entry rejected`);
        }

        await putPlayer(page, c); await seek(page, c, 'before-warning');
        await putPlayer(page, c, c.top + 8); await clearProbe(page);
        await hold(page, 'left', 1100, size.touch); // A lateral input cannot enter the protected verge; retreat stays automatic.
        const log = await frames(page); report.samples += log.length; assertSafe(log);
        assert.ok(!isInside(c, await player(page)), 'Retreat reaches a waiting point');
        assert.ok(log.some(f => f.player.facing === 'up' && f.moving), 'Retreat walks and faces the exit');
        for (let i = 1; i < log.length; i++) {
          const a = log[i - 1], b = log[i], distance = Math.hypot(b.player.x - a.player.x, b.player.y - a.player.y);
          if (isInside(c, a.player) || isInside(c, b.player)) {
            assert.ok(distance <= (b.t - a.t) * 72 + 0.8, `Continuous walking retreat: ${JSON.stringify({ distance, a, b })}`);
          } else if (distance > (b.t - a.t) * 72 + 0.8) {
            // Control has returned; the existing ordinary movement can correct a wall corner by up to 5px.
            report.postExitCornerCorrections.push({ crossing: c.id, distance, from: a.player, to: b.player });
          }
        }
        const before = await player(page); await hold(page, 'right', 80, size.touch);
        assert.ok((await player(page)).x > before.x, 'Control returns immediately after retreat');
        pass(`${label}: closing with an occupant walks them out despite reverse input`);

        await putPlayer(page, c); await seek(page, c, 'before-warning'); await putPlayer(page, c, c.top + 8);
        await clearProbe(page);
        await page.locator('#minimap-button').evaluate(button => button.click());
        assert.ok(await page.locator('#stage').evaluate(el => el.classList.contains('map-open')), 'Full map can open on a crossing');
        await page.clock.runFor(1100);
        assertSafe(await frames(page)); assert.ok(!isInside(c, await player(page)), 'Retreat continues while ordinary updates pause');
        await page.locator('#full-map-close').evaluate(button => button.click());
        pass(`${label}: full-map pause cannot strand a crossing occupant`);

        await putPlayer(page, c); await page.clock.runFor(32);
        const saved = await snapshot(page);
        await page.evaluate(save => localStorage.setItem('slg-map-save-v1', JSON.stringify(save)), saved);
        await page.reload({ waitUntil: 'load' }); await installProbe(page); await page.clock.runFor(64);
        assert.deepEqual(await snapshot(page), saved, 'Waiting-point save reloads exactly');
        assert.deepEqual(await page.evaluate(() => Array.from(window.__slg.game.area.solid)), solid);
        pass(`${label}: waiting-point reload and immutable ground collision`);
      }

      // This crossing is also closed near the new document's t=0, covering either clock-origin behavior on reload.
      const c = (await crossingsFor(page, 'town-neighbor'))[0];
      await putPlayer(page, c); await seek(page, c, 'passing-down');
      await putPlayer(page, c, (c.top + c.bottom) / 2);
      const saved = await snapshot(page);
      await page.evaluate(save => localStorage.setItem('slg-map-save-v1', JSON.stringify(save)), saved);
      await page.reload({ waitUntil: 'load' }); await installProbe(page); await page.clock.runFor(1600);
      const log = await frames(page); assertSafe(log);
      assert.ok(log[0].crossings.find(s => s.id === c.id)?.blocked, 'The first restored frame is a closed crossing');
      assert.ok(!isInside(c, await player(page))); assert.equal((await player(page)).areaId, 'town-neighbor');
      assert.deepEqual((await snapshot(page)).appearance, saved.appearance);
      pass(`${size.name}: a save inside a closed crossing recovers without a train-overlap frame`);
    } finally { await context.close(); }
  }
  for (const size of [sizes[0], sizes[1]]) {
    const { context, page } = await contextFor(browser, size, report, { reducedMotion: 'reduce' });
    try {
      const c = (await crossingsFor(page, 'town-main'))[0];
      await putPlayer(page, c); await seek(page, c, 'before-warning'); await putPlayer(page, c, c.top + 8); await clearProbe(page);
      await page.clock.runFor(1400); assertSafe(await frames(page)); assert.ok(!isInside(c, await player(page)));
      const visual = await page.evaluate(async c => {
        const { crossingVisual } = await import('/src/town-train/crossing-render.ts');
        const { crossingState } = await import('/src/town-train/crossings.ts');
        const state = crossingState(window.__slg.game.area, c, performance.now() / 1000);
        return [crossingVisual(state, 0.1, true), crossingVisual(state, 0.6, true)];
      }, c);
      assert.deepEqual(visual[0], visual[1]); assert.equal(visual[0].armDown, 1);
      pass(`${size.name}: reduced motion retains safe retreat with steady lamps and bars`);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blocked, []);
  console.log(`SUMMARY ${report.passed.length} PASS, safety samples=${report.samples}`);
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1; console.error(report.failure); }
finally { await browser.close(); await writeFile(resolve(output, 'e2e-summary.json'), `${JSON.stringify(report, null, 2)}\n`); }
