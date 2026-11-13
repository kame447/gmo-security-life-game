// Exercise the real fixed-target CLI on a temporary sample copy, never on repository data.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { EditorSession, loadDocument, serializeChangeSet } from '../src/editor/index.ts';
import { NpcEditor } from '../src/editor-npc/index.ts';

it('applies NPC model changes through the real CLI and reloads the edited sample', () => {
  const source = fileURLToPath(new URL('..', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'slg-npc-cli-'));
  try {
    for (const part of ['src/editor', 'src/world', 'scripts', 'data']) mkdirSync(join(directory, part), { recursive: true });
    cpSync(join(source, 'src/editor'), join(directory, 'src/editor'), { recursive: true });
    cpSync(join(source, 'src/world/tiles.ts'), join(directory, 'src/world/tiles.ts'));
    cpSync(join(source, 'scripts/editor.mjs'), join(directory, 'scripts/editor.mjs'));
    const target = join(directory, 'data/editor-prototype.json');
    const original = readFileSync(join(source, 'data/editor-prototype.json'), 'utf8');
    writeFileSync(target, original);
    const session = new EditorSession(loadDocument(original)), editor = new NpcEditor(session);
    editor.move('demo-npc', { areaId: 'demo-outdoor', x: 5, y: 4 });
    editor.update('demo-npc', { name: '適用後のサンプル', eventKey: 'demo.greeting', lines: ['適用の確認'] });
    const patchPath = join(directory, 'changes.json');
    writeFileSync(patchPath, serializeChangeSet(session.exportChanges()));
    const run = (...args) => spawnSync(process.execPath, [join(directory, 'scripts/editor.mjs'), ...args], { cwd: directory, encoding: 'utf8' });
    const preview = run('preview', patchPath);
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout).after, session.document);
    assert.equal(readFileSync(target, 'utf8'), original);
    const applied = run('apply', patchPath);
    assert.equal(applied.status, 0, applied.stderr);
    const reloaded = loadDocument(readFileSync(target, 'utf8'));
    assert.deepEqual(reloaded, session.document);
    assert.deepEqual(reloaded.interactions.find(item => item.id === 'demo-npc'), editor.select('demo-npc'));
    assert.equal(reloaded.interactions.find(item => item.id === 'demo-npc').eventKey, 'demo.greeting');
    assert.deepEqual(readdirSync(join(directory, 'data')), ['editor-prototype.json']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
