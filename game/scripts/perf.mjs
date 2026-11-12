import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const UNMEASURED = '未計測';
const SPEED = { walk: 72, run: 128 };
const KEYS = { arrows: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
  wasd: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } };

export function statistics(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const q = p => a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)];
  return { count: a.length, mean: a.reduce((s, x) => s + x, 0) / a.length,
    median: q(0.5), p95: q(0.95), p99: q(0.99), max: a.at(-1) };
}

export function inspectFrames(frames, areas, view) {
  const violations = {}, examples = {};
  let overTileFrames = 0, stopped = 0, blockedFrames = 0;
  const add = (kind, sample) => {
    violations[kind] = (violations[kind] ?? 0) + 1;
    (examples[kind] ??= []);
    if (examples[kind].length < 5) examples[kind].push(sample);
  };
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], p = frames[i - 1];
    if (![f.camX, f.camY, view.viewW, view.viewH, view.zoom].every(Number.isInteger)) add('nonIntegerCamera', f);
    if ((f.chunksCached ?? 0) > 24) add('cacheLimit', f);
    if (!p || p.areaId !== f.areaId) { stopped = 0; continue; }
    const dx = f.px - p.px, dy = f.py - p.py;
    const distance = Math.hypot(dx, dy), expected = (f.run ? SPEED.run : SPEED.walk) * f.dt;
    const area = areas[f.areaId];
    const direction = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f.dir];
    let blocked = false;
    if (area && direction) {
      const nx = f.px + direction[0], ny = f.py + direction[1];
      for (let y = Math.floor((ny - 8) / 16); y <= Math.ceil(ny / 16) - 1; y++) {
        for (let x = Math.floor((nx - 5) / 16); x <= Math.ceil((nx + 5) / 16) - 1; x++) {
          if (x < 0 || y < 0 || x >= area.width || y >= area.height || area.solid?.[y * area.width + x]) blocked = true;
        }
      }
    }
    if (blocked && distance + 1.5 < expected) blockedFrames++;
    if (distance > 16) overTileFrames++;
    if (f.dir && distance > expected + 1.5) add('movementExceedsProcessedTime', { i, distance, expected, frame: f });
    if (f.dir && f.dt > 0 && !blocked && Math.abs(distance - expected) > 1.5) add('movementDistanceMismatch', { i, distance, expected, frame: f });
    if (f.dir && f.dt > 0) {
      stopped = !blocked && distance < 0.001 ? stopped + 1 : 0;
      if (stopped >= 2) add('heldInputStopped', { i, frame: f });
    } else if (!f.dir) stopped = 0;
    if (!area) { add('unknownArea', f); continue; }
    for (const [coord, camera, delta, size, viewport, offset] of [
      ['px', 'camX', dx, area.width * 16, view.viewW, 0],
      ['py', 'camY', dy, area.height * 16, view.viewH, 8],
    ]) {
      const max = size - viewport;
      const following = max > 0 && f[camera] > 0 && f[camera] < max && p[camera] > 0 && p[camera] < max;
      if (following && Math.abs((f[camera] - p[camera]) - delta) > 1.000001) add('cameraDiscontinuity', { i, coord, before: p, after: f });
      if (following && f.dir === p.dir && f.run === p.run && f.dir && f.moving && p.moving) {
        const previousPixel = Math.round(p[coord]) - p[camera];
        const pixel = Math.round(f[coord]) - f[camera];
        if (pixel !== previousPixel) add('renderedPlayerJitter', { i, coord, previousPixel, pixel,
          rawBefore: p[coord] - p[camera], rawAfter: f[coord] - f[camera] });
      }
      // Also check clamped/centered positions against the renderer's public rule.
      const expectedCamera = size < viewport ? Math.round((size - viewport) / 2)
        : Math.max(0, Math.min(max, Math.round(f[coord] - offset) - Math.floor(viewport / 2)));
      if (f[camera] !== expectedCamera) add('cameraPosition', { i, coord, expectedCamera, actual: f[camera] });
    }
  }
  return { count: Object.values(violations).reduce((s, n) => s + n, 0), violations, examples, overTileFrames, blockedFrames };
}

