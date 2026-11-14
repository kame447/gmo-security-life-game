/** Run headless outside the Codex sandbox. Both servers use disposable git archives. */
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(gameDir, '..');
const beforeRevision = 'ceedf041e4438f3272cd5ddf7d2fc8ccdef131b0';
const afterRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const mode = process.env.SLG_MODE || 'primary';
if (!['primary', 'bag'].includes(mode)) throw new Error('SLG_MODE must be primary or bag');
const expectedHead = process.env.SLG_EXPECT_HEAD;
if (expectedHead && !afterRevision.startsWith(expectedHead)) throw new Error(`Unexpected HEAD ${afterRevision}`);
if (execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim()) throw new Error('Candidate worktree must be clean');
const output = process.env.SLG_SHOTS;
if (!output || !path.isAbsolute(output)) throw new Error('Set SLG_SHOTS to a new absolute output directory');
const outputPath = path.resolve(output), relative = path.relative(repoRoot, outputPath);
if (!relative.startsWith('..' + path.sep) && relative !== '..') throw new Error('SLG_SHOTS must be outside the repository');
await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(outputPath); // Refuse to overwrite a previous run.
const ports = mode === 'bag' ? [Number(process.env.SLG_BAG_PORT || 5392)] :
  [Number(process.env.SLG_BEFORE_PORT || 5390), Number(process.env.SLG_AFTER_PORT || 5391)];
if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== ports.length) throw new Error('Choose distinct valid ports');
const temp = await mkdtemp(path.join(await realpath('/tmp'), 'slg-minimap-labels-'));
const servers = [];
const summary = [];
let browser;

function archive(revision, directory, source = repoRoot) {
  const tar = spawnSync('git', ['archive', '--format=tar', revision], { cwd: source, maxBuffer: 256 * 1024 * 1024 });
  if (tar.status !== 0) throw new Error(`git archive ${revision}: ${tar.stderr}`);
  const extract = spawnSync('tar', ['-xf', '-', '-C', directory], { input: tar.stdout, maxBuffer: 4 * 1024 * 1024 });
  if (extract.status !== 0) throw new Error(`tar ${revision}: ${extract.stderr}`);
}

async function startServer(directory, port) {
  let log = '';
  const child = spawn(process.execPath, [path.join(directory, 'game/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: path.join(directory, 'game'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
  servers.push(child);
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite ${port} exited: ${log}`);
    try { if ((await fetch(`${url}/`)).ok) return url; } catch { /* wait for this child */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Vite ${port} did not start: ${log}`);
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const expand = (box, n) => ({ x: box.x - n, y: box.y - n, width: box.width + n * 2, height: box.height + n * 2 });
const contains = (box, point) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const intersects = (a, b, c, d) =>
  Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
  Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) &&
  orient(a, b, c) * orient(a, b, d) <= 0 && orient(c, d, a) * orient(c, d, b) <= 0;
const touchesLine = (line, rectangle) => {
  const box = expand(rectangle, 2);
  if (contains(box, line.start) || contains(box, line.end)) return true;
  const corners = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }];
  return corners.some((point, i) => intersects(line.start, line.end, point, corners[(i + 1) % corners.length]));
};

