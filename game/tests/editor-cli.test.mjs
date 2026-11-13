// Node integration tests run the real CLI in an isolated copy; no @types/node dependency.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyChangeSet, buildEditorWorld, diffDocuments, loadChangeSet, loadDocument, serializeChangeSet, serializeDocument } from '../src/editor/index.ts';

const source = fileURLToPath(new URL('..', import.meta.url));
let directory, target, original, patchPath;
const run = (...args) => spawnSync(process.execPath, [join(directory, 'scripts/editor.mjs'), ...args], { cwd: directory, encoding: 'utf8' });
const data = () => loadDocument(readFileSync(target, 'utf8'));
const success = result => assert.equal(result.status, 0, result.stderr);
const unchanged = () => {
  assert.equal(readFileSync(target, 'utf8'), original);
  assert.deepEqual(readdirSync(join(directory, 'data')), ['editor-prototype.json']);
};
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'slg-editor-cli-'));
  for (const part of ['src/editor', 'src/world', 'scripts', 'data']) mkdirSync(join(directory, part), { recursive: true });
  cpSync(join(source, 'src/editor'), join(directory, 'src/editor'), { recursive: true });
  cpSync(join(source, 'src/world/tiles.ts'), join(directory, 'src/world/tiles.ts'));
  cpSync(join(source, 'scripts/editor.mjs'), join(directory, 'scripts/editor.mjs'));
  target = join(directory, 'data/editor-prototype.json');
  original = readFileSync(join(source, 'data/editor-prototype.json'), 'utf8');
  writeFileSync(target, original);
  patchPath = join(directory, 'changes.json');
  writeFileSync(patchPath, readFileSync(join(source, 'examples/editor-move-npc.json'), 'utf8'));
});
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

describe('editor JSON apply command', () => {
  it('exports, previews, applies and reloads matching runtime data; no other source is changed', () => {
    const before = data(), expected = structuredClone(before); expected.interactions[0].x = 5;
    writeFileSync(join(directory, 'candidate.json'), serializeDocument(expected));
    writeFileSync(join(directory, 'src/world/town.ts'), '// hand-written source\n');
    success(run('validate'));
    const exported = run('diff', join(directory, 'candidate.json')); success(exported);
    assert.equal(exported.stdout, serializeChangeSet(diffDocuments(before, expected)));
    writeFileSync(patchPath, exported.stdout);
    const preview = run('preview', patchPath); success(preview);
    const shown = JSON.parse(preview.stdout);
    assert.equal(shown.target, 'game/data/editor-prototype.json');
    assert.deepEqual(shown.summary, ['move interactions/demo-npc']);
    assert.deepEqual(shown.after, expected);
    unchanged();
    success(run('apply', patchPath));
    assert.deepEqual(data(), expected);
    assert.deepEqual(data(), applyChangeSet(before, loadChangeSet(exported.stdout)));
    const world = buildEditorWorld(data());
    assert.equal(world.areas.get('demo-outdoor').interactions[0].x, 5);
    success(run('validate'));
    assert.equal(readFileSync(join(directory, 'src/world/town.ts'), 'utf8'), '// hand-written source\n');
    assert.deepEqual(readdirSync(join(directory, 'data')), ['editor-prototype.json']);
  });
  it('rejects stale/replayed changes and preserves exact file bytes on rejection', () => {
    const manual = data(); manual.areas[0].name = 'manual source edit';
    const bytes = serializeDocument(manual); writeFileSync(target, bytes);
    const result = run('apply', patchPath);
    assert.equal(result.status, 1); assert.match(result.stderr, /Source data changed/);
    assert.equal(readFileSync(target, 'utf8'), bytes);
    writeFileSync(target, original);
    success(run('apply', patchPath));
    const applied = readFileSync(target, 'utf8');
    assert.equal(run('apply', patchPath).status, 1);
    assert.equal(readFileSync(target, 'utf8'), applied);
    assert.deepEqual(readdirSync(join(directory, 'data')), ['editor-prototype.json']);
  });
  for (const kind of ['invalid-id', 'bounds', 'reference', 'unknown-command', 'extra-target', 'bad-json']) {
    it(`refuses ${kind} before any persistent write`, () => {
      const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
      if (kind === 'invalid-id') patch.operations[0].id = '../world/town.ts';
      if (kind === 'bounds') patch.operations[0].after.x = 999;
      if (kind === 'reference') { patch.operations[0].type = 'update'; patch.operations[0].after.eventKey = 'missing.event'; }
      if (kind === 'unknown-command') patch.operations[0].type = 'eval';
      if (kind === 'extra-target') patch.target = 'src/world/town.ts';
      writeFileSync(patchPath, kind === 'bad-json' ? '{broken' : JSON.stringify(patch));
      assert.equal(run('apply', patchPath).status, 1);
      unchanged();
    });
  }
  it('does not partially apply a valid operation followed by an invalid operation', () => {
    const patch = JSON.parse(readFileSync(patchPath, 'utf8')), changed = patch.operations[0].after;
    patch.operations.push({ type: 'update', table: 'interactions', id: changed.id, before: changed, after: { ...changed, eventKey: 'missing.event' } });
    writeFileSync(patchPath, JSON.stringify(patch));
    assert.equal(run('apply', patchPath).status, 1);
    unchanged();
  });
  it('honors an existing apply lock without deleting it', () => {
    writeFileSync(`${target}.lock`, 'other writer');
    const result = run('apply', patchPath);
    assert.equal(result.status, 1); assert.match(result.stderr, /data lock/);
    assert.equal(readFileSync(target, 'utf8'), original);
    assert.equal(readFileSync(`${target}.lock`, 'utf8'), 'other writer');
  });
  it('refuses a symlink target without touching the linked file', () => {
    const outside = join(directory, 'manual.json'); writeFileSync(outside, original);
    unlinkSync(target); symlinkSync(outside, target);
    const result = run('apply', patchPath);
    assert.equal(result.status, 1); assert.match(result.stderr, /symlink/);
    assert.equal(readFileSync(outside, 'utf8'), original);
  });
  it('refuses a symlink data directory', () => {
    const dir = join(directory, 'data'), moved = join(directory, 'manual-data');
    renameSync(dir, moved); symlinkSync(moved, dir);
    const result = run('apply', patchPath);
    assert.equal(result.status, 1); assert.match(result.stderr, /symlink/);
    assert.equal(readFileSync(join(moved, 'editor-prototype.json'), 'utf8'), original);
  });
  it('rejects CLI output-target overrides and leaves no-op applies byte-identical', () => {
    assert.equal(run('apply', patchPath, '--target', 'src/world/town.ts').status, 1);
    const d = data(); writeFileSync(patchPath, serializeChangeSet(diffDocuments(d, d)));
    const result = run('apply', patchPath); success(result); assert.match(result.stdout, /No data changes/);
    unchanged();
  });
});
