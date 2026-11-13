import prototype from '../data/editor-prototype.json';
import portalCorridor from './fixtures/editor-portal-corridor.json';
import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { Game } from '../src/session/game';
import { buildWorld, validateWorld } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';
import { assembleEditorWorld } from '../src/editor/runtime.ts';
import { applyChangeSet, buildEditorWorld, createChangeSet, diffDocuments, EditorSession, EditorValidationError,
  loadChangeSet, loadDocument, parseChangeSet, parseDocument, previewChangeSet, serializeChangeSet, serializeDocument, validateDocument,
  type EditOperation, type EditorDocument, type EditorInteraction, type EditorObject } from '../src/editor/index.ts';

const fixture = () => parseDocument(prototype);
const npc = (d: EditorDocument) => d.interactions.find(i => i.id === 'demo-npc')!;
const move = (d: EditorDocument, x: number): EditOperation => ({ type: 'move', table: 'interactions', id: 'demo-npc', before: npc(d), after: { ...npc(d), x } });
const codes = (d: unknown) => validateDocument(d).map(i => i.code);

describe('editor document schema and references', () => {
  it('normalizes stable IDs and serializes deterministically without mutating source order', () => {
    const d = fixture(), reversed = structuredClone(d);
    reversed.areas.reverse(); reversed.objects.reverse(); reversed.portals.reverse();
    const raw = JSON.parse(JSON.stringify(reversed));
    expect(serializeDocument(raw)).toBe(serializeDocument(d));
    expect(raw.areas[0].id).toBe('demo-room');
    expect(loadDocument(serializeDocument(d))).toEqual(d);
    expect(validateDocument(d)).toEqual([]);
    expect(loadDocument(serializeDocument(d)).interactions[0].lines).toEqual(npc(d).lines);
  });

  const invalid: [string, (d: EditorDocument) => void, string][] = [
    ['ID spelling', d => { npc(d).id = 'Not-Stable'; }, 'format'],
    ['path-like ID', d => { npc(d).id = '../source'; }, 'format'],
    ['duplicate ID across tables', d => { d.objects[0].id = npc(d).id; }, 'duplicate-id'],
    ['duplicate catalog entry', d => { d.catalogs.eventKeys.push(d.catalogs.eventKeys[0]); }, 'duplicate-id'],
    ['fractional coordinate', d => { npc(d).x = 1.5; }, 'range'],
    ['non-finite coordinate', d => { npc(d).x = NaN; }, 'range'],
    ['negative coordinate', d => { npc(d).y = -1; }, 'range'],
    ['oversized area', d => { d.areas[0].width = 257; }, 'range'],
    ['zero footprint', d => { npc(d).w = 0; }, 'range'],
    ['ground size', d => { d.areas[0].ground.pop(); }, 'layer-size'],
    ['unknown tile', d => { d.areas[0].ground[11] = 255; }, 'value'],
    ['NPC bounds', d => { npc(d).x = 10; }, 'bounds'],
    ['object footprint bounds', d => { d.objects[0].w = 4; }, 'bounds'],
    ['portal source bounds', d => { d.portals[0].from.x = 10; }, 'bounds'],
    ['portal arrival bounds', d => { d.portals[0].to.x = 8; }, 'bounds'],
    ['missing area', d => { npc(d).areaId = 'missing-area'; }, 'reference'],
    ['facility area mismatch', d => { d.facilities[0].areaId = 'demo-room'; }, 'reference'],
    ['missing facility', d => { d.objects[0].facilityId = 'missing-facility'; }, 'reference'],
    ['event reference', d => { npc(d).eventKey = 'missing.event'; }, 'reference'],
    ['sprite reference', d => { npc(d).sprite = 'missing-sprite'; }, 'reference'],
    ['missing NPC sprite', d => { delete npc(d).sprite; }, 'reference'],
    ['missing portal destination', d => { d.portals[0].to.areaId = 'missing-area'; }, 'reference'],
    ['portal pair mismatch', d => { d.portals[1].returnPortalId = 'missing-door'; }, 'portal-pair'],
    ['closed facility portal', d => { d.facilities[0].state = 'closed'; }, 'reference'],
    ['solid object on wall', d => { d.objects[1].x = 0; }, 'overlap'],
    ['NPC on wall', d => { npc(d).x = 0; }, 'overlap'],
    ['NPC on solid object', d => { npc(d).x = 2; npc(d).y = 2; }, 'overlap'],
    ['overlapping NPCs', d => { d.interactions.push({ ...npc(d), id: 'second-npc' }); }, 'overlap'],
    ['overlapping solid objects', d => { d.objects.push({ ...d.objects[1], id: 'second-tree' }); }, 'overlap'],
    ['overlapping portals', d => { d.portals.push({ ...d.portals[0], id: 'second-door', returnPortalId: undefined }); }, 'overlap'],
    ['arrival on object', d => { d.portals[1].to.x = 2; d.portals[1].to.y = 2; }, 'arrival'],
    ['arrival on another door', d => { d.portals[1].to.y = 2; }, 'arrival'],
    ['start on solid tile', d => { d.start.x = 2; d.start.y = 2; }, 'arrival'],
    ['start on portal', d => { d.start.x = 8; d.start.y = 2; }, 'arrival'],
    ['unknown source field', d => { Object.assign(d, { output: 'src/world/town.ts' }); }, 'unknown-field'],
    ['unknown NPC field', d => { Object.assign(npc(d), { script: 'run()' }); }, 'unknown-field'],
    ['unknown schema version', d => { Object.assign(d, { schemaVersion: 2 }); }, 'value'],
  ];
  it.each(invalid)('rejects %s before conversion', (_, corrupt, code) => {
    const d = fixture(); corrupt(d);
    expect(codes(d)).toContain(code);
    expect(() => parseDocument(d)).toThrow(EditorValidationError);
    expect(() => buildEditorWorld(d)).toThrow(EditorValidationError);
  });
  it('reports malformed JSON and missing/wrongly typed fields', () => {
    expect(() => loadDocument('{')).toThrow('Invalid JSON');
    for (const raw of [null, [], {}, { schemaVersion: 1 }, { ...fixture(), interactions: 'bad' }]) expect(validateDocument(raw).length).toBeGreaterThan(0);
  });
  it('rejects unreachable areas/portals and isolated interactions', () => {
    const separated = fixture();
    separated.areas[0].ground = separated.areas[0].ground.map((tile, index) => index % 10 === 6 ? T.WALL : tile);
    expect(codes(separated)).toContain('unreachable');
    const trapped = fixture(), area = trapped.areas[0], i = npc(trapped);
    for (const [x, y] of [[i.x - 1, i.y], [i.x + 1, i.y], [i.x, i.y - 1], [i.x, i.y + 1]]) area.ground[y * area.width + x] = T.WALL;
    expect(validateDocument(trapped)).toContainEqual(expect.objectContaining({ path: 'interactions.demo-npc', code: 'unreachable' }));
  });
  it('treats portal tiles as mandatory transitions, including interaction approach checks', () => {
    const corridor = structuredClone(portalCorridor) as EditorDocument;
    // Exercise the reported map directly to confirm the actual engine cannot walk past its door.
    const game = new Game(assembleEditorWorld(corridor));
    let portals = 0, maxX = 0, sawNPC = false;
    game.on(event => { if (event.type === 'portal') portals++; });
    for (let tick = 0; tick < 1200; tick++) {
      game.update(1 / 120, { dir: 'right', run: false });
      if (game.player.areaId === 'corridor') maxX = Math.max(maxX, game.player.x);
      sawNPC ||= game.facingInteraction()?.id === 'far-npc';
    }
    expect(portals).toBeGreaterThan(0); expect(maxX).toBeLessThan(32); expect(sawNPC).toBe(false);
    expect(validateDocument(corridor)).toContainEqual(expect.objectContaining({ path: 'interactions.far-npc', code: 'unreachable' }));
    corridor.interactions[0].x = 3;
    expect(validateDocument(corridor)).toContainEqual(expect.objectContaining({ path: 'interactions.far-npc', code: 'unreachable' }));
    // A deliberate exit beyond the blocking portal makes the far side reachable.
    corridor.interactions[0].x = 5;
    corridor.portals.find(p => p.id === 'exit-room')!.to.x = 3;
    expect(validateDocument(corridor)).toEqual([]);
  });
  it('allows a declared object interaction to share only its linked footprint', () => {
    const d = fixture(), object = d.objects.find(o => o.id === 'demo-tree')!;
    const interaction: EditorInteraction = { ...npc(d), id: 'tree-interaction', kind: 'object', x: object.x, y: object.y, objectId: object.id, solid: false };
    d.interactions.push(interaction);
    expect(validateDocument(d)).toEqual([]);
    interaction.objectId = 'missing-tree';
    expect(codes(d)).toContain('reference');
  });
});