function inspectPaint() {
  window.__labelPaint = { mini: null, full: null, counts: { mini: 0, full: 0 }, writes: 0 };
  const saveKey = 'slg-map-save-v1';
  localStorage.setItem(saveKey, '{"sentinel":"review-only"}');
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === saveKey) window.__labelPaint.writes++;
    return originalSet.call(this, key, value);
  };
  const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  const originalBeginPath = CanvasRenderingContext2D.prototype.beginPath;
  const originalMoveTo = CanvasRenderingContext2D.prototype.moveTo;
  const originalLineTo = CanvasRenderingContext2D.prototype.lineTo;
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  const paths = new WeakMap();
  const target = canvas => canvas.id === 'full-map-canvas' ? 'full' : canvas.parentElement?.id === 'minimap-button' ? 'mini' : null;
  CanvasRenderingContext2D.prototype.beginPath = function () { paths.set(this, []); return originalBeginPath.call(this); };
  CanvasRenderingContext2D.prototype.moveTo = function (x, y) { paths.get(this)?.push({ x, y }); return originalMoveTo.call(this, x, y); };
  CanvasRenderingContext2D.prototype.lineTo = function (x, y) { paths.get(this)?.push({ x, y }); return originalLineTo.call(this, x, y); };
  CanvasRenderingContext2D.prototype.stroke = function (...args) {
    const points = paths.get(this), frame = window.__labelPaint.full;
    if (target(this.canvas) === 'full' && frame && this.strokeStyle === '#fff9e9' && this.lineWidth === 3 && points?.length === 2) {
      frame.leaders.push({ start: points[0], end: points[1] });
    }
    return originalStroke.apply(this, args);
  };
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
    const key = target(this.canvas);
    if (key && x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
      window.__labelPaint[key] = { icons: [], labels: [], texts: [], leaders: [] };
      window.__labelPaint.counts[key]++;
    } else if (key && this.fillStyle === '#fff9e9' && window.__labelPaint[key]) {
      const box = { x, y, width, height };
      if (width === height && (height === 13 || height === 22)) window.__labelPaint[key].icons.push(box);
      else if (height === 23) window.__labelPaint[key].labels.push(box);
    }
    return originalFillRect.call(this, x, y, width, height);
  };
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
    const key = target(this.canvas);
    if (key && window.__labelPaint[key]) window.__labelPaint[key].texts.push({ text, font: this.font });
    return maxWidth === undefined ? originalFillText.call(this, text, x, y) : originalFillText.call(this, text, x, y, maxWidth);
  };
}

async function playerBox(page, mode) {
  return page.evaluate(async which => {
    const { fitProjection, localProjection, playerMapPoint, projectPoint } = await import('/src/minimap/model.ts');
    const game = window.__slg.game, canvas = which === 'full' ? document.querySelector('#full-map-canvas') : document.querySelector('#minimap-button canvas');
    const player = playerMapPoint(game.player), area = game.area;
    const projection = which === 'full' ? fitProjection(area.width, area.height, canvas.width, canvas.height, 18) : localProjection(area.width, area.height, canvas.width, canvas.height, player);
    const point = projectPoint(projection, player), radius = (which === 'full' && canvas.width >= 600 ? 15 : 8) + 2;
    return { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 };
  }, mode);
}