function summarize(frames, refreshMs) {
  const intervals = frames.map(f => f.interval).filter(n => n > 0);
  const fraction = threshold => intervals.length ? intervals.filter(n => n > threshold).length / intervals.length : null;
  const timingKeys = [...new Set(frames.flatMap(f => Object.keys(f.timings ?? {})))];
  return { frames: frames.length, intervalMs: statistics(intervals), over33_4Ratio: fraction(33.4),
    overRefresh1_5Ratio: refreshMs ? fraction(refreshMs * 1.5) : null,
    updateMs: statistics(frames.map(f => f.updateMs)), drawMs: statistics(frames.map(f => f.drawMs)),
    steps: statistics(frames.map(f => f.steps)), droppedMs: frames.reduce((s, f) => s + (f.droppedMs ?? 0), 0),
    bakedDrawMs: statistics(frames.filter(f => f.chunksBakedThisFrame > 0).map(f => f.drawMs)),
    steadyDrawMs: statistics(frames.filter(f => f.chunksBakedThisFrame === 0).map(f => f.drawMs)),
    drawBreakdownMs: Object.fromEntries(timingKeys.map(k => [k, statistics(frames.map(f => f.timings?.[k]))])),
    longFrameLowCpuCount: frames.filter(f => f.interval > 33.4 && f.updateMs + f.drawMs < f.interval * 0.1).length };
}

