/** ADR 0011 measurement only: no apply operation or caller-selected output path. */
import { auditNpcWorld, dryRunNpc, npcSourceIdentities, projectWorldForNpcAudit } from '../src/editor-npc/real-world-audit.ts';
import { sourceFingerprint } from '../src/editor-persistence/common.ts';
import { loadEvaluationWorld, readEvaluationJSON, writeEvaluationArtifacts } from './lib/persistence-evaluation.mjs';

const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
function markdownInventory(report) {
  return [
    '| area | NPC ID | name | sprite | facing | position | lines | event key | collision / lookup |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...report.rows.map(({ areaId, npc, indexedInteractionIds, solidCells }) =>
      `| ${cell(areaId)} | ${cell(npc.id)} | ${cell(npc.name)} | ${cell(npc.sprite)} | ${cell(npc.facing)} | ${npc.x},${npc.y} | ${npc.lines.length} | ${cell(npc.eventKey)} | ${solidCells.join(',')}; ${indexedInteractionIds.map(cell).join(', ')} |`),
    '', 'Source IDs are present-day identifiers, not a commitment that future generators will keep them stable.',
    'The JSON inventory also includes dialogue and object/interaction/portal overlap details.',
  ].join('\n') + '\n';
}

try {
  const [command, ...args] = process.argv.slice(2);
  const valid = (command === 'inventory' && (args.length === 0 || (args.length === 1 && args[0] === '--markdown'))) ||
    (command === 'roundtrip' && args.length === 0) ||
    (command === 'dry-run' && (args.length === 2 || (args.length === 3 && args[2] === '--write-temp')));
  if (!valid) throw new Error('Usage: node scripts/npc-persistence-check.mjs inventory [--markdown] | roundtrip | dry-run <request.json> <scope.json> [--write-temp]');
  const world = await loadEvaluationWorld();
  let output;
  if (command === 'inventory' || command === 'roundtrip') {
    const audit = auditNpcWorld(world);
    const fingerprint = await sourceFingerprint(world);
    if (command === 'inventory') {
      output = { evaluationOnly: true, sourceFingerprint: fingerprint, ...audit };
      process.stdout.write(args[0] === '--markdown' ? markdownInventory(output) : JSON.stringify(output, null, 2) + '\n');
    } else {
      output = { evaluationOnly: true, sourceFingerprint: fingerprint, byArea: audit.byArea,
        npcCount: audit.npcCount, npcRows: audit.rows.map(row => ({ areaId: row.areaId, id: row.npc.id,
          roundTripSameNpc: row.roundTripSameNpc, fieldIssues: row.fieldIssues, isolatedBackendIssues: row.isolatedBackendIssues })),
        omittedAreaDistricts: audit.omittedAreaDistricts, sourceVariant: audit.variant,
        reconstructedVariant: audit.reconstructedVariant, temporaryObjectIds: audit.temporaryObjectIds,
        fullDocumentIssues: audit.fullDocumentIssues, duplicateDocumentIds: audit.duplicateDocumentIds };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    }
  } else {
    const baseline = projectWorldForNpcAudit(world).document;
    output = await dryRunNpc(world, baseline, npcSourceIdentities(world), await readEvaluationJSON(args[0]), await readEvaluationJSON(args[1]));
    if (args[2] === '--write-temp') output = { ...output, artifactDirectory: await writeEvaluationArtifacts(output, baseline) };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (output.status !== 'passed') process.exitCode = 2;
  }
} catch (error) {
  console.error(`NPC persistence evaluation: ${error.message}`);
  process.exitCode = 1;
}