async function checkPaint(page, mode, size) {
  const info = await page.evaluate(async which => {
    const { buildAreaMap, fitProjection, projectPoint } = await import('/src/minimap/model.ts');
    const canvas = which === 'full' ? document.querySelector('#full-map-canvas') : document.querySelector('#minimap-button canvas');
    const game = window.__slg.game, map = buildAreaMap(game.area, game.world.facilities.values());
    const projection = fitProjection(map.width, map.height, canvas.width, canvas.height, 18);
    return { width: canvas.width, height: canvas.height, frame: window.__labelPaint[which],
      visible: Number(canvas.dataset.visibleMarkerCount), markerCount: canvas.dataset.markerCount, labelCount: canvas.dataset.labelCount,
      aria: canvas.getAttribute('aria-label'), markers: map.markers.map(marker => ({ ...marker, point: projectPoint(projection, marker) })) };
  }, mode);
  assert.ok(info.frame && info.frame.icons.length > 0, `${size}/${mode}: no facility icons painted`);
  assert.equal(info.visible, info.frame.icons.length, `${size}/${mode}: icon count differs from painted canvas`);
  const boxes = [...info.frame.icons.map(box => expand(box, 1)), ...info.frame.labels.map(box => expand(box, .5))];
  const player = await playerBox(page, mode);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= info.width && box.y + box.height <= info.height, `${size}/${mode}: clipped marker or label`);
    assert.ok(!overlaps(box, player), `${size}/${mode}: marker or label overlaps current location`);
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(box, boxes[j]), `${size}/${mode}: two painted boxes overlap`);
  }
  if (mode === 'full') {
    assert.equal(info.markerCount, '12');
    assert.equal(Number(info.labelCount), info.frame.labels.length);
    assert.equal(info.frame.texts.length, info.frame.labels.length);
    assert.equal(info.frame.leaders.length, info.frame.labels.length, `${size}: each name must have one leader`);
    assert.ok(info.frame.labels.length >= (size === 'desktop' ? 11 : 9), `${size}: too many names omitted`);
    for (const marker of info.markers) assert.ok(info.aria.includes(marker.name), `${size}: missing ${marker.name} from full-map aria-label`);
    for (const entry of info.frame.texts) assert.ok(info.markers.some(marker => marker.name === entry.text) && entry.font.includes('13px'), `${size}: incorrect or unreadable ${entry.text}`);
    for (const line of info.frame.leaders) {
      assert.ok(!touchesLine(line, player), `${size}: leader crosses current location`);
      const own = info.frame.labels.filter(label => contains(label, line.end));
      assert.equal(own.length, 1, `${size}: leader does not end at exactly one label`);
      for (const label of info.frame.labels) if (label !== own[0]) assert.ok(!touchesLine(line, label), `${size}: leader crosses another label`);
      for (const icon of info.frame.icons) {
        const ownIcon = Math.abs(icon.x + icon.width / 2 - line.start.x) <= .51 && Math.abs(icon.y + icon.height / 2 - line.start.y) <= .51;
        if (!ownIcon) assert.ok(!touchesLine(line, icon), `${size}: leader crosses another facility icon`);
      }
      for (const other of info.frame.leaders) if (line !== other) assert.ok(!intersects(line.start, line.end, other.start, other.end), `${size}: leaders cross`);
    }
  } else assert.equal(info.frame.labels.length, 0, 'local map uses icons; names remain on full map');
  const shown = new Set(info.frame.texts.map(entry => entry.text));
  const omitted = mode === 'full' ? info.markers.filter(marker => !shown.has(marker.name)).map(marker => ({
    name: marker.name, id: marker.id, reason: contains(expand(player, 2), marker.point) ? 'anchor-covered-by-player' : 'no-clear-label-and-leader',
  })) : [];
  return { icons: info.frame.icons.length, labels: info.frame.labels.length, canvas: [info.width, info.height], omitted };
}

async function checkHud(page, viewport, size, bag) {
  const mini = await page.locator('#minimap-button').boundingBox();
  assert.ok(mini && mini.x >= 0 && mini.y >= 0 && mini.x + mini.width <= viewport.width && mini.y + mini.height <= viewport.height);
  const selectors = ['#menu', '#hud', '#hint', '#touch button', ...(bag ? ['.bag-quick-hud'] : [])];
  for (const selector of selectors) for (const element of await page.locator(selector).all()) {
    if (!await element.isVisible()) continue;
    const box = await element.boundingBox();
    assert.ok(box && !overlaps(mini, box), `${size}: mini map overlaps ${selector}`);
  }
}

