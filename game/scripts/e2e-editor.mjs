/** Run outside the Codex sandbox: a temporary game copy keeps CLI writes isolated. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'slg-editor-e2e-'));
const fixture = path.join(temp, 'game');
const port = Number(process.env.SLG_EDITOR_PORT || '5186');
const base = `http://127.0.0.1:${port}/`;
let server;
let browser;
let output = '';

async function startServer() {
  output = '';
  server = spawn(process.execPath, [path.join(gameDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
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
  const child = server;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await ended;
}
function cli(...args) {
  return execFileSync(process.execPath, [path.join(fixture, 'scripts/editor.mjs'), ...args], { cwd: fixture, encoding: 'utf8' });
}
async function text(locator) { return (await locator.textContent()) || ''; }

try {
  await cp(gameDir, fixture, { recursive: true, filter: source => {
    const relative = path.relative(gameDir, source);
    return !['node_modules', 'dist'].some(excluded => relative === excluded || relative.startsWith(`${excluded}${path.sep}`));
  } });
  await symlink(path.join(gameDir, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
  await startServer();
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());

  await page.goto(`${base}editor.html`);
  await page.waitForSelector('[data-id="demo-tree"]');
  await page.selectOption('#area-select', 'demo-room');
  assert.equal(await page.locator('[data-id="demo-exit"]').count(), 1, 'area selection');
  await page.selectOption('#area-select', 'demo-outdoor');

  await page.click('#add');
  assert.equal(await page.locator('#download').isDisabled(), true, 'unsaved form blocks export');
  const initialNew = JSON.parse(await page.locator('#entity-json').inputValue());
  await page.fill('#entity-json', JSON.stringify({ ...initialNew, id: 'demo-tree' }, null, 2));
  await page.click('#apply');
  assert.match(await text(page.locator('#validation')), /duplicate-id/, 'duplicate ID is reported');
  await page.click('#cancel-draft');
  await page.click('#add');
  await page.click('#apply');
  assert.equal(await page.locator('[data-id="new-object"]').count(), 1, 'add');
  await page.click('#delete');
  assert.equal(await page.locator('[data-id="new-object"]').count(), 0, 'delete');

  await page.locator('#grid').click({ position: { x: 2 * 38 + 19, y: 2 * 38 + 19 } });
  assert.equal(await page.locator('#position-x').inputValue(), '2', 'grid selection');
  await page.fill('#position-x', '0');
  await page.click('#apply');
  assert.match(await text(page.locator('#validation')), /overlap/, 'wall overlap is reported');
  assert.equal(await page.locator('#download').isDisabled(), true, 'invalid draft blocks export');
  await page.fill('#position-x', '99');
  await page.click('#apply');
  assert.match(await text(page.locator('#validation')), /bounds/, 'out-of-bounds is reported');
  await page.fill('#position-x', '3');
  await page.click('#apply');
  assert.equal(await page.locator('[data-operation="move"]').count(), 1, 'move diff');
  await page.locator('[data-operation="move"] summary').click();
  const diff = await text(page.locator('[data-operation="move"]'));
  assert.match(diff, /変更前/); assert.match(diff, /変更後/);
  await page.locator('#undo').focus();
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('#position-x').inputValue(), '2', 'undo shortcut');
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.locator('#position-x').inputValue(), '3', 'redo shortcut');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const changesPath = path.join(temp, 'changes.json');
  await download.saveAs(changesPath);
  const changes = JSON.parse(await readFile(changesPath, 'utf8'));
  assert.equal(changes.operations.length, 1);
  assert.equal(changes.operations[0].type, 'move');
  const samplePath = path.join(fixture, 'data/editor-prototype.json');
  const before = await readFile(samplePath, 'utf8');
  cli('preview', changesPath);
  assert.equal(await readFile(samplePath, 'utf8'), before, 'preview is read-only');
  cli('apply', changesPath);
  const after = JSON.parse(await readFile(samplePath, 'utf8'));
  const expected = structuredClone(changes.baseDocument);
  const op = changes.operations[0];
  expected[op.table][expected[op.table].findIndex(entity => entity.id === op.id)] = op.after;
  assert.deepEqual(after, expected, 'applied data matches exported change');

  await stopServer();
  await startServer();
  await page.goto(`${base}editor.html`);
  await page.locator('[data-id="demo-tree"]').click();
  assert.equal(await page.locator('#position-x').inputValue(), '3', 'reload uses applied data');
  await page.goto(`${base}editor-preview.html`);
  await page.waitForFunction(() => !!window.__slg?.game);
  const sample = await page.evaluate(() => ({
    variant: window.__slg.game.world.variant.id,
    area: window.__slg.game.player.areaId,
    treeX: window.__slg.game.world.areas.get('demo-outdoor').objects.find(item => item.id === 'demo-tree').x,
  }));
  assert.deepEqual(sample, { variant: 'editor-prototype', area: 'demo-outdoor', treeX: 3 }, 'game uses applied sample');
  await page.goto(base);
  await page.waitForFunction(() => !!window.__slg?.game);
  assert.equal(await page.evaluate(() => window.__slg.game.world.variant.id), 'childhood', 'normal game still uses its original world');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS: selection, editing, validation, undo/redo, export, CLI preview/apply, reload and sample game');
} finally {
  await browser?.close();
  await stopServer();
  if (process.env.SLG_EDITOR_KEEP) console.log(`Temporary fixture retained: ${temp}`);
  else await rm(temp, { recursive: true, force: true });
}
