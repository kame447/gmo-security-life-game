import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.SLG_URL ?? 'http://127.0.0.1:5173';
const shotsDir = process.env.SLG_SHOTS;
const jsonOut = process.env.SLG_JSON;
const baselinePath = process.env.SLG_BASELINE;

if (shotsDir) await mkdir(shotsDir, { recursive: true });
const baseline = baselinePath ? JSON.parse(await readFile(baselinePath, 'utf8')) : null;

const PROFILES = [
  { name: 'portrait320-d1', width: 320, height: 568, dpr: 1 },
  { name: 'portrait320-d3', width: 320, height: 568, dpr: 3 },
  { name: 'portrait360-d1', width: 360, height: 640, dpr: 1 },
  { name: 'portrait360-d3', width: 360, height: 640, dpr: 3 },
  { name: 'portrait375-d1', width: 375, height: 667, dpr: 1 },
  { name: 'portrait375-d3', width: 375, height: 667, dpr: 3 },
  { name: 'portrait390-d1', width: 390, height: 844, dpr: 1 },
  { name: 'portrait390-d3', width: 390, height: 844, dpr: 3 },
  { name: 'landscape844-d2', width: 844, height: 390, dpr: 2 },
  { name: 'desktop1280-d1', width: 1280, height: 800, dpr: 1 },
];

const POINTS = [
  { name: 'homeFront', label: '自宅の前', key: 'homeFront' },
  { name: 'shoppingStreet', label: '商店街', key: 'shoppingStreet' },
  { name: 'stationFront', label: '駅の前', key: 'stationFront' },
];

function overlapMetrics(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return { width, height, area: width * height };
}

function insideViewport(box, viewport) {
  const eps = 0.05;
  return box.x >= -eps && box.y >= -eps && box.right <= viewport.width + eps && box.bottom <= viewport.height + eps;
}

function sameRect(a, b) {
  const eps = 0.05;
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.width - b.width) <= eps && Math.abs(a.height - b.height) <= eps;
}

function findBaselineRow(profileName, touchOn, pointName) {
  if (!baseline?.rows) return null;
  return baseline.rows.find(row => row.profile === profileName && row.touchOn === touchOn && row.point === pointName) ?? null;
}

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const rows = [];
let passed = 0;
let total = 0;