async function measureMode(config, mode) {
  const args = mode === 'uncapped' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [];
  const browser = await chromium.launch({ headless: true, args,
    ...(config.executable ? { executablePath: config.executable } : config.channel === 'chrome' ? { channel: 'chrome' } : {}) });
  const result = { mode, environment: null, scenarios: [], errors: [] };
  try {
    const discovery = await browser.newPage({ viewport: config.viewport, deviceScaleFactor: config.dpr });
    await discovery.goto(config.url);
    await discovery.waitForFunction(() => !!window.__slg?.frames);
    const data = await discovery.evaluate(async () => {
      const { PERF_ROUTES, LANDMARKS } = await import('/src/world/index.ts');
      const g = window.__slg.game;
      const c = document.createElement('canvas'), gl = c.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { routes: PERF_ROUTES, landmarks: LANDMARKS, variantId: g.world.variant.id,
        areas: Object.fromEntries([...g.world.areas].map(([id, a]) => [id, { width: a.width, height: a.height, solid: Array.from(a.solid) }])),
        environment: { userAgent: navigator.userAgent, devicePixelRatio,
          webglRenderer: gl ? gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null } };
    });
    const idleIntervals = await discovery.evaluate(() => new Promise(resolve => {
      const values = []; let first, previous;
      function tick(t) {
        first ??= t;
        if (previous !== undefined) values.push(t - previous);
        previous = t;
        if (t - first >= 2000) resolve(values); else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }));
    const refresh = statistics(idleIntervals);
    result.environment = { ...data.environment, browserVersion: browser.version(), channel: config.channel,
      executable: config.executable ?? null, headlessKind: config.executable ? 'custom executable headless' : config.channel === 'chrome' ? 'Chrome new headless' : 'Chromium headless shell',
      args, viewport: config.viewport, machine: config.machine, idleIntervalMs: refresh,
      estimatedRefreshIntervalMs: refresh?.median ?? null, artifactsEnabled: !!config.out,
      note: 'Headless rAF cadence and video/screenshot overhead do not measure display-vsync experience.' };
    await discovery.close();
    const scenarios = Object.entries(data.routes).map(([id, route], index) => ({ id, ...route,
      run: index % 2 === 1, keys: index % 2 ? 'wasd' : 'arrows', type: 'route' }));
    for (const run of [false, true]) scenarios.push({ id: run ? 'speed-run' : 'speed-walk',
      points: [data.routes.straightRoad.points[0]], type: 'speed', run, keys: run ? 'wasd' : 'arrows' });
    for (const [id, landmark, areaId] of [
      ['home-transition', 'homeFront', 'home-family-interior'],
      ['school-transition', 'schoolDoorFront', 'school-classroom-interior'],
      ['konbini-transition', 'konbiniDoorFront', 'shop-konbini-interior'],
    ]) scenarios.push({ id, points: [data.landmarks[landmark]], areaId, type: 'transition', run: false, keys: 'arrows' });

    for (const scenario of scenarios) {
      const artifactDir = config.out ? join(config.out, mode, scenario.id) : null;
      if (artifactDir) await mkdir(artifactDir, { recursive: true });
      const context = await browser.newContext({ viewport: config.viewport, deviceScaleFactor: config.dpr,
        ...(artifactDir ? { recordVideo: { dir: artifactDir, size: config.viewport } } : {}) });
      // Reproducible save fixture positions only the initial state; all measured movement uses keyboard events.
      const first = scenario.points[0];
      const seed = { v: 1, variantId: data.variantId, areaId: 'town-main', x: first.x * 16 + 8, y: first.y * 16 + 14, facing: 'down' };
      await context.addInitScript(save => localStorage.setItem('slg-map-save-v1', JSON.stringify(save)), seed);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(String(e)));
      let samples = [], timingSamples = [], heldKey = null;
      let scenarioError = null, speed = null, view = null;
      let captureTask = Promise.resolve([]);
      const state = () => page.evaluate(() => ({ ...window.__slg.game.player }));
      async function switchKey(key) {
        if (heldKey === key) return;
        // Last-key priority allows a direction change while another key remains held.
        if (key) await page.keyboard.down(key);
        if (heldKey) await page.keyboard.up(heldKey);
        heldKey = key;
      }
      async function travel(target) {
        const path = await page.evaluate(async target => {
          const { findPath } = await import('/src/world/index.ts');
          const g = window.__slg.game;
          return findPath(g.area, { x: Math.floor(g.player.x / 16), y: Math.floor((g.player.y - 4) / 16) }, target);
        }, target);
        if (!path) throw new Error(`No route to ${JSON.stringify(target)}`);
        const corners = path.filter((p, i) => i === path.length - 1 || (i > 0 &&
          (p.x - path[i - 1].x !== path[i + 1].x - p.x || p.y - path[i - 1].y !== path[i + 1].y - p.y)));
        for (const corner of corners) {
          for (const axis of ['x', 'y']) {
            const goal = corner[axis] * 16 + (axis === 'x' ? 8 : 14);
            for (let correction = 0; correction < 6; correction++) {
              const p = await state(), delta = goal - p[axis];
              const tileCoordinate = axis === 'x' ? Math.floor(p.x / 16) : Math.floor((p.y - 4) / 16);
              if (Math.abs(delta) <= 2.5 || tileCoordinate === corner[axis]) break;
              const dir = axis === 'x' ? delta > 0 ? 'right' : 'left' : delta > 0 ? 'down' : 'up';
              const key = KEYS[scenario.keys][dir];
              const running = scenario.run && Math.abs(delta) > 32;
              if (running) await page.keyboard.down('Shift'); else await page.keyboard.up('Shift');
              await switchKey(key);
              await page.waitForFunction(({ axis, goal, sign, near }) =>
                (goal - window.__slg.game.player[axis]) * sign <= near,
              { axis, goal, sign: Math.sign(delta), near: running ? 24 : 1.5 }, { polling: 'raf', timeout: 30000 });
              await switchKey(null);
              await page.keyboard.up('Shift');
            }
            const arrived = await state();
            const tileCoordinate = axis === 'x' ? Math.floor(arrived.x / 16) : Math.floor((arrived.y - 4) / 16);
            if (tileCoordinate !== corner[axis]) throw new Error(`Navigation did not reach ${axis} tile ${corner[axis]} (pixel ${arrived[axis]})`);
          }
        }
      }
      try {
        await page.goto(config.url);
        await page.waitForFunction(() => !!window.__slg?.frames && typeof window.__slg.game.update === 'function');
        await page.locator('#view').focus();
        view = await page.evaluate(() => {
          const { game, renderer } = window.__slg;
          if (game.player.areaId !== 'town-main') throw new Error('Invalid performance fixture');
          renderer.measureTimings = true;
          window.__perfDrawSamples = [];
          const draw = renderer.draw.bind(renderer);
          renderer.draw = (...args) => {
            draw(...args);
            window.__perfDrawSamples.push({ t: performance.now(), timings: { ...renderer.stats.timings }, chunksCached: renderer.stats.chunksCached });
          };
          window.__slg.frames.start();
          return { viewW: renderer.stats.viewW, viewH: renderer.stats.viewH, zoom: renderer.stats.zoom };
        });
        if (artifactDir) captureTask = (async () => {
          const captures = [], start = Date.now();
          for (let i = 0; i < 10; i++) {
            const delay = start + i * 120 - Date.now();
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
            const file = join(artifactDir, `frame-${String(i).padStart(2, '0')}.png`);
            await page.screenshot({ path: file });
            captures.push({ file, elapsedMs: Date.now() - start, targetElapsedMs: i * 120 });
          }
          return captures;
        })().catch(error => { scenarioError ??= String(error); return []; });
        if (scenario.type === 'route') {
          for (const target of scenario.points.slice(1)) await travel(target);
        } else if (scenario.type === 'speed') {
          // Audit wall-clock speed on an unobstructed road, independent of navigation tolerance.
          if (scenario.run) await page.keyboard.down('Shift');
          const before = await page.evaluate(() => ({ t: performance.now(), ...window.__slg.game.player }));
          await switchKey(KEYS[scenario.keys].right);
          await page.waitForTimeout(4500);
          await switchKey(null);
          await page.keyboard.up('Shift');
          const after = await page.evaluate(() => ({ t: performance.now(), ...window.__slg.game.player }));
          const seconds = (after.t - before.t) / 1000;
          const measured = Math.hypot(after.x - before.x, after.y - before.y) / seconds;
          const expected = scenario.run ? SPEED.run : SPEED.walk;
          speed = { wallSeconds: seconds, distancePx: Math.hypot(after.x - before.x, after.y - before.y),
            measuredPxPerSecond: measured, expectedPxPerSecond: expected, relativeError: (measured - expected) / expected,
            candidateTolerance: 0.05, pass: Math.abs(measured - expected) / expected <= 0.05 };
          if (after.areaId !== before.areaId) throw new Error('Speed audit crossed an area boundary');
        } else {
          await switchKey('ArrowUp');
          await page.waitForFunction(id => window.__slg.game.player.areaId === id, scenario.areaId, { polling: 'raf', timeout: 15000 });
          // Switch direction before releasing the previous key, keeping actual input held.
          await switchKey('ArrowDown');
          await page.waitForFunction(() => window.__slg.game.player.areaId === 'town-main', null, { polling: 'raf', timeout: 15000 });
          await switchKey(null);
        }
      } catch (error) { scenarioError = String(error); }
      finally {
        await switchKey(null).catch(() => {});
        await page.keyboard.up('Shift').catch(() => {});
        await captureTask.catch(e => { scenarioError ??= String(e); });
        const recorded = await page.evaluate(() => ({ frames: window.__slg.frames.stop(), draws: window.__perfDrawSamples })).catch(() => null);
        if (recorded) { samples = recorded.frames; timingSamples = recorded.draws; }
        // Draw and FrameSample are recorded in the same frame, in identical order.
        samples.forEach((f, i) => {
          const draw = timingSamples[i];
          if (draw) Object.assign(f, { timings: draw.timings, chunksCached: draw.chunksCached });
        });
        // Do not replace the authoritative rAF timestamp with the timing wrapper's wall timestamp.
        const continuity = view ? inspectFrames(samples, data.areas, view) : { count: 1, violations: { unmeasured: 1 } };
        const report = { id: scenario.id, type: scenario.type, input: { keys: scenario.keys, run: scenario.run },
          error: scenarioError, pageErrors, speed, continuity, stats: summarize(samples, refresh?.median),
          artifacts: { video: artifactDir ? await page.video()?.path() : null,
            screenshots: artifactDir ? await captureTask.catch(() => []) : UNMEASURED }, frames: samples };
        report.status = scenarioError || pageErrors.length || continuity.count || speed?.pass === false ? 'FAIL'
          : report.stats.overRefresh1_5Ratio > 0.05 || continuity.overTileFrames > 0 || continuity.blockedFrames > 0 ? 'WARN' : 'PASS';
        result.scenarios.push(report);
        await context.close();
        if (artifactDir) await writeFile(join(artifactDir, 'scenario-result.json'), JSON.stringify(report, null, 2));
        console.log(`${mode} ${scenario.id}: ${report.status}, frames=${samples.length}, continuity=${continuity.count}`);
        if (report.status === 'FAIL') console.log(`FAIL-DETAIL ${mode} ${scenario.id} ${JSON.stringify({ error: scenarioError, pageErrors, violations: continuity.violations, examples: continuity.examples, speed })}`);
      }
    }
  } catch (error) { result.errors.push(String(error)); }
  finally { await browser.close(); }
  return result;
}

