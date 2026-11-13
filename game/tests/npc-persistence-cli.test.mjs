/** Real CLI against read-only generated World; all request/artifact files are temporary. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadEvaluationWorld, temporaryDirectory, writeEvaluationArtifacts } from '../scripts/lib/persistence-evaluation.mjs';
import { sourceFingerprint } from '../src/editor-persistence/common.ts';
import { dryRunNpc, npcSourceIdentities } from '../src/editor-npc/real-world-audit.ts';
import { buildEditorWorld, parseDocument } from '../src/editor/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'scripts/npc-persistence-check.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args],
  { cwd: root, encoding: 'utf8', env: { ...process.env, TMPDIR: root } });
let temporary, requestPath, scopePath, fingerprint, sourceDigest;
const artifacts = [];
async function digestSource() {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file); else if (entry.isFile()) files.push(file);
    }
  }
  await visit(join(root, 'src')); await visit(join(root, 'data'));
  files.push(join(root, 'scripts/editor.mjs'), join(root, 'package.json'), join(root, 'package-lock.json'));
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(relative(root, file)).update(await readFile(file));
  return hash.digest('hex');
}
before(async () => {
  temporary = await temporaryDirectory();
  requestPath = join(temporary, 'request.json'); scopePath = join(temporary, 'scope.json');
  fingerprint = await sourceFingerprint(await loadEvaluationWorld());
  await writeFile(requestPath, JSON.stringify({ schemaVersion: 1, sourceFingerprint: fingerprint, operations: [] }));
  await writeFile(scopePath, JSON.stringify({ areaIds: ['town-main'], targets: [] }));
  sourceDigest = await digestSource();
});
after(async () => {
  try { assert.equal(await digestSource(), sourceDigest, 'Source and fixed sample apply target remain unchanged'); }
  finally { await Promise.all([temporary, ...artifacts].filter(Boolean).map(path => rm(path, { recursive: true, force: true }))); }
});

describe('NPC persistence evaluation CLI', () => {
  it('lists real NPCs and their relationships reproducibly', () => {
    const result = run('inventory'); assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.sourceFingerprint, fingerprint); assert.equal(inventory.npcCount, 10);
    assert.deepEqual(inventory.byArea.map(area => area.npcCount), [6, 1, 2, 1]);
    assert.ok(inventory.rows.every(row => row.indexedInteractionIds[0] === row.npc.id));
    assert.equal(run('inventory').stdout, result.stdout);
    const table = run('inventory', '--markdown'); assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /shop-konbini-interior \| konbini-clerk/);
  });
  it('distinguishes the raw round trip from full backend acceptance', () => {
    const result = run('roundtrip'); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.evaluationOnly, true);
    assert.ok(report.npcRows.every(row => row.roundTripSameNpc && row.fieldIssues.length === 0 && row.isolatedBackendIssues.length === 0));
    assert.deepEqual(report.omittedAreaDistricts, ['town-main']);
    assert.notDeepEqual(report.sourceVariant, report.reconstructedVariant);
    assert.equal(report.fullDocumentIssues.length, 61);
  });
  it('rejects a valid request when the existing generated document fails backend shape checks', () => {
    const result = run('dry-run', requestPath, scopePath); assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.domain, 'npc'); assert.equal(report.checks.fingerprint, 'passed');
    assert.equal(report.checks.backend, 'failed'); assert.equal(report.candidate, undefined);
  });
  it('writes only fixed filenames under fresh /tmp even with an unsafe TMPDIR', async () => {
    const result = run('dry-run', requestPath, scopePath, '--write-temp'); assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout), output = report.artifactDirectory; artifacts.push(output);
    assert.ok(output.startsWith(await realpath('/tmp') + sep + 'slg-persistence-evaluation-'));
    assert.deepEqual((await readdir(output)).sort(), ['baseline.json', 'report.json']);
    assert.equal(JSON.parse(await readFile(join(output, 'report.json'), 'utf8')).status, 'rejected');
  });
  it('saves and reloads a successful fictional NPC candidate only as a temporary artifact', async () => {
    const baseline = parseDocument(JSON.parse(await readFile(join(root, 'data/editor-prototype.json'), 'utf8')));
    const world = buildEditorWorld(baseline), npc = baseline.interactions.find(row => row.kind === 'npc');
    const request = { schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world), operations: [
      { type: 'update', table: 'interactions', id: npc.id, before: npc, after: { ...npc, name: '評価用' } },
    ] };
    const report = await dryRunNpc(world, baseline, npcSourceIdentities(world), request,
      { areaIds: [npc.areaId], targets: [{ table: 'interactions', id: npc.id }] });
    assert.equal(report.status, 'passed');
    const output = await writeEvaluationArtifacts(report, baseline); artifacts.push(output);
    assert.deepEqual((await readdir(output)).sort(), ['baseline.json', 'candidate.json', 'report.json']);
    const restored = buildEditorWorld(JSON.parse(await readFile(join(output, 'candidate.json'), 'utf8')));
    assert.equal(restored.areas.get(npc.areaId).interactions.find(row => row.id === npc.id).name, '評価用');
    assert.equal(world.areas.get(npc.areaId).interactions.find(row => row.id === npc.id).name, npc.name);
  });
  it('rejects stale fingerprints, arbitrary destinations, malformed files and symlinks', async () => {
    const stale = join(temporary, 'stale.json');
    await writeFile(stale, JSON.stringify({ schemaVersion: 1, sourceFingerprint: 'sha256:' + '0'.repeat(64), operations: [] }));
    const result = run('dry-run', stale, scopePath); assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).checks.fingerprint, 'failed');
    for (const args of [['apply', requestPath], ['inventory', '--out', join(root, 'src/world/town.ts')],
      ['dry-run', requestPath, scopePath, '--out', join(root, 'data/editor-prototype.json')]]) assert.equal(run(...args).status, 1);
    const malformed = join(temporary, 'broken.json'); await writeFile(malformed, '{broken');
    assert.equal(run('dry-run', malformed, scopePath).status, 1);
    const alias = join(temporary, 'alias.json'); await symlink(requestPath, alias);
    assert.equal(run('dry-run', alias, scopePath).status, 1);
  });
});