describe('validated editor operations, export and reload', () => {
  it('executes add/update/move/delete in one transaction without touching the original', () => {
    const d = fixture(), before = serializeDocument(d);
    const added: EditorObject = { id: 'test-bench', areaId: 'demo-outdoor', kind: 'bench', x: 3, y: 2, w: 1, h: 1, solid: true };
    const updated = { ...added, style: 'wood' };
    const operations: EditOperation[] = [
      { type: 'add', table: 'objects', id: added.id, after: added },
      { type: 'update', table: 'objects', id: added.id, before: added, after: updated },
      move(d, 5), { type: 'delete', table: 'objects', id: added.id, before: updated },
    ];
    const changes = createChangeSet(d, operations), result = applyChangeSet(d, loadChangeSet(serializeChangeSet(changes)));
    expect(npc(result).x).toBe(5);
    expect(result.objects).toEqual(d.objects);
    expect(serializeDocument(d)).toBe(before);
    expect(operations[0]).toEqual({ type: 'add', table: 'objects', id: added.id, after: added });
  });
  it('validates references after the complete gesture, allowing dependent additions/deletions', () => {
    const d = fixture(), facility = { ...d.facilities[0], id: 'new-facility' };
    const object = { ...d.objects[1], id: 'new-object', x: 6, y: 5, facilityId: facility.id };
    const add: EditOperation[] = [{ type: 'add', table: 'objects', id: object.id, after: object }, { type: 'add', table: 'facilities', id: facility.id, after: facility }];
    const next = applyChangeSet(d, createChangeSet(d, add));
    const deleted: EditOperation[] = [{ type: 'delete', table: 'facilities', id: facility.id, before: facility }, { type: 'delete', table: 'objects', id: object.id, before: object }];
    expect(applyChangeSet(next, createChangeSet(next, deleted))).toEqual(d);
    expect(() => createChangeSet(next, deleted.slice(0, 1))).toThrow('Facility');
  });
  it('exports a stable ID-based diff, previews it, and reloads exactly the edited structure', () => {
    const d = fixture(), next = applyChangeSet(d, createChangeSet(d, [move(d, 5)]));
    const changes = diffDocuments(d, next), bytes = serializeChangeSet(changes);
    expect(changes.operations.map(op => op.type)).toEqual(['move']);
    const preview = previewChangeSet(d, loadChangeSet(bytes));
    expect(preview.summary).toEqual(['move interactions/demo-npc']);
    expect(preview.before).toBe(serializeDocument(d));
    expect(preview.after).toBe(serializeDocument(next));
    expect(loadDocument(serializeDocument(applyChangeSet(d, loadChangeSet(bytes))))).toEqual(next);
    expect(serializeChangeSet(diffDocuments(d, next))).toBe(bytes);
    expect(applyChangeSet(next, diffDocuments(next, d))).toEqual(d);
  });
  it('detects stale baselines, including unrelated manual edits and repeated application', () => {
    const d = fixture(), changes = createChangeSet(d, [move(d, 5)]), edited = structuredClone(d);
    edited.areas[0].name = 'manual change';
    expect(() => applyChangeSet(edited, changes)).toThrow('Source data changed');
    const applied = applyChangeSet(d, changes);
    expect(() => applyChangeSet(applied, changes)).toThrow('Source data changed');
    expect(npc(applied).x).toBe(5);
  });
  it('rejects malformed operations, renamed IDs and attributes disguised as moves', () => {
    const d = fixture(), valid = createChangeSet(d, [move(d, 5)]);
    const invalid = [
      { ...valid, target: 'src/world/town.ts' },
      { ...valid, documentId: 'different-document' },
      { ...valid, operations: [{ ...valid.operations[0], type: 'execute' }] },
      { ...valid, operations: [{ ...valid.operations[0], table: '../source' }] },
      { ...valid, operations: [{ ...valid.operations[0], after: { ...npc(d), id: 'renamed-npc' } }] },
      { ...valid, operations: [{ ...valid.operations[0], before: { ...npc(d), name: 'stale' } }] },
      { ...valid, operations: [{ ...valid.operations[0], after: { ...npc(d), name: 'attribute change' } }] },
      { ...valid, operations: [{ ...valid.operations[0], after: { ...npc(d), x: 999 } }] },
      { ...valid, operations: [{ type: 'delete', table: 'interactions', id: 'missing-npc', before: { ...npc(d), id: 'missing-npc' } }] },
      { ...valid, operations: [{ type: 'add', table: 'interactions', id: 'demo-npc', after: npc(d) }] },
      { ...valid, operations: [{ type: 'update', table: 'interactions', id: 'demo-npc', after: npc(d) }] },
      { ...valid, operations: [{ type: 'move', table: 'facilities', id: d.facilities[0].id, before: d.facilities[0], after: d.facilities[0] }] },
    ];
    for (const changes of invalid) expect(() => applyChangeSet(d, changes)).toThrow(EditorValidationError);
    expect(() => parseChangeSet({})).toThrow(EditorValidationError);
    expect(() => loadChangeSet('(')).toThrow('Invalid change-set JSON');
    expect(npc(d).x).toBe(4);
  });
  it('rejects final invalid data atomically even after a valid earlier operation', () => {
    const d = fixture(), moved = { ...npc(d), x: 5 };
    const changes = { schemaVersion: 1, documentId: d.id, baseDocument: d, operations: [move(d, 5),
      { type: 'update', table: 'interactions', id: 'demo-npc', before: moved, after: { ...moved, eventKey: 'missing.key' } }] };
    expect(() => applyChangeSet(d, changes)).toThrow('Unknown event key');
    expect(npc(d).x).toBe(4);
  });
  it('does not silently discard unsupported metadata edits', () => {
    const d = fixture(), next = structuredClone(d); next.start.x++;
    expect(() => diffDocuments(d, next)).toThrow('authored separately');
  });
});

