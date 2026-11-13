/** ADR 0009 measurement only. This command cannot apply data to the game or select an output path. */
import { evaluationDocument, inventoryMap, roundTripMap, sourceIdentities } from '../src/editor-persistence/map.ts';
import { sourceFingerprint } from '../src/editor-persistence/common.ts';
import { dryRunDocument } from '../src/editor-persistence/dry-run.ts';
import { loadEvaluationWorld, readEvaluationJSON, writeEvaluationArtifacts } from './lib/persistence-evaluation.mjs';

function markdownInventory(report) {
  const counts = value => `${value.sourceId}/${value.auxiliary}`;
  return [
    '| area | facilities | objects | decals (subset) | portals | solid objects | solid interactions | ground solid cells | runtime solid cells |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.areas.map(area => `| ${area.areaId} | ${counts(area.facilities)} | ${counts(area.objects)} | ${counts(area.decals)} | ${counts(area.portals)} | ${counts(area.solidObjects)} | ${counts(area.solidInteractions)} | ${counts(area.groundSolidCells)} | ${counts(area.runtimeSolidCells)} |`),
    '', 'Counts are source-ID / auxiliary-address. Decals and collision subsets overlap objects.',
    'Explicit source IDs do not prove ownership across future generator changes.',
  ].join('\n') + '\n';
}

try {
  const [command, ...args] = process.argv.slice(2);
  const valid = (command === 'inventory' && (args.length === 0 || (args.length === 1 && args[0] === '--markdown'))) ||
    (command === 'roundtrip' && args.length === 0) ||
    (command === 'dry-run' && (args.length === 2 || (args.length === 3 && args[2] === '--write-temp')));
  if (!valid) throw new Error('Usage: node scripts/map-persistence-check.mjs inventory [--markdown] | roundtrip | dry-run <request.json> <scope.json> [--write-temp]');
  const world = await loadEvaluationWorld();
  let output;
  if (command === 'inventory') {
    output = { ...inventoryMap(world), sourceFingerprint: await sourceFingerprint(world) };
    if (args[0] === '--markdown') { process.stdout.write(markdownInventory(output)); process.exitCode = 0; }
    else process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else if (command === 'roundtrip') {
    output = { ...roundTripMap(world), sourceFingerprint: await sourceFingerprint(world) };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } else {
    const baseline = evaluationDocument(world);
    output = await dryRunDocument(world, baseline, sourceIdentities(world), await readEvaluationJSON(args[0]), await readEvaluationJSON(args[1]), 'map');
    if (args[2] === '--write-temp') output = { ...output, artifactDirectory: await writeEvaluationArtifacts(output, baseline) };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (output.status !== 'passed') process.exitCode = 2;
  }
} catch (error) {
  console.error(`Map persistence evaluation: ${error.message}`);
  process.exitCode = 1;
}