function recordCheck(name, ok, detail = '') {
  total++;
  if (ok) {
    passed++;
    console.log(`PASS ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    console.log(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

try {
  const origin = new URL(url).origin;
  for (const profile of PROFILES) {
    for (const touchOn of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        deviceScaleFactor: profile.dpr,
        hasTouch: touchOn,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(String(err)));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

      try {
        await page.goto(`${origin}/?review=1`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.__slg?.game &&
          document.querySelector('#minimap-button')?.dataset.areaId === 'town-main' &&
          !window.__slg.renderer.stats.fading);
        await page.evaluate(() => document.fonts.ready);

        const isTouchOn = await page.locator('#touch').evaluate(node => node.classList.contains('on'));
        if (isTouchOn !== touchOn) await page.locator('#btn-touch').click();
        assert.equal(await page.locator('#touch').evaluate(node => node.classList.contains('on')), touchOn);

        for (const point of POINTS) {
          const placed = await page.evaluate(async key => {
            const { LANDMARKS } = await import('/src/world/landmarks.ts');
            const { TILE } = await import('/src/core/coords.ts');
            const target = LANDMARKS[key];
            const pos = { areaId: 'town-main', x: (target.x + 0.5) * TILE, y: (target.y + 0.75) * TILE, facing: 'down' };
            window.__slg.game.player = pos;
            return pos;
          }, point.key);
          await frames(page);

          const measured = await page.evaluate(() => {
            const visible = el => {
              if (!el) return false;
              const style = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
            };
            const box = el => {
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
            };
            const buttons = [...document.querySelectorAll('#menu button')].map(el => {
              const style = getComputedStyle(el);
              return {
                id: el.id,
                text: el.textContent?.trim() ?? '',
                visible: visible(el),
                rect: box(el),
                fontSize: Number.parseFloat(style.fontSize),
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
              };
            });
            const minimapEl = document.querySelector('#minimap-button');
            const hudEl = document.querySelector('#hud');
            const menuEl = document.querySelector('#menu');
            const hintEl = document.querySelector('#hint');
            const bagEl = document.querySelector('.bag-quick-hud');
            const touchButtons = [...document.querySelectorAll('#touch button')].filter(visible).map(el => ({
              id: el.getAttribute('data-dir') || (el.hasAttribute('data-act') ? 'act' : 'bike'),
              rect: box(el),
            }));
            return {
              viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
              hud: { visible: visible(hudEl), text: hudEl?.textContent ?? '', rect: box(hudEl) },
              menu: { visible: visible(menuEl), rect: box(menuEl) },
              minimap: { visible: visible(minimapEl), rect: box(minimapEl) },
              hint: { visible: visible(hintEl), rect: box(hintEl) },
              bagQuickHud: { visible: visible(bagEl), rect: bagEl ? box(bagEl) : null },
              touchButtons,
              buttons,
            };
          });

          if (shotsDir) {
            const shotName = `${profile.name}-${touchOn ? 'touch-on' : 'touch-off'}-${point.name}.png`;
            await page.screenshot({ path: path.join(shotsDir, shotName) });
          }

          // Compute row count, overlaps, containment, minimap coverage.
          const rowTops = [];
          for (const b of measured.buttons) {
            if (!rowTops.some(t => Math.abs(t - b.rect.y) <= 4)) rowTops.push(b.rect.y);
          }
          const menuRows = rowTops.length;

          const buttonVsMinimap = measured.buttons.map(b => ({
            id: b.id,
            ...overlapMetrics(b.rect, measured.minimap.rect),
          }));
          const minimapMenuOverlapArea = buttonVsMinimap.reduce((sum, item) => sum + item.area, 0);

          let buttonSelfOverlapArea = 0;
          for (let i = 0; i < measured.buttons.length; i++) {
            for (let j = i + 1; j < measured.buttons.length; j++) {
              buttonSelfOverlapArea += overlapMetrics(measured.buttons[i].rect, measured.buttons[j].rect).area;
            }
          }

          const otherHudItems = [
            { name: 'hud', visible: measured.hud.visible, rect: measured.hud.rect },
            { name: 'hint', visible: measured.hint.visible, rect: measured.hint.rect },
            ...(measured.bagQuickHud.visible ? [{ name: 'bag-quick-hud', visible: true, rect: measured.bagQuickHud.rect }] : []),
            ...measured.touchButtons.map(tb => ({ name: `touch-${tb.id}`, visible: true, rect: tb.rect })),
          ].filter(item => item.visible);

          const otherOverlaps = [];
          for (const item of otherHudItems) {
            const mm = overlapMetrics(measured.minimap.rect, item.rect);
            if (mm.area > 0) otherOverlaps.push({ target: 'minimap', other: item.name, ...mm });
            for (const b of measured.buttons) {
              const bm = overlapMetrics(b.rect, item.rect);
              if (bm.area > 0) otherOverlaps.push({ target: b.id, other: item.name, ...bm });
            }
          }
          const otherOverlapArea = otherOverlaps.reduce((sum, item) => sum + item.area, 0);

          const allButtonsVisible = measured.buttons.length === 5 && measured.buttons.every(b => b.visible);
          const allButtonsInViewport = measured.buttons.every(b => insideViewport(b.rect, profile) && b.scrollWidth <= b.clientWidth + 1);
          const minimapInViewport = measured.minimap.visible && insideViewport(measured.minimap.rect, profile);
          const minFontPx = Math.min(...measured.buttons.map(b => b.fontSize));
          const maxFontPx = Math.max(...measured.buttons.map(b => b.fontSize));
          const fontSizesOk = measured.buttons.every(b => b.fontSize >= 10);

          const minimapAreaPx2 = measured.minimap.rect.width * measured.minimap.rect.height;
          const viewportAreaPx2 = profile.width * profile.height;
          const minimapCoveragePct = (minimapAreaPx2 / viewportAreaPx2) * 100;

          // Tap / click center of #btn-reset and verify actual behavior.
          const resetBtn = measured.buttons.find(b => b.id === 'btn-reset');
          const cx = resetBtn.rect.x + resetBtn.rect.width / 2;
          const cy = resetBtn.rect.y + resetBtn.rect.height / 2;
          const hitCheck = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const reset = document.querySelector('#btn-reset');
            return {
              id: el?.id || null,
              tag: el?.tagName || null,
              inReset: !!(el && reset && (el === reset || reset.contains(el))),
            };
          }, { x: cx, y: cy });

          await page.evaluate(() => {
            window.__resetProbe = { areaEnters: 0 };
            if (!window.__resetHooked) {
              window.__resetHooked = true;
              window.__slg.game.on(e => {
                if (e.type === 'area-enter' && window.__resetProbe) window.__resetProbe.areaEnters++;
              });
            }
          });

          if (touchOn) await page.touchscreen.tap(cx, cy);
          else await page.mouse.click(cx, cy);
          await frames(page);

          const afterClick = await page.evaluate(async () => {
            const { START } = await import('/src/world/landmarks.ts');
            const { feetAtTile } = await import('/src/core/coords.ts');
            const expectedStart = { areaId: START.areaId, ...feetAtTile(START.x, START.y), facing: START.facing };
            const fullMapVisible = !document.querySelector('#full-map-overlay')?.hidden;
            const confirmDialog = [...document.querySelectorAll('[role="dialog"]')].find(el => {
              const s = getComputedStyle(el);
              return !el.closest('[hidden]') && s.display !== 'none' && s.visibility === 'visible';
            });
            return {
              fullMapVisible,
              confirmDialogId: confirmDialog?.id || null,
              player: { ...window.__slg.game.player },
              expectedStart,
              areaEnters: window.__resetProbe.areaEnters,
            };
          });

          // Restore state after reset/accidental-map-open check.
          if (afterClick.fullMapVisible) {
            if (touchOn) await page.locator('#full-map-close').tap();
            else await page.locator('#full-map-close').click();
            await page.locator('#full-map-overlay').waitFor({ state: 'hidden' });
          }
          if (afterClick.confirmDialogId) {
            await page.keyboard.press('Escape');
          }
          await page.evaluate(pos => { window.__slg.game.player = pos; }, placed);
          await frames(page);

          const atExpectedStart = afterClick.player.areaId === afterClick.expectedStart.areaId &&
            afterClick.player.x === afterClick.expectedStart.x &&
            afterClick.player.y === afterClick.expectedStart.y &&
            afterClick.player.facing === afterClick.expectedStart.facing;
          const resetTriggered = afterClick.areaEnters > 0 && atExpectedStart;
          const resetCenterOk = hitCheck.inReset && !afterClick.fullMapVisible && (resetTriggered || !!afterClick.confirmDialogId);

          let regressionOk = true;
          const regressionDiffs = [];
          if (profile.width >= 390 && baseline) {
            const base = findBaselineRow(profile.name, touchOn, point.name);
            if (!base) {
              regressionOk = false;
              regressionDiffs.push('missing-baseline-row');
            } else {
              if (!sameRect(measured.minimap.rect, base.minimap.rect)) {
                regressionOk = false;
                regressionDiffs.push(`minimap diff: got ${JSON.stringify(measured.minimap.rect)} expected ${JSON.stringify(base.minimap.rect)}`);
              }
              for (const b of measured.buttons) {
                const bb = base.buttons.find(item => item.id === b.id);
                if (!bb || !sameRect(b.rect, bb.rect)) {
                  regressionOk = false;
                  regressionDiffs.push(`button ${b.id} diff`);
                }
              }
            }
          }

          const label = `${profile.name} touch=${touchOn ? 'on' : 'off'} ${point.name}`;
          const scenarioOk = allButtonsVisible &&
            minimapMenuOverlapArea === 0 &&
            buttonSelfOverlapArea === 0 &&
            otherOverlapArea === 0 &&
            fontSizesOk &&
            allButtonsInViewport &&
            minimapInViewport &&
            resetCenterOk &&
            regressionOk;

          recordCheck(
            label,
            scenarioOk,
            `rows=${menuRows} overlap=${minimapMenuOverlapArea.toFixed(1)}px2 self=${buttonSelfOverlapArea.toFixed(1)} other=${otherOverlapArea.toFixed(1)} font=${minFontPx}-${maxFontPx}px inVP=${allButtonsInViewport && minimapInViewport} mini=${Math.round(minimapAreaPx2)}px2(${minimapCoveragePct.toFixed(1)}%) resetHit=${hitCheck.id || hitCheck.tag}(ok=${resetCenterOk},map=${afterClick.fullMapVisible},reset=${resetTriggered})${regressionDiffs.length ? ` reg=${regressionDiffs.join(';')}` : ''}`,
          );

          rows.push({
            profile: profile.name,
            viewport: { width: profile.width, height: profile.height, dpr: profile.dpr },
            touchOn,
            point: point.name,
            pointLabel: point.label,
            menuRows,
            hud: measured.hud,
            menu: measured.menu,
            buttons: measured.buttons,
            minimap: {
              ...measured.minimap,
              areaPx2: minimapAreaPx2,
              coveragePct: minimapCoveragePct,
            },
            overlaps: {
              minimapMenuAreaPx2: minimapMenuOverlapArea,
              buttonVsMinimap,
              buttonSelfAreaPx2: buttonSelfOverlapArea,
              otherHudAreaPx2: otherOverlapArea,
              otherOverlaps,
            },
            fontSizes: { minPx: minFontPx, maxPx: maxFontPx, ok: fontSizesOk },
            containment: { allButtonsVisible, allButtonsInViewport, minimapInViewport },
            resetCenterCheck: {
              cx,
              cy,
              hit: hitCheck,
              fullMapOpened: afterClick.fullMapVisible,
              confirmDialogId: afterClick.confirmDialogId,
              resetTriggered,
              ok: resetCenterOk,
            },
            regression: { checked: profile.width >= 390 && !!baseline, ok: regressionOk, diffs: regressionDiffs },
            pass: scenarioOk,
          });
        }

        recordCheck(`${profile.name} touch=${touchOn ? 'on' : 'off'} console/page errors`, errors.length === 0, errors.join('; '));
      } finally {
        await context.close();
      }
    }
  }

  // Every portrait width from 320 to 420: the five buttons stay on one row, clear of the minimap, and the center of
  // 「さいしょから」 is the button itself. The second pass widens every character by 0.5px (about 5%).
  for (const dpr of [1, 2]) {
    for (const touchOn of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: dpr, hasTouch: touchOn });
      const page = await context.newPage();
      try {
        await page.goto(`${origin}/?review=1`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => !!window.__slg?.game &&
          document.querySelector('#minimap-button')?.dataset.areaId === 'town-main' &&
          !window.__slg.renderer.stats.fading);
        await page.evaluate(() => document.fonts.ready);
        const isTouchOn = await page.locator('#touch').evaluate(node => node.classList.contains('on'));
        if (isTouchOn !== touchOn) await page.locator('#btn-touch').click();

        for (const wide of [false, true]) {
          if (wide) await page.addStyleTag({ content: '#menu button { letter-spacing: 0.5px; }' });
          const bad = [];
          for (let width = 320; width <= 420; width++) {
            await page.setViewportSize({ width, height: 640 });
            await page.waitForFunction(w => window.innerWidth === w, width);
            await frames(page);
            const m = await page.evaluate(() => {
              const buttons = [...document.querySelectorAll('#menu button')].map(el => el.getBoundingClientRect());
              const map = document.querySelector('#minimap-button').getBoundingClientRect();
              const reset = document.querySelector('#btn-reset');
              const r = reset.getBoundingClientRect();
              return {
                count: buttons.length,
                rows: new Set(buttons.map(b => Math.round(b.y))).size,
                overlap: buttons.reduce((sum, b) => sum +
                  Math.max(0, Math.min(b.right, map.right) - Math.max(b.x, map.x)) *
                  Math.max(0, Math.min(b.bottom, map.bottom) - Math.max(b.y, map.y)), 0),
                inside: buttons.every(b => b.x >= 0 && b.right <= window.innerWidth),
                hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === reset,
              };
            });
            if (m.count !== 5 || m.rows !== 1 || m.overlap > 0 || !m.inside || !m.hit) {
              bad.push(`${width}:rows=${m.rows},overlap=${m.overlap.toFixed(0)},inside=${m.inside},hit=${m.hit}`);
            }
          }
          recordCheck(`width 320-420 d${dpr} touch=${touchOn ? 'on' : 'off'}${wide ? ' wide-text' : ''}: one row, clear of minimap, reset hittable`,
            bad.length === 0, bad.length ? `${bad.length} widths: ${bad.slice(0, 6).join(' ')}` : '101 widths');
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const allPassed = passed === total;
if (jsonOut) {
  await mkdir(path.dirname(path.resolve(jsonOut)), { recursive: true });
  await writeFile(jsonOut, JSON.stringify({ url, passed, total, ok: allPassed, rows }, null, 2) + '\n');
}
console.log(`SUMMARY ${passed}/${total} ${allPassed ? 'PASS' : 'FAIL'}`);
if (!allPassed) process.exitCode = 1;