async function capture(browser, origin, side, name, viewport, touch, summary) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin + '/') && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.addInitScript(inspectPaint);
  try {
    await page.goto(`${origin}/?review=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__slg?.game && document.querySelector('#minimap-button')?.dataset.areaId === 'town-main' && !window.__slg.renderer.stats.fading);
    const previous = await page.evaluate(() => window.__labelPaint.counts.mini);
    await page.evaluate(async () => {
      const { LANDMARKS } = await import('/src/world/landmarks.ts');
      const { TILE } = await import('/src/core/coords.ts');
      const point = LANDMARKS.shoppingStreet;
      window.__slg.game.player = { areaId: 'town-main', x: (point.x + .5) * TILE, y: (point.y + .75) * TILE, facing: 'down' };
    });
    await page.waitForFunction(count => window.__labelPaint.counts.mini > count, previous);
    const candidate = side !== 'before', bag = side === 'bag';
    if (bag) await page.locator('.bag-quick-hud').waitFor({ state: 'visible' });
    if (candidate) await checkHud(page, viewport, name, bag);
    const miniResult = candidate ? await checkPaint(page, 'mini', name) : await page.evaluate(() => ({ icons: window.__labelPaint.mini.icons.length }));
    const miniShot = await page.screenshot({ path: path.join(outputPath, `${name}-${side}-mini.png`) });
    if (touch) await page.locator('#minimap-button').tap(); else await page.locator('#minimap-button').click();
    await page.locator('#full-map-overlay').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !!window.__labelPaint.full && document.querySelector('#full-map-canvas')?.dataset.labelCount !== undefined);
    if (bag) {
      await page.locator('.bag-quick-hud').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#btn-inventory').isDisabled(), true, `${name}: bag must be disabled while the map is open`);
    }
    const fullResult = candidate ? await checkPaint(page, 'full', name) : await page.evaluate(() => ({ icons: window.__labelPaint.full.icons.length, labels: window.__labelPaint.full.labels.length }));
    const fullShot = await page.screenshot({ path: path.join(outputPath, `${name}-${side}-full.png`) });
    const before = await page.evaluate(() => ({ ...window.__slg.game.player }));
    await page.keyboard.press('ArrowUp');
    await page.locator('#full-map-canvas').click();
    assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), before, `${name}: full map must not move player`);
    if (touch) await page.locator('#full-map-close').tap(); else await page.locator('#full-map-close').click();
    await page.locator('#full-map-overlay').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => ({ ...window.__slg.game.player })), before);
    if (candidate) {
      await page.locator('#btn-phone').click();
      await page.locator('.smartphone-overlay').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#minimap-button').disabled);
      await page.locator('#minimap-button').evaluate(button => button.click());
      assert.equal(await page.locator('#full-map-overlay').isVisible(), false, `${name}: phone and map must remain exclusive`);
      await page.keyboard.press('Escape');
      await page.locator('.smartphone-overlay').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('#minimap-button').disabled);
    }
    if (bag) {
      await page.locator('#btn-inventory').click();
      await page.locator('.bag-overlay').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#minimap-button').disabled);
      await page.locator('#minimap-button').evaluate(button => button.click());
      assert.equal(await page.locator('#full-map-overlay').isVisible(), false, `${name}: bag and map must remain exclusive`);
      await page.locator('.bag-close').click();
      await page.locator('.bag-overlay').waitFor({ state: 'hidden' });
      await page.locator('.bag-quick-hud').waitFor({ state: 'visible' });
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), '{"sentinel":"review-only"}');
    assert.equal(await page.evaluate(() => window.__labelPaint.writes), 0);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    summary.push({ side, viewport: name, mini: miniResult, full: fullResult });
    console.log(`PASS ${side}/${name}: mini and full map captured${candidate ? ', spacing and HUD checked' : ''}`);
    return { mini: miniShot, full: fullShot };
  } catch (error) {
    await page.screenshot({ path: path.join(outputPath, `${name}-${side}-failure.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

try {
  const sizes = [
    ['desktop', { width: 1280, height: 800 }, false],
    ['portrait', { width: 390, height: 844 }, true],
    ['landscape', { width: 844, height: 390 }, true],
  ];
  if (mode === 'bag') {
    const source = process.env.SLG_BAG_REPO, expected = process.env.SLG_BAG_HEAD;
    if (!source || !path.isAbsolute(source) || !expected) throw new Error('Set SLG_BAG_REPO and SLG_BAG_HEAD to the approved temporary merge');
    const sourceReal = await realpath(source), allowed = await realpath('/private/tmp/slg-audit/MightyOstwald/minimap-label-density');
    const sourceRelative = path.relative(allowed, sourceReal);
    if (!sourceRelative || sourceRelative.startsWith('..' + path.sep) || sourceRelative === '..') throw new Error('Bag merge must be in the approved temporary directory');
    const bagHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceReal, encoding: 'utf8' }).trim();
    if (bagHead !== expected) throw new Error(`Unexpected bag merge ${bagHead}`);
    if (execFileSync('git', ['status', '--porcelain'], { cwd: sourceReal, encoding: 'utf8' }).trim()) throw new Error('Temporary bag merge must be clean');
    execFileSync('git', ['merge-base', '--is-ancestor', afterRevision, bagHead], { cwd: sourceReal });
    execFileSync('git', ['merge-base', '--is-ancestor', '4bd0b9d6911ac971ebb6ec722a5561eb6fda4eb4', bagHead], { cwd: sourceReal });
    const directory = path.join(temp, 'bag'); await mkdir(directory); archive(bagHead, directory, sourceReal);
    await cp(path.join(gameDir, 'node_modules'), path.join(directory, 'game/node_modules'), { recursive: true });
    const origin = await startServer(directory, ports[0]);
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    for (const [name, viewport, touch] of sizes) await capture(browser, origin, 'bag', name, viewport, touch, summary);
    await writeFile(path.join(outputPath, 'summary.json'), JSON.stringify({ mode, afterRevision, bagHead, origin, summary }, null, 2) + '\n');
    console.log(`SUMMARY bag 3/3 PASS; 6 reference images: ${outputPath}`);
  } else {
    const directories = [path.join(temp, 'before'), path.join(temp, 'after')];
    await Promise.all(directories.map(directory => mkdir(directory)));
    archive(beforeRevision, directories[0]); archive(afterRevision, directories[1]);
    for (const directory of directories) await cp(path.join(gameDir, 'node_modules'), path.join(directory, 'game/node_modules'), { recursive: true });
    const origins = [await startServer(directories[0], ports[0]), await startServer(directories[1], ports[1])];
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
    for (const [name, viewport, touch] of sizes) {
      const before = await capture(browser, origins[0], 'before', name, viewport, touch, summary);
      const after = await capture(browser, origins[1], 'after', name, viewport, touch, summary);
      const comparison = await browser.newPage({ viewport: { width: viewport.width * 2, height: viewport.height + 36 } });
      try {
        for (const scene of ['mini', 'full']) {
          await comparison.setContent(`<style>body{margin:0;background:#243034;color:#fff;font:16px sans-serif;display:flex}section{width:50%}p{height:36px;margin:0;padding:8px;box-sizing:border-box}img{display:block;width:100%}</style><section><p>main</p><img src="data:image/png;base64,${before[scene].toString('base64')}"></section><section><p>候補</p><img src="data:image/png;base64,${after[scene].toString('base64')}"></section>`);
          await comparison.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
          await comparison.screenshot({ path: path.join(outputPath, `${name}-${scene}-comparison.png`) });
        }
      } finally { await comparison.close(); }
    }
    await browser.close(); browser = undefined;
    const regression = spawn(process.execPath, [path.join(directories[1], 'game/scripts/e2e-minimap.mjs')], {
      cwd: path.join(directories[1], 'game'), env: { ...process.env, SLG_URL: `${origins[1]}/?review=1`, NO_COLOR: '1' }, stdio: 'inherit',
    });
    const exitCode = await new Promise((resolve, reject) => { regression.once('error', reject); regression.once('exit', resolve); });
    assert.equal(exitCode, 0, 'existing minimap E2E must pass');
    await writeFile(path.join(outputPath, 'summary.json'), JSON.stringify({ mode, beforeRevision, afterRevision, origins, summary, existingMinimapE2E: 'PASS' }, null, 2) + '\n');
    console.log(`SUMMARY 6/6 PASS; existing minimap E2E PASS; 12 originals and 6 comparison images: ${outputPath}`);
  }
} catch (error) {
  await writeFile(path.join(outputPath, 'summary.json'), JSON.stringify({ mode, beforeRevision, afterRevision, summary, error: String(error) }, null, 2) + '\n');
  throw error;
} finally {
  if (browser) await browser.close();
  for (const server of servers) if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited;
  }
  await rm(temp, { recursive: true, force: true });
}
