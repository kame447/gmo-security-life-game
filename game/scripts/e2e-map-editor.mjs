/** Run outside the sandbox. Every CLI write targets an isolated copy, never the real sample. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'slg-map-editor-e2e-')));
const fixture = path.join(temp, 'game');
// The tested copy owns this port; SLG_URL may point at a separate normal-game server in CI.
const port = Number(process.env.SLG_EDITOR_PORT || '5185');
const base = `http://127.0.0.1:${port}/`;
const normalURL = process.env.SLG_URL || base;
const shots = process.env.SLG_SHOTS;
let server, browser, output = '';
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${passed}/6: ${name}`); };

async function startServer() {
  output = '';
  server = spawn(process.execPath, [path.join(gameDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; }); server.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${output}`);
    try { if (output.includes('Local:') && (await fetch(`${base}editor.html`)).ok) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start: ${output}`);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended;
}
const cli = (...args) => execFileSync(process.execPath, [path.join(fixture, 'scripts/editor.mjs'), ...args], { cwd: fixture, encoding: 'utf8' });
async function shot(page, name) { if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }); } }
async function drag(page, from, to, cancel = false) {
  await page.locator('.map-panel').scrollIntoViewIfNeeded();
  await page.locator('#map-viewport').evaluate(view => { view.scrollLeft = 0; view.scrollTop = 0; });
  const points = await page.locator('#grid').evaluate((canvas, { from, to }) => {
    const rect = canvas.getBoundingClientRect(), scale = rect.width / canvas.width;
    const point = p => ({ x: rect.left + (p.x + .5) * 38 * scale, y: rect.top + (p.y + .5) * 38 * scale });
    return { from: point(from), to: point(to) };
  }, { from, to });
  await page.mouse.move(points.from.x, points.from.y); await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 6 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(180);
}

try {
  const realSampleBefore = await readFile(path.join(gameDir, 'data/editor-prototype.json'), 'utf8');
  await cp(gameDir, fixture, { recursive: true, filter: source => {
    const relative = path.relative(gameDir, source);
    return !['node_modules', 'dist'].some(excluded => relative === excluded || relative.startsWith(`${excluded}${path.sep}`));
  } });
  await symlink(path.join(gameDir, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  const protectedFiles = ['src/world/town.ts', 'src/world/interiors.ts', 'src/world/landmarks.ts', 'src/world/tiles.ts', 'src/render/sprites.ts'];
  const protectedBefore = await Promise.all(protectedFiles.map(file => readFile(path.join(fixture, file), 'utf8')));
  await startServer();
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}editor.html`); await page.waitForSelector('[data-id="demo-tree"]');

  await page.selectOption('#map-source', 'reference');
  assert.equal(await page.locator('#grid').getAttribute('data-map-read-only'), 'true');
  assert.equal(await page.locator('#area-select option[value="town-main"]').count(), 1);
  assert.equal(await page.locator('#add').isDisabled(), true);
  assert.equal(await page.locator('#download').isDisabled(), true);
  await page.selectOption('#area-select', 'shop-konbini-interior');
  await page.locator('#entity-list [data-table="objects"]').first().click();
  assert.match(await page.locator('#reference-properties pre').innerText(), /shop-konbini-interior/);
  assert.equal(await page.locator('#entity-form').isHidden(), true);
  await page.selectOption('#area-select', 'town-main');
  await page.selectOption('#map-zoom', '0.5');
  const beforePan = await page.locator('#map-viewport').evaluate(view => { view.scrollLeft = 100; view.scrollTop = 100; return view.scrollLeft; });
  const viewBox = await page.locator('#map-viewport').boundingBox();
  const canvasBox = await page.locator('#grid').boundingBox();
  assert.ok(viewBox && canvasBox, 'the map and its canvas must have visible bounds');
  const startX = Math.max(viewBox.x + 40, Math.min(viewBox.x + viewBox.width - 40, canvasBox.x + canvasBox.width / 2));
  const startY = Math.max(viewBox.y + 40, Math.min(viewBox.y + viewBox.height - 40, canvasBox.y + canvasBox.height / 2));
  await page.keyboard.down('Shift'); await page.mouse.move(startX, startY); await page.mouse.down();
  await page.mouse.move(startX - 110, startY, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift');
  const afterPan = await page.locator('#map-viewport').evaluate(view => view.scrollLeft);
  assert.notEqual(afterPan, beforePan, 'shift-drag must pan the visible canvas');
  await page.click('#map-fit'); await shot(page, '01-map-reference-desktop');
  await page.selectOption('#map-source', 'sample');
  assert.equal(await page.locator('#area-select').inputValue(), 'demo-outdoor');
  assert.equal(await page.locator('#change-count').innerText(), '0 件');
  pass('read-only real-map selection, zoom and pan preserve sample history');

  await page.locator('[data-table="objects"][data-id="demo-tree"]').click();
  await page.selectOption('#map-zoom', '2');
  await drag(page, { x: 2, y: 2 }, { x: 3, y: 2 });
  assert.equal(await page.locator('#position-x').inputValue(), '3');
  assert.equal(await page.locator('[data-operation="move"]').count(), 1);
  await page.click('#undo'); assert.equal(await page.locator('#position-x').inputValue(), '2');
  await page.click('#redo'); assert.equal(await page.locator('#position-x').inputValue(), '3');
  await drag(page, { x: 3, y: 2 }, { x: 0, y: 2 });
  assert.match(await page.locator('#validation').innerText(), /overlap/);
  assert.equal(await page.locator('#position-x').inputValue(), '3');
  assert.equal(await page.locator('#download').isDisabled(), true);
  await page.click('#cancel-draft');
  await drag(page, { x: 3, y: 2 }, { x: 4, y: 2 }, true);
  assert.equal(await page.locator('#position-x').inputValue(), '3');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.npcPlacement = 'true'; });
  await drag(page, { x: 3, y: 2 }, { x: 4, y: 2 });
  assert.equal(await page.locator('#position-x').inputValue(), '3');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.npcPlacement = 'false'; });
  await shot(page, '02-map-drag-desktop');
  pass('scaled drag, wall rejection, Escape cancellation, NPC-mode guard and undo/redo');

  await page.locator('[data-table="facilities"][data-id="demo-house"]').click();
  await page.fill('#map-facility-x', '6'); await page.click('#apply');
  assert.equal(await page.locator('#map-facility-x').inputValue(), '6');
  await page.click('#undo'); assert.equal(await page.locator('#map-facility-x').inputValue(), '7');
  await page.click('#redo'); assert.equal(await page.locator('#map-facility-x').inputValue(), '6');
  await page.locator('[data-table="portals"][data-id="demo-enter"]').click();
  assert.equal(await page.locator('#position-x').inputValue(), '7', 'facility moved entrance');
  await page.fill('#position-x', '5'); await page.click('#apply');
  await page.fill('#map-property-to-x', '99'); await page.click('#apply');
  assert.match(await page.locator('#validation').innerText(), /bounds/);
  await page.click('#cancel-draft');
  await page.selectOption('#area-select', 'demo-room');
  await page.locator('[data-table="portals"][data-id="demo-exit"]').click();
  assert.equal(await page.locator('#map-property-to-x').inputValue(), '5', 'paired return tracks entrance movement');
  await page.fill('#map-property-to-y', '4');
  await page.selectOption('#map-source', 'reference');
  assert.equal(await page.locator('#map-source').inputValue(), 'sample', 'unfinished input blocks source switch');
  await page.click('#cancel-draft');
  pass('facility group movement, portal return fields and pending-input protection');

  await page.setViewportSize({ width: 390, height: 720 });
  await page.locator('.map-panel').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'mobile has no page-wide horizontal overflow');
  await shot(page, '03-map-mobile');
  await page.setViewportSize({ width: 1440, height: 960 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const changesPath = path.join(temp, 'changes.json'); await download.saveAs(changesPath);
  const changes = JSON.parse(await readFile(changesPath, 'utf8'));
  const expected = structuredClone(changes.baseDocument);
  for (const operation of changes.operations) {
    const table = expected[operation.table], index = table.findIndex(entity => entity.id === operation.id);
    if (operation.type === 'delete') table.splice(index, 1);
    else if (operation.type === 'add') table.push(operation.after);
    else table[index] = operation.after;
  }
  const samplePath = path.join(fixture, 'data/editor-prototype.json'), before = await readFile(samplePath, 'utf8');
  cli('preview', changesPath); assert.equal(await readFile(samplePath, 'utf8'), before);
  cli('apply', changesPath); cli('validate');
  assert.deepEqual(JSON.parse(await readFile(samplePath, 'utf8')), expected);
  assert.deepEqual(await Promise.all(protectedFiles.map(file => readFile(path.join(fixture, file), 'utf8'))), protectedBefore);
  assert.equal(await readFile(path.join(gameDir, 'data/editor-prototype.json'), 'utf8'), realSampleBefore);
  pass('mobile layout and export → CLI preview/apply preserve unrelated source');

  await stopServer(); await startServer();
  await page.goto(`${base}editor.html`); await page.locator('[data-id="demo-tree"]').click();
  assert.equal(await page.locator('#position-x').inputValue(), '3');
  await page.locator('[data-id="demo-house"]').click(); assert.equal(await page.locator('#map-facility-x').inputValue(), '6');
  await page.goto(`${base}editor-preview.html`); await page.waitForFunction(() => !!window.__slg?.game);
  const reloaded = await page.evaluate(() => {
    const world = window.__slg.game.world;
    return { variant: world.variant.id, tree: world.areas.get('demo-outdoor').objects.find(o => o.id === 'demo-tree').x,
      entrance: world.areas.get('demo-outdoor').def.portals.find(p => p.id === 'demo-enter').from.x,
      returning: world.areas.get('demo-room').def.portals.find(p => p.id === 'demo-exit').to.x };
  });
  assert.deepEqual(reloaded, { variant: 'editor-prototype', tree: 3, entrance: 5, returning: 5 });
  pass('restarted GUI and sample Game use exactly the applied geometry');

  await page.goto(normalURL); await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.evaluate(() => window.__slg.game.world.variant.id), 'childhood');
  assert.deepEqual(errors, []);
  pass('normal game remains unchanged; no browser exceptions');
  console.log(`SUMMARY ${passed}/6 PASS`);
} finally {
  await browser?.close(); await stopServer();
  if (process.env.SLG_MAP_EDITOR_KEEP) console.log(`Temporary fixture retained: ${temp}`);
  else await rm(temp, { recursive: true, force: true });
}