function showSummary(result) {
  const modes = result.modes;
  console.log(`SUMMARY environment machine=${result.config.machine || UNMEASURED} viewport=${result.config.viewport.width}x${result.config.viewport.height} dpr=${result.config.dpr} channel=${result.config.channel}`);
  for (const mode of modes) {
    const f = mode.scenarios.flatMap(s => s.frames);
    const s = summarize(f, mode.environment?.estimatedRefreshIntervalMs);
    const n = value => Number.isFinite(value) ? value.toFixed(2) : UNMEASURED;
    const i = s.intervalMs;
    const violations = mode.scenarios.reduce((sum, r) => sum + r.continuity.count, 0);
    const status = mode.errors.length || mode.scenarios.some(r => r.status === 'FAIL') ? 'FAIL'
      : mode.scenarios.some(r => r.status === 'WARN') ? 'WARN' : 'PASS';
    console.log(`SUMMARY ${mode.mode} ${status} interval ms avg/median/p95/p99/max=${[i?.mean, i?.median, i?.p95, i?.p99, i?.max].map(n).join('/')} over33.4=${n(s.over33_4Ratio === null ? null : s.over33_4Ratio * 100)}% idleMedian=${n(mode.environment?.estimatedRefreshIntervalMs)}`);
    console.log(`SUMMARY ${mode.mode} update median/p95/max=${[s.updateMs?.median, s.updateMs?.p95, s.updateMs?.max].map(n).join('/')} draw=${[s.drawMs?.median, s.drawMs?.p95, s.drawMs?.max].map(n).join('/')} steps median=${n(s.steps?.median)} droppedMs=${n(s.droppedMs)} lowCpuLongFrames=${s.longFrameLowCpuCount}`);
    console.log(`SUMMARY ${mode.mode} wallSpeed walk/run=${mode.scenarios.filter(r => r.speed).map(r => `${n(r.speed.measuredPxPerSecond)}/${r.speed.expectedPxPerSecond}(${r.speed.pass ? 'PASS' : 'FAIL'})`).join(' ')} continuity=${violations} over16pxWarnings=${mode.scenarios.reduce((sum, r) => sum + (r.continuity.overTileFrames ?? 0), 0)} wallContactFrames=${mode.scenarios.reduce((sum, r) => sum + (r.continuity.blockedFrames ?? 0), 0)}`);
    for (const error of mode.errors) console.log(`SUMMARY ${mode.mode} FAIL ${error.split('\n')[0]}`);
  }
  console.log('SUMMARY thresholds are candidates: wall speed ±5%, p95 <= idle interval ×1.5, continuity=0; frame time alone only warns. Display-vsync experience is unmeasured.');
}