describe('editor session undo/redo', () => {
  it('groups a gesture, restores exact snapshots, and exports relative to the loaded baseline', () => {
    const d = fixture(), session = new EditorSession(d);
    expect(session.canUndo).toBe(false); expect(session.canRedo).toBe(false);
    expect(session.undo()).toEqual(d); expect(session.redo()).toEqual(d);
    const changed = session.commit([move(session.document, 5)]);
    expect(session.canUndo).toBe(true);
    expect(session.undo()).toEqual(d); expect(session.canRedo).toBe(true);
    expect(session.exportChanges().operations).toEqual([]);
    expect(session.redo()).toEqual(changed);
    expect(applyChangeSet(d, session.exportChanges())).toEqual(changed);
  });
  it('keeps history on validation failure and no-op, and clears redo on a new valid edit', () => {
    const session = new EditorSession(fixture());
    session.commit([move(session.document, 5)]); session.undo();
    expect(() => session.commit([move(session.document, 50)])).toThrow(EditorValidationError);
    expect(session.canRedo).toBe(true);
    session.commit([]); expect(session.canRedo).toBe(true);
    session.commit([move(session.document, 6)]); expect(session.canRedo).toBe(false);
    const snapshot = session.document; npc(snapshot).x = 99;
    expect(npc(session.document).x).toBe(6);
    npc(session.exportChanges().baseDocument).x = 99;
    expect(session.exportChanges().baseDocument).toEqual(fixture());
  });
  it('bounds retained undo steps', () => {
    const session = new EditorSession(fixture(), 2);
    for (const x of [5, 6, 7]) session.commit([move(session.document, x)]);
    session.undo(); session.undo();
    expect(npc(session.document).x).toBe(5);
    expect(session.canUndo).toBe(false);
    expect(() => new EditorSession(fixture(), 0)).toThrow(RangeError);
  });
});

