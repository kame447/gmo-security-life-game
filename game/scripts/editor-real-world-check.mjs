/** Verify trusted real-world snapshots in disposable archives. This does not edit generated TS. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(gameRoot, '..');
const output = mkdtempSync(join(tmpdir(), 'slg-editor-real-world-'));
const revisions = [
  { name: 'main', commit: 'ee756d5', strictIssues: 4 },
  { name: 'station', commit: '7fe30ce8e40b34c29ed530deaca8d41013126903', strictIssues: 5 },
];
const editorFiles = ['schema.ts', 'types.ts', 'runtime.ts', 'changes.ts'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const summarize = issues => issues.reduce((out, item) => (out[item.code] = (out[item.code] ?? 0) + 1, out), {});
const evidence = { output, method: 'trusted API and temporary JSON files; no generated TypeScript, GUI, or ordinary CLI target is modified', revisions: [] };

for (const revision of revisions) {
  const root = join(output, revision.name); mkdirSync(root);
  const archive = execFileSync('git', ['archive', revision.commit, 'game'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  const extraction = spawnSync('tar', ['-x', '-C', root], { input: archive, encoding: 'utf8' });
  if (extraction.error) throw extraction.error;
  assert.equal(extraction.status, 0, extraction.stderr);
  const targetGame = join(root, 'game');
  for (const file of editorFiles) copyFileSync(join(gameRoot, 'src/editor', file), join(targetGame, 'src/editor', file));
  const server = await createServer({ root: targetGame, configFile: false, logLevel: 'silent',
    cacheDir: join(root, 'vite-cache'), server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const source = await server.ssrLoadModule('/src/world/index.ts');
    const editor = await server.ssrLoadModule('/src/editor/index.ts');
    const runtime = await server.ssrLoadModule('/src/editor/runtime.ts');
    const world = source.buildWorld();
    const railLinks = revision.name === 'station' ? (await server.ssrLoadModule('/src/travel/network.ts')).TRAIN_NETWORK.railLinks() : [];
    const sourceIssues = revision.name === 'station' ? source.validateWorld(world, { railLinks }) : source.validateWorld(world);
    assert.deepEqual(sourceIssues, [], 'The unedited source World must pass its own validator');
    const context = { baselineWorld: world, railLinks };
    const unique = values => [...new Set(values.filter(value => typeof value === 'string'))].sort();
    const scene = { areas: [], facilities: [...world.facilities.values()].map(f => ({ ...f })), objects: [], interactions: [], portals: [] };
    for (const { def } of world.areas.values()) {
      const { objects, interactions, portals, ground, ...area } = def;
      scene.areas.push({ ...structuredClone(area), ground: Array.from(ground) });
      for (const object of objects) {
        assert.ok(object.id, `Missing stable object ID in ${def.id}`);
        scene.objects.push({ ...object, areaId: def.id });
      }
      scene.interactions.push(...interactions.map(i => ({ ...i, areaId: def.id, lines: [...i.lines] })));
      scene.portals.push(...portals.map(p => ({ ...p, areaId: def.id, from: { ...p.from }, to: { ...p.to } })));
    }
    // Only add an editor-side link when the actual solid object exactly matches an interaction.
    for (const interaction of scene.interactions.filter(i => i.kind !== 'npc')) {
      const matches = scene.objects.filter(o => o.solid && o.areaId === interaction.areaId && o.x === interaction.x && o.y === interaction.y &&
        o.w === (interaction.w ?? 1) && o.h === (interaction.h ?? 1));
      if (matches.length === 1) interaction.objectId = matches[0].id;
    }
    const document = { schemaVersion: 1, id: world.variant.id, tileSize: 16, start: { ...world.start }, variant: structuredClone(world.variant),
      catalogs: { sprites: unique(scene.interactions.map(i => i.sprite)), eventKeys: unique(scene.interactions.map(i => i.eventKey)) }, ...scene };
    const strict = editor.validateDocument(document), trusted = editor.validateDocument(document, context);
    assert.equal(strict.length, revision.strictIssues, 'Report strict failures without hiding them');
    assert.deepEqual(trusted, [], 'Trusted source context must pass all checks');
    const base = editor.parseDocument(document, context);
    for (const object of scene.objects) assert.equal(base.objects.find(o => o.id === object.id)?.style, object.style, `style ${object.id}`);
    for (const facility of scene.facilities) assert.equal(base.facilities.find(f => f.id === facility.id)?.kind, facility.kind, `kind ${facility.id}`);
    const rebuilt = runtime.assembleEditorWorld(base);
    assert.deepEqual(rebuilt.variant, world.variant);
    for (const [id, area] of world.areas) {
      assert.deepEqual(rebuilt.areas.get(id).def.districts, area.def.districts, `districts ${id}`);
      assert.deepEqual(rebuilt.areas.get(id).ground, area.ground, `ground ${id}`);
      assert.deepEqual(rebuilt.areas.get(id).solid, area.solid, `collision ${id}`);
    }

    const target = join(root, 'document.json'), patchFile = join(root, 'changes.json');
    assert.equal(existsSync(target), false);
    writeFileSync(target, editor.serializeDocument(base, context));
    const originalBytes = readFileSync(target), originalHash = sha(originalBytes);
    const noOp = editor.diffDocuments(base, base, context);
    assert.equal(noOp.operations.length, 0);
    const noOpLoaded = editor.loadChangeSet(editor.serializeChangeSet(noOp, context), context);
    const noOpPreview = editor.previewChangeSet(base, noOpLoaded, context);
    assert.deepEqual(noOpPreview.document, base);
    assert.deepEqual(editor.applyChangeSet(base, noOpLoaded, context), base);
    assert.equal(sha(readFileSync(target)), originalHash, 'No-op preview/apply must leave the file unchanged');
    const noOpReloaded = editor.loadDocument(readFileSync(target, 'utf8'), context);
    assert.equal(editor.diffDocuments(base, noOpReloaded, context).operations.length, 0, 'No-op reload must have no diff');

    // A real facility: move the building together with the outdoor entrance and return.
    const candidate = structuredClone(base);
    const house = candidate.objects.find(o => o.id === 'town-house-32-27');
    const enter = candidate.portals.find(p => p.id === 'home-enter');
    const exit = candidate.portals.find(p => p.id === 'home-exit');
    assert.ok(house && enter && exit);
    const indoorEntrance = structuredClone(enter.to), indoorExit = structuredClone(exit.from);
    house.x++; enter.from.x++; exit.to.x++;
    assert.deepEqual(editor.validateDocument(candidate, context), []);
    const changes = editor.diffDocuments(base, candidate, context);
    assert.deepEqual(changes.operations.map(o => o.id).sort(), ['home-enter', 'home-exit', 'town-house-32-27']);
    writeFileSync(patchFile, editor.serializeChangeSet(changes, context));
    const reloadedChanges = editor.loadChangeSet(readFileSync(patchFile, 'utf8'), context);
    const preview = editor.previewChangeSet(editor.loadDocument(readFileSync(target, 'utf8'), context), reloadedChanges, context);
    assert.equal(sha(readFileSync(target)), originalHash, 'Preview must not write the document');
    assert.deepEqual(preview.document, editor.parseDocument(candidate, context));
    const applied = editor.applyChangeSet(editor.loadDocument(readFileSync(target, 'utf8'), context), reloadedChanges, context);
    writeFileSync(target, editor.serializeDocument(applied, context));
    const reloaded = editor.loadDocument(readFileSync(target, 'utf8'), context);
    assert.equal(editor.diffDocuments(reloaded, candidate, context).operations.length, 0);
    assert.deepEqual(reloaded.portals.find(p => p.id === 'home-enter').to, indoorEntrance);
    assert.deepEqual(reloaded.portals.find(p => p.id === 'home-exit').from, indoorExit);
    const { Game } = await server.ssrLoadModule('/src/session/game.ts');
    const game = new Game(runtime.assembleEditorWorld(reloaded));
    const feetTile = () => ({ x: Math.floor(game.player.x / 16), y: Math.floor((game.player.y - 4) / 16) });
    const walk = goal => {
      const areaId = game.player.areaId, route = source.findPath(game.area, feetTile(), goal);
      assert.ok(route, `No game path to ${JSON.stringify(goal)}`);
      for (let n = 1; n < route.length; n++) {
        const a = route[n - 1], b = route[n];
        const dir = b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up';
        game.update(16 / 128, { dir, run: true });
        if (game.player.areaId !== areaId) break;
        assert.deepEqual(feetTile(), b);
      }
    };
    walk(reloaded.portals.find(p => p.id === 'home-enter').from);
    assert.equal(game.player.areaId, indoorEntrance.areaId);
    walk(reloaded.portals.find(p => p.id === 'home-exit').from);
    assert.equal(game.player.areaId, 'town-main');
    assert.deepEqual(feetTile(), { x: exit.to.x, y: exit.to.y });
    assert.deepEqual(game.world.variant, world.variant);
    const appliedHash = sha(readFileSync(target));
    assert.throws(() => editor.applyChangeSet(reloaded, reloadedChanges, context));
    assert.equal(sha(readFileSync(target)), appliedHash, 'Stale replay must not write the document');

    const partials = [
      d => { d.objects.find(o => o.id === house.id).x++; },
      d => { d.objects.find(o => o.id === house.id).x++; d.portals.find(p => p.id === 'home-exit').to.x++; },
      d => { d.objects.find(o => o.id === house.id).x++; d.portals.find(p => p.id === 'home-enter').from.x++; },
    ];
    for (const mutate of partials) {
      const bad = structuredClone(base); mutate(bad);
      assert.ok(editor.validateDocument(bad, context).some(issue => issue.code === 'facility-link'));
    }
    const portalsOnly = structuredClone(base);
    portalsOnly.portals.find(p => p.id === 'home-enter').from.x++;
    portalsOnly.portals.find(p => p.id === 'home-exit').to.x++;
    assert.deepEqual(editor.validateDocument(portalsOnly, context), []);
    const park = structuredClone(base); park.objects.find(o => o.id === 'town-gazebo-96-56').x++;
    assert.deepEqual(editor.validateDocument(park, context), []);

    let railChecks = null;
    if (revision.name === 'station') {
      const withoutLinks = editor.validateDocument(base, { baselineWorld: world });
      assert.ok(withoutLinks.some(issue => issue.path === 'areas.town-neighbor' && issue.code === 'unreachable'));
      const movedBoarding = structuredClone(base);
      movedBoarding.interactions.find(i => i.id === 'station-boarding').x++;
      assert.ok(editor.validateDocument(movedBoarding, context).some(issue => issue.code === 'rail-link'));
      const obstructedEndpoint = structuredClone(base), from = railLinks[0].from;
      const area = obstructedEndpoint.areas.find(a => a.id === from.areaId);
      area.ground[from.y * area.width + from.x] = 22;
      assert.ok(editor.validateDocument(obstructedEndpoint, context).some(issue => issue.code === 'arrival'));
      const movedStation = structuredClone(base);
      movedStation.objects.find(o => o.id === 'neighbor-station-building').x++;
      assert.ok(editor.validateDocument(movedStation, context).some(issue => issue.code === 'facility-link'));
      movedStation.portals.find(p => p.id === 'neighbor-station-enter').from.x++;
      movedStation.portals.find(p => p.id === 'neighbor-station-exit').to.x++;
      assert.deepEqual(editor.validateDocument(movedStation, context), []);
      assert.equal(editor.diffDocuments(base, movedStation, context).operations.length, 3);
      railChecks = { directedLinks: railLinks.length, withoutLinksUnreachable: true, movedBoardingRejected: true,
        obstructedEndpointRejected: true, stationWithEntranceAndReturn: true };
    }
    assert.equal(json(target).id, base.id);
    evidence.revisions.push({ revision: revision.name, commit: revision.commit, areas: base.areas.length,
      strictIssueCount: strict.length, strictCodes: summarize(strict), trustedIssueCount: trusted.length,
      numericStyles: base.objects.filter(o => /^\d+$/.test(o.style ?? '')).length,
      facilityKinds: base.facilities.filter(f => f.kind).length,
      districts: base.areas.reduce((sum, a) => sum + (a.districts?.length ?? 0), 0),
      variantPreserved: true, sourceGroundAndCollisionPreserved: true, noOpOperations: noOp.operations.length,
      movedFacility: house.facilityId, moveOperations: changes.operations.map(({ type, table, id }) => ({ type, table, id })),
      previewReadOnly: true, appliedReloadedDiff: 0, gameEntranceAndReturn: true, staleReplayRejected: true,
      partialFacilityMovesRejected: partials.length, portalsOnlyAccepted: true, parkAccepted: true, railChecks });
  } finally { await server.close(); }
}
writeFileSync(join(output, 'summary.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
