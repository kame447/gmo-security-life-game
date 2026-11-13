/** Run outside the Codex sandbox; CLI apply is restricted to a temporary sample copy. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const gameDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'slg-npc-editor-e2e-')));
const fixture = path.join(temp, 'game');
const port = Number(process.env.SLG_EDITOR_PORT || '5183');
const base = `http://127.0.0.1:${port}/`;
let server, browser, output = '';

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
  const child = server, ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM'); await ended;
}
function cli(...args) { return execFileSync(process.execPath, [path.join(fixture, 'scripts/editor.mjs'), ...args], { cwd: fixture, encoding: 'utf8' }); }
async function grid(page, x, y) { await page.locator('#grid').click({ position: { x: x * 38 + 19, y: y * 38 + 19 } }); }

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
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}editor.html`);
  await page.waitForSelector('[data-id="demo-npc"]');

  await page.selectOption('#add-type', 'interactions');
  await page.click('#add');
  const generic = JSON.parse(await page.locator('#entity-json').inputValue());
  await page.fill('#entity-json', JSON.stringify({ ...generic, kind: 'npc', sprite: 'friend', lines: [] }, null, 2));
  await page.click('#apply');
  assert.match(await page.locator('#validation').innerText(), /required/, 'generic JSON cannot bypass NPC dialogue validation');
  assert.equal(await page.locator('#npc-id').inputValue(), '', 'generic template does not silently assign an NPC ID');
  await page.click('#npc-cancel');

  await grid(page, 4, 4);
  assert.equal(await page.locator('#npc-form').isVisible(), true, 'grid selects NPC');
  assert.equal(await page.locator('#npc-id').inputValue(), 'demo-npc');
  assert.equal(await page.locator('#npc-id').isDisabled(), true, 'existing ID is stable');
  assert.equal(await page.locator('#npc-sprite').inputValue(), 'friend');
  const hasPixels = await page.locator('#npc-preview').evaluate(canvas => {
    const ctx = canvas.getContext('2d'); return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data].some((v, i) => i % 4 === 3 && v > 0);
  });
  assert.equal(hasPixels, true, 'sprite preview is drawn');
  await page.fill('#npc-lines', '');
  await page.click('#npc-apply');
  assert.match(await page.locator('#validation').innerText(), /required/, 'empty dialogue is rejected');
  await page.fill('#npc-name', '編集後のサンプル');
  await page.fill('#npc-lines', 'テストの会話');
  await page.selectOption('#npc-facing', 'left');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.mapReadOnly = 'true'; });
  await page.click('#npc-place');
  assert.equal(await page.locator('#grid').getAttribute('data-npc-placement'), 'false', 'read-only map blocks starting placement');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.mapReadOnly = 'false'; });
  // The click above updates the disabled state; trigger a normal re-render after leaving reference mode.
  await page.locator('[data-id="demo-tree"]').click();
  await page.click('#npc-place');
  assert.equal(await page.locator('#grid').getAttribute('data-npc-placement'), 'true');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.mapReadOnly = 'true'; });
  await grid(page, 5, 4);
  assert.equal(await page.locator('#npc-x').inputValue(), '4', 'read-only map blocks confirming placement');
  assert.equal(await page.locator('#grid').getAttribute('data-npc-placement'), 'false');
  await page.locator('#grid').evaluate(canvas => { canvas.dataset.mapReadOnly = 'false'; });
  await page.locator('[data-id="demo-tree"]').click();
  await page.click('#npc-place');
  await grid(page, 5, 4);
  assert.equal(await page.locator('#grid').getAttribute('data-npc-placement'), 'false');
  assert.equal(await page.locator('#npc-x').inputValue(), '5');
  await page.locator('[data-id="demo-tree"]').click();
  assert.match(await page.locator('#status').innerText(), /未反映/, 'selection preserves draft');
  assert.equal(await page.locator('#npc-name').inputValue(), '編集後のサンプル');
  assert.equal(await page.locator('#download').isDisabled(), true);
  await page.click('#npc-apply');
  assert.equal(await page.locator('[data-operation="update"]').count(), 1);
  await page.click('#undo');
  assert.equal(await page.locator('#npc-x').inputValue(), '4');
  assert.equal(await page.locator('#npc-name').inputValue(), '編集確認NPC');
  await page.click('#redo');
  assert.equal(await page.locator('#npc-x').inputValue(), '5');
  console.log('PASS existing NPC selection, preview, validation, placement, draft protection and undo/redo');

  await page.click('#npc-add');
  assert.equal(await page.locator('#npc-id').inputValue(), '', 'new ID is entered by the user');
  await page.fill('#npc-id', 'demo-visitor');
  await page.fill('#npc-name', '追加サンプル');
  await page.fill('#npc-lines', '仮の会話');
  await page.click('#npc-place'); await grid(page, 6, 4);
  await page.click('#npc-apply');
  assert.equal(await page.locator('[data-id="demo-visitor"]').count(), 1);
  await page.click('#npc-delete');
  assert.equal(await page.locator('[data-id="demo-visitor"]').count(), 0);
  await page.click('#undo');
  assert.equal(await page.locator('[data-id="demo-visitor"]').count(), 1);
  await page.click('#redo');
  assert.equal(await page.locator('[data-id="demo-visitor"]').count(), 0);
  await page.click('#undo');
  console.log('PASS NPC creation, deletion and shared undo/redo');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const patch = path.join(temp, 'changes.json'); await download.saveAs(patch);
  const changes = JSON.parse(await readFile(patch, 'utf8'));
  assert.ok(changes.operations.some(op => op.id === 'demo-npc' && op.type === 'update'));
  assert.ok(changes.operations.some(op => op.id === 'demo-visitor' && op.type === 'add'));
  const target = path.join(fixture, 'data/editor-prototype.json');
  const original = await readFile(target, 'utf8');
  cli('preview', patch);
  assert.equal(await readFile(target, 'utf8'), original, 'preview does not write');
  cli('apply', patch);
  const applied = JSON.parse(await readFile(target, 'utf8'));
  const edited = applied.interactions.find(item => item.id === 'demo-npc');
  assert.deepEqual({ name: edited.name, x: edited.x, y: edited.y, eventKey: edited.eventKey },
    { name: '編集後のサンプル', x: 5, y: 4, eventKey: 'demo.greeting' });
  // Disconnect the Vite client before restarting; otherwise its HMR reconnect logs an expected error.
  await page.goto('about:blank');
  await stopServer(); await startServer();
  await page.goto(`${base}editor.html`);
  await page.locator('[data-id="demo-npc"]').click();
  assert.equal(await page.locator('#npc-name').inputValue(), '編集後のサンプル');
  assert.equal(await page.locator('#npc-x').inputValue(), '5');
  assert.equal(await page.locator('#npc-event').inputValue(), 'demo.greeting');
  await page.goto(`${base}editor-preview.html`);
  await page.waitForFunction(() => !!window.__slg?.game);
  const runtime = await page.evaluate(() => {
    const game = window.__slg.game, events = [];
    game.on(event => events.push(event));
    game.player = { areaId: 'demo-outdoor', x: 5 * 16 + 8, y: 5 * 16 + 14, facing: 'up' };
    game.action();
    return { event: events.find(event => event.type === 'interact'), dialog: game.dialog };
  });
  assert.equal(runtime.event?.eventKey, 'demo.greeting');
  assert.equal(runtime.dialog?.speaker, '編集後のサンプル');
  assert.deepEqual(runtime.dialog?.lines, ['テストの会話']);
  assert.deepEqual(errors, [], 'no page or console errors');
  console.log('PASS export, CLI apply, reload and runtime NPC interaction');
  console.log('SUMMARY npc editor E2E PASS');
} finally {
  await browser?.close(); await stopServer();
  if (process.env.SLG_EDITOR_KEEP) console.log(`Temporary fixture retained: ${temp}`);
  else await rm(temp, { recursive: true, force: true });
}
