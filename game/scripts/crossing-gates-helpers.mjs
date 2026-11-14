import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export const base = new URL(process.env.SLG_URL || 'http://127.0.0.1:5288');
export const revision = 'near-rail-guard-manual-egress-2026-11-15';
assert.ok(['http:', 'https:'].includes(base.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local preview');
assert.equal(base.search, '', 'Use the normal game, with isolated test storage');
export const sizes = [
  { name: 'desktop', width: 1280, height: 800, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
];
const epoch = Date.parse('2026-11-15T00:00:00Z');

/** Real modules, no Chromium needed. Cyclic runs include an opening that straddles t=0. */
export async function auditSchedule() {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { buildWorld } = await server.ssrLoadModule('/src/world/index.ts');
    const { getCrossings, crossingState, CROSSING_PROTOTYPE } = await server.ssrLoadModule('/src/town-train/crossings.ts');
    const { TOWN_TRAIN_PROTOTYPE } = await server.ssrLoadModule('/src/town-train/config.ts');
    const world = buildWorld(), period = TOWN_TRAIN_PROTOTYPE.intervalSeconds, result = [];
    for (const areaId of ['town-main', 'town-neighbor']) {
      const area = world.areas.get(areaId);
      for (const c of getCrossings(area)) {
        const count = Math.round(period * 1000);
        const open = Array.from({ length: count }, (_, n) => !crossingState(area, c, n / 1000).blocked);
        const runs = [];
        for (let n = 0; n < count; n++) if (open[n] && !open[(n + count - 1) % count]) {
          let length = 0;
          while (length < count && open[(n + length) % count]) length++;
          runs.push(length / 1000);
        }
        assert.ok(Math.max(...runs) >= CROSSING_PROTOTYPE.minimumOpenSeconds, `${c.id}: no eight-second opening`);
        result.push({ id: c.id, width: c.right - c.left,
          openPercent: Math.round(open.filter(Boolean).length / count * 1000) / 10,
          openRunsSeconds: runs, longestOpenSeconds: Math.max(...runs) });
      }
    }
    return { period, crossing: CROSSING_PROTOTYPE, crossings: result };
  } finally { await server.close(); }
}

export async function contextFor(browser, size, report, options = {}) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
    hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1,
    serviceWorkers: 'block', acceptDownloads: false, ...options });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin || url.protocol === 'data:') return route.continue();
    report.blocked.push(url.origin); return route.abort();
  });
  await context.routeWebSocket('**', socket => {
    if (new URL(socket.url()).origin === base.origin.replace(/^http/, 'ws')) return socket.connectToServer();
    report.blocked.push(new URL(socket.url()).origin); void socket.close();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('download', item => { report.errors.push(`unexpected download: ${item.suggestedFilename()}`); void item.cancel(); });
  await page.clock.install({ time: new Date(epoch) });
  await page.goto(base.href, { waitUntil: 'load' });
  await page.clock.pauseAt(new Date(epoch + 60000));
  await page.clock.runFor(64);
  await installProbe(page);
  return { context, page };
}

export async function installProbe(page) {
  await page.evaluate(async () => {
    const { crossingState, getCrossings } = await import('/src/town-train/crossings.ts');
    const { TownTrainService } = await import('/src/town-train/service.ts');
    const { canStand } = await import('/src/map/explorer.ts');
    const service = new TownTrainService(), renderer = window.__slg.renderer;
    window.__crossingFrames = [];
    if (renderer.__crossingObserved) return;
    renderer.__crossingObserved = true;
    const draw = renderer.draw.bind(renderer);
    renderer.draw = (game, t) => {
      draw(game, t);
      if (game.area.def.kind !== 'outdoor') return;
      const p = game.player;
      const touchingTrain = service.frames(game.area, t).some(f =>
        p.x + 9 > f.x && p.x - 9 < f.x + f.length && p.y > f.y && p.y - 26 < f.footY);
      window.__crossingFrames.push({ t, player: { ...p }, moving: game.moving, touchingTrain,
        standable: canStand(game.area, p.x, p.y),
        crossings: getCrossings(game.area).map(c => ({ id: c.id, ...crossingState(game.area, c, t) })) });
      if (window.__crossingFrames.length > 5000) window.__crossingFrames.shift();
    };
  });
}
export const clearProbe = page => page.evaluate(() => { window.__crossingFrames.length = 0; });
export const frames = page => page.evaluate(() => window.__crossingFrames);
export const player = page => page.evaluate(() => ({ ...window.__slg.game.player }));
export const snapshot = page => page.evaluate(() => window.__slg.game.serialize());
export const crossingsFor = (page, areaId) => page.evaluate(async id => {
  const { getCrossings } = await import('/src/town-train/crossings.ts');
  return getCrossings(window.__slg.game.world.areas.get(id));
}, areaId);

/** Coordinates are fixture setup only; passages below use actual keyboard or touch input. */
export const putPlayer = (page, c, y = c.northWaitY, x = (c.left + c.right) / 2) => page.evaluate(({ c, x, y }) => {
  window.__slg.game.player = { areaId: c.id.split(':')[0], x, y, facing: 'down' };
}, { c, x, y });

/** Search the real pure schedule, then advance the browser's clock. Never changes the production clock module. */
export async function seek(page, c, kind, minOpenSeconds = 0) {
  const delta = await page.evaluate(async ({ c, kind, minOpenSeconds }) => {
    const { crossingState } = await import('/src/town-train/crossings.ts');
    const { TOWN_TRAIN_PROTOTYPE } = await import('/src/town-train/config.ts');
    const { TownTrainService } = await import('/src/town-train/service.ts');
    const area = window.__slg.game.world.areas.get(c.id.split(':')[0]), service = new TownTrainService();
    const now = performance.now() / 1000;
    for (let i = 0; i < TOWN_TRAIN_PROTOTYPE.intervalSeconds * 2 * 120; i++) {
      const t = now + 0.06 + i / 120, s = crossingState(area, c, t);
      let ok = kind === 'before-warning' ? !s.blocked && crossingState(area, c, t + 0.12).phase === 'closing'
        : kind.startsWith('passing-') ? s.trainPresent && service.frames(area, t).some(f =>
          f.direction === kind.slice(8) && f.x + f.length > c.left + 8 && f.x < c.right - 8)
        : s.phase === kind;
      if (ok && (kind === 'closing' || kind === 'opening')) ok = s.armDown > 0.3 && s.armDown < 0.7;
      if (ok && kind === 'open') for (let dt = 0; dt < minOpenSeconds; dt += 0.02) {
        if (crossingState(area, c, t + dt).blocked) { ok = false; break; }
      }
      if (ok) return (t - now) * 1000;
    }
    throw new Error(`No ${kind} in two cycles at ${c.id}`);
  }, { c, kind, minOpenSeconds });
  await page.clock.fastForward(delta);
  await page.clock.runFor(32);
}

export async function withDirection(page, direction, touch, run, action) {
  await page.locator('#view').focus();
  if (run) await page.keyboard.down('Shift');
  try {
    if (!touch) {
      const key = `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`;
      await page.keyboard.down(key);
      try { await action(); } finally { await page.keyboard.up(key); }
    } else {
      const box = await page.locator(`#touch [data-dir="${direction}"]`).boundingBox();
      assert.ok(box, 'Touch control is visible');
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      try { await action(); }
      finally { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
    }
  } finally { if (run) await page.keyboard.up('Shift'); }
}
export async function hold(page, direction, ms, touch = false, run = false) {
  await withDirection(page, direction, touch, run, () => page.clock.runFor(ms));
}
export const isInside = (c, p) => p.x + 5 > c.left && p.x - 5 < c.right && p.y > c.northWaitY && p.y < c.southWaitY;
export function assertSafe(log) {
  assert.ok(log.length > 0, 'Observe actual drawn frames');
  for (const f of log) { assert.equal(f.touchingTrain, false, `Player overlaps train at ${f.t}`); assert.equal(f.standable, true); }
}

/** Pace virtual frames in wall time so Chromium's video contains the full visible movement. */
export async function recordFor(page, ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 40) {
    const step = Math.min(40, ms - elapsed);
    await page.clock.runFor(step); await delay(step);
  }
}