export async function main() {
  const viewportMatch = /^(\d+)x(\d+)$/.exec(process.env.SLG_VIEWPORT ?? '1280x800');
  if (!viewportMatch) throw new Error('SLG_VIEWPORT must be WIDTHxHEIGHT');
  const config = { url: process.env.SLG_URL ?? 'http://127.0.0.1:5173',
    viewport: { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) }, dpr: Number(process.env.SLG_DPR ?? 1),
    channel: process.env.SLG_CHANNEL ?? 'chromium', executable: process.env.SLG_EXECUTABLE || undefined,
    machine: process.env.SLG_MACHINE ?? UNMEASURED, out: process.env.SLG_OUT ? resolve(process.env.SLG_OUT) : null };
  if (!['chromium', 'chrome'].includes(config.channel) || !Number.isFinite(config.dpr) || config.dpr <= 0) throw new Error('Invalid channel/DPR');
  const result = { config, startedAt: new Date().toISOString(), modes: [] };
  for (const mode of ['default', 'uncapped']) {
    try { result.modes.push(await measureMode(config, mode)); }
    catch (error) { result.modes.push({ mode, environment: null, scenarios: [], errors: [String(error)] }); }
  }
  showSummary(result);
  if (config.out) {
    await mkdir(config.out, { recursive: true });
    await writeFile(join(config.out, 'perf-result.json'), JSON.stringify(result, null, 2));
  }
  if (result.modes.some(m => m.errors.length || m.scenarios.some(r => r.status === 'FAIL'))) process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--matrix')) {
    let failed = false;
    const summaries = [];
    const variants = [
      { name: 'chromium', channel: 'chromium', executable: '' },
      { name: process.env.SLG_EXECUTABLE ? 'custom' : 'chrome', channel: 'chrome', executable: process.env.SLG_EXECUTABLE ?? '' },
    ];
    for (const variant of variants) for (const viewport of ['1280x720', '640x360']) {
      const label = `${variant.name}-${viewport}`;
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, SLG_CHANNEL: variant.channel, SLG_EXECUTABLE: variant.executable, SLG_VIEWPORT: viewport,
          ...(process.env.SLG_OUT ? { SLG_OUT: join(process.env.SLG_OUT, label) } : {}) } });
      // Keep the final matrix SUMMARY under twenty lines, while retaining detailed child output.
      process.stdout.write((child.stdout ?? '').replace(/^SUMMARY /gm, 'DETAIL '));
      process.stderr.write(child.stderr ?? '');
      const lines = (child.stdout ?? '').split('\n');
      for (const mode of ['default', 'uncapped']) {
        const modeLines = lines.filter(line => line.startsWith(`SUMMARY ${mode} `));
        summaries.push(`SUMMARY ${label} ${modeLines.map(line => line.replace(/^SUMMARY /, '')).join(' | ') || 'FAIL 未計測'}`);
      }
      if (child.status !== 0) failed = true;
    }
    summaries.forEach(line => console.log(line));
    process.exitCode = failed ? 1 : 0;
  } else {
    await main().catch(error => { console.error(`SUMMARY FAIL ${error.stack}`); process.exitCode = 1; });
  }
}
