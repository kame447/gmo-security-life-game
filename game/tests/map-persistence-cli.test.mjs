/** Real Node CLI, fixed world input, isolated temporary requests/artifacts, no browser. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { loadEvaluationWorld, temporaryDirectory, writeEvaluationArtifacts } from '../scripts/lib/persistence-evaluation.mjs';
import { sourceFingerprint } from '../src/editor-persistence/common.ts';
import { dryRunDocument } from '../src/editor-persistence/dry-run.ts';
import { evaluationDocument, sourceIdentities } from '../src/editor-persistence/map.ts';
import { buildEditorWorld } from '../src/editor/index.ts';
import { persistenceWorld } from './fixtures/persistence-world.ts';

const gameRoot = fileURLToPath(new URL('..', import.meta.url));
const command = join(gameRoot, 'scripts/map-persistence-check.mjs');
const run = (...args) => spawnSync(process.execPath, [command, ...args], { cwd: gameRoot, encoding: 'utf8', env: { ...process.env, TMPDIR: gameRoot } });
let directory, requestPath, scopePath, fingerprint, sourceBytes;
const artifacts = [];
async function sources() {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file); else if (entry.isFile()) files.push(file);
    }
  }
  await walk(join(gameRoot, 'src')); await walk(join(gameRoot, 'data'));
  files.push(join(gameRoot, 'scripts/editor.mjs'), join(gameRoot, 'package.json'), join(gameRoot, 'package-lock.json'));
  const digest = createHash('sha256');
  for (const file of files.sort()) digest.update(relative(gameRoot, file)).update(await readFile(file));
  return digest.digest('hex');
}
before(async () => {
  directory = await temporaryDirectory();
  requestPath = join(directory, 'request.json'); scopePath = join(directory, 'scope.json');
  fingerprint = await sourceFingerprint(await loadEvaluationWorld());
  await writeFile(requestPath, JSON.stringify({ schemaVersion: 1, sourceFingerprint: fingerprint, operations: [] }));
  await writeFile(scopePath, JSON.stringify({ areaIds: ['town-main'], targets: [] }));
  sourceBytes = await sources();
});
after(async () => {
  assert.equal(await sources(), sourceBytes, 'Every source/data byte and sample apply target must remain unchanged');
  await Promise.all([directory, ...artifacts].map(path => rm(path, { recursive: true, force: true })));
});

describe('map persistence evaluation CLI', () => {
  it('emits reproducible inventory JSON and an area table without writing a destination', () => {
    const json = run('inventory'); assert.equal(json.status, 0, json.stderr);
    const data = JSON.parse(json.stdout); assert.equal(data.sourceFingerprint, fingerprint);
    assert.equal(data.areas.reduce((n, a) => n + a.objects.total, 0), 312);
    const second = run('inventory'); assert.equal(second.stdout, json.stdout);
    const table = run('inventory', '--markdown'); assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout, /town-main \| 11\/0 \| 270\/0/);
  });
  it('reports raw reconstruction and strict-backend refusal as separate measurements', () => {
    const result = run('roundtrip'); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.measurementOnly, true); assert.equal(report.backendAccepted, false);
    assert.equal(report.backendIssues.length, 61); assert.equal(report.variantEqual, false);
    assert.equal(report.areas.find(a => a.areaId === 'town-main').lostDistricts, 4);
  });
  it('refuses actual source incompatibilities with exit 2 and no candidate', () => {
    const result = run('dry-run', requestPath, scopePath); assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'rejected'); assert.equal(report.checks.fingerprint, 'passed');
    assert.equal(report.checks.backend, 'failed'); assert.equal(report.candidate, undefined);
  });
  it('writes only fresh fixed-name temporary artifacts even when TMPDIR points into the source tree', async () => {
    const result = run('dry-run', requestPath, scopePath, '--write-temp'); assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout), output = report.artifactDirectory;
    artifacts.push(output);
    const systemTemporary = await realpath('/tmp');
    assert.ok(output.startsWith(systemTemporary + sep + 'slg-persistence-evaluation-'));
    assert.ok(!output.startsWith(gameRoot));
    assert.deepEqual((await readdir(output)).sort(), ['baseline.json', 'report.json']);
    assert.equal(JSON.parse(await readFile(join(output, 'report.json'), 'utf8')).status, 'rejected');
  });
  it('writes and reloads a successful fictional candidate in a temporary directory', async () => {
    const world = persistenceWorld(), baseline = evaluationDocument(world), before = baseline.objects[0];
    const report = await dryRunDocument(world, baseline, sourceIdentities(world), {
      schemaVersion: 1, sourceFingerprint: await sourceFingerprint(world), operations: [
        { type: 'move', table: 'objects', id: before.id, before, after: { ...before, x: 2 } },
      ],
    }, { areaIds: ['fixture-yard'], targets: [{ table: 'objects', id: before.id }] }, 'map');
    assert.equal(report.status, 'passed');
    const output = await writeEvaluationArtifacts(report, baseline); artifacts.push(output);
    assert.deepEqual((await readdir(output)).sort(), ['baseline.json', 'candidate.json', 'report.json']);
    const restored = buildEditorWorld(JSON.parse(await readFile(join(output, 'candidate.json'), 'utf8')));
    assert.equal(restored.areas.get('fixture-yard').objects[0].x, 2);
    assert.equal(world.areas.get('fixture-yard').objects[0].x, 3);
  });
  it('rejects stale fingerprints and refuses arbitrary output/apply arguments', async () => {
    const stale = join(directory, 'stale.json');
    await writeFile(stale, JSON.stringify({ schemaVersion: 1, sourceFingerprint: 'sha256:' + '0'.repeat(64), operations: [] }));
    const result = run('dry-run', stale, scopePath); assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).checks.fingerprint, 'failed');
    for (const args of [['apply', requestPath], ['inventory', '--out', join(gameRoot, 'src/world/town.ts')],
      ['dry-run', requestPath, scopePath, '--out', join(gameRoot, 'data/editor-prototype.json')]]) {
      assert.equal(run(...args).status, 1);
    }
  });
  it('refuses malformed/symlink input and ignores no unrecognized patch field', async () => {
    const malformed = join(directory, 'broken.json'); await writeFile(malformed, '{broken');
    assert.equal(run('dry-run', malformed, scopePath).status, 1);
    const alias = join(directory, 'alias.json'); await symlink(requestPath, alias);
    assert.equal(run('dry-run', alias, scopePath).status, 1);
    const extra = join(directory, 'extra.json');
    await writeFile(extra, JSON.stringify({ schemaVersion: 1, sourceFingerprint: fingerprint, operations: [], target: 'src/world/town.ts' }));
    const result = run('dry-run', extra, scopePath); assert.equal(result.status, 2);
    assert.ok(JSON.parse(result.stdout).issues.some(issue => issue.code === 'unknown-field'));
  });
});