describe('editor data to game runtime', () => {
  it('matches runtime collision/lookup semantics and remains isolated from the generated town', () => {
    const baseline = buildWorld(), d = fixture(), world = buildEditorWorld(d);
    expect(validateWorld(world)).toEqual([]);
    for (const runtime of world.areas.values()) expect(runtime).toEqual(toRuntime(runtime.def));
    world.areas.get('demo-outdoor')!.interactions[0].lines[0] = 'runtime changed';
    expect(npc(d).lines[0]).not.toBe('runtime changed');
    expect(buildEditorWorld(d).areas.get('demo-outdoor')!.interactions[0].lines).toEqual(npc(d).lines);
    expect(buildWorld()).toEqual(baseline);
  });
  it('boots a new game after export/apply/reload, with edited NPC name, position, dialog and event key', () => {
    const d = fixture(), edited = structuredClone(d);
    npc(edited).x = 5; npc(edited).name = '確認NPCの変更後';
    npc(edited).lines = ['変更後の確認用会話'];
    const reloaded = loadDocument(serializeDocument(applyChangeSet(d, loadChangeSet(serializeChangeSet(diffDocuments(d, edited))))));
    const game = new Game(buildEditorWorld(reloaded)), events: unknown[] = [];
    game.on(event => events.push(event));
    game.player = { areaId: 'demo-outdoor', ...feetAtTile(5, 5), facing: 'up' };
    game.action();
    expect(game.dialog).toMatchObject({ speaker: '確認NPCの変更後', lines: ['変更後の確認用会話'] });
    expect(events).toContainEqual({ type: 'interact', areaId: 'demo-outdoor', interactionId: 'demo-npc', eventKey: 'demo.greeting' });
    expect(game.area.solid[4 * game.area.width + 5]).toBe(1);
    expect(game.area.solid[4 * game.area.width + 4]).toBe(0);
  });
  it('uses authored reciprocal portals in the existing game', () => {
    const game = new Game(buildEditorWorld(fixture()));
    game.player = { areaId: 'demo-outdoor', ...feetAtTile(8, 3), facing: 'up' };
    game.update(0.3, { dir: 'up', run: false });
    expect(game.player).toEqual({ areaId: 'demo-room', ...feetAtTile(3, 3), facing: 'up' });
    game.update(0.3, { dir: 'down', run: false });
    expect(game.player).toEqual({ areaId: 'demo-outdoor', ...feetAtTile(8, 3), facing: 'down' });
  });
});
