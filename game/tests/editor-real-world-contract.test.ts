import { describe, expect, it } from 'vitest';
import sample from '../data/editor-prototype.json';
import corridorFixture from './fixtures/editor-portal-corridor.json';
import { buildWorld, type World } from '../src/world/index.ts';
import { T } from '../src/world/tiles.ts';
import { referenceScene } from '../src/editor-ui/map/reference.ts';
import { mapMoveOperations } from '../src/editor-ui/map/operations.ts';
import {
  applyChangeSet, buildEditorWorld, createChangeSet, diffDocuments, EditorSession, EditorValidationError, loadChangeSet, loadDocument, parseChangeSet, parseDocument,
  previewChangeSet, serializeChangeSet, serializeDocument, validateDocument,
  type EditorDocument, type EditorSessionOptions, type EditorValidationContext,
} from '../src/editor/index.ts';
import { assembleEditorWorld } from '../src/editor/runtime.ts';
import { worldRailLinks } from '../src/world-editor/trusted-context.ts';

/** The old reference scene is enriched with source metadata before treating it as a snapshot. */
function snapshot(world: World): EditorDocument {
  const scene = referenceScene(world);
  for (const a of scene.areas) {
    const districts = world.areas.get(a.id)!.def.districts;
    if (districts) a.districts = structuredClone(districts);
  }
  for (const i of scene.interactions.filter(i => i.kind !== 'npc')) {
    const matches = scene.objects.filter(o => o.solid && o.areaId === i.areaId && o.x === i.x && o.y === i.y &&
      o.w === (i.w ?? 1) && o.h === (i.h ?? 1));
    if (matches.length === 1) i.objectId = matches[0].id;
  }
  const unique = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => typeof v === 'string'))].sort();
  return { schemaVersion: 1, id: world.variant.id, tileSize: 16, start: { ...world.start }, variant: structuredClone(world.variant),
    catalogs: { sprites: unique(scene.interactions.map(i => i.sprite)), eventKeys: unique(scene.interactions.map(i => i.eventKey)) }, ...scene };
}
const setup = () => { const world = buildWorld(), document = snapshot(world); return { world, document, context: { baselineWorld: world, railLinks: worldRailLinks(world) } satisfies EditorValidationContext }; };
const codes = (document: EditorDocument, context: EditorValidationContext) => validateDocument(document, context).map(i => i.code);
const clone = <T>(value: T): T => structuredClone(value);
const home = (document: EditorDocument) => document.objects.find(o => o.id === 'town-house-32-27')!;
const enter = (document: EditorDocument) => document.portals.find(p => p.id === 'home-enter')!;
const exit = (document: EditorDocument) => document.portals.find(p => p.id === 'home-exit')!;

describe('trusted real-world editor contract', () => {
  it('keeps the trusted context through a real home edit, undo, redo, export and preview', () => {
    const { document, context } = setup();
    const strictIssues = validateDocument(document);
    expect(strictIssues).toHaveLength(95);
    expect(strictIssues.every(issue => issue.code === 'overlap')).toBe(true);
    expect(() => new EditorSession(document)).toThrow(EditorValidationError);
    expect(() => new EditorSession(document, { context, historyLimit: 0 })).toThrow(RangeError);
    const options: EditorSessionOptions = { context, historyLimit: 1 };
    const session = new EditorSession(document, options), baseline = session.document;
    const plant = baseline.objects.find(o => o.id === 'home-family-interior-plant-14-9')!;
    const edited = session.commit([{ type: 'move', table: 'objects', id: plant.id, before: plant, after: { ...plant, x: 13 } }]);
    expect(edited.objects.find(o => o.id === plant.id)!.x).toBe(13);
    expect(session.undo()).toEqual(baseline);
    expect(session.canRedo).toBe(true);
    expect(session.redo()).toEqual(edited);
    const changes = session.exportChanges();
    expect(changes.operations.map(op => op.id)).toEqual([plant.id]);
    expect(() => previewChangeSet(baseline, changes)).toThrow(EditorValidationError);
    expect(previewChangeSet(baseline, changes, context).document).toEqual(edited);
    const bytes = serializeChangeSet(changes, context);
    expect(JSON.parse(bytes)).not.toHaveProperty('context');
    expect(applyChangeSet(baseline, loadChangeSet(bytes, context), context)).toEqual(edited);

    const movedPlant = session.document.objects.find(o => o.id === plant.id)!;
    session.commit([{ type: 'move', table: 'objects', id: plant.id, before: movedPlant, after: { ...movedPlant, x: 12 } }]);
    expect(session.undo()).toEqual(edited);
    expect(session.canUndo).toBe(false);
  });

  it('rejects a newly overlapping edit and preserves history with a trusted context', () => {
    const { document, context } = setup(), session = new EditorSession(document, { context });
    const plant = session.document.objects.find(o => o.id === 'home-family-interior-plant-14-9')!;
    session.commit([{ type: 'move', table: 'objects', id: plant.id, before: plant, after: { ...plant, x: 13 } }]);
    session.undo();
    const before = session.document, tree = before.objects.find(o => o.id === 'town-tree-120-17')!;
    const movedIntoOverlap = clone(before);
    movedIntoOverlap.objects.find(o => o.id === tree.id)!.x = 92;
    expect(codes(movedIntoOverlap, context)).toContain('overlap');
    expect(() => session.commit([{ type: 'move', table: 'objects', id: tree.id, before: tree, after: { ...tree, x: 92 } }])).toThrow(EditorValidationError);
    const intruder = { ...tree, id: 'intruder' };
    expect(() => session.commit([{ type: 'add', table: 'objects', id: intruder.id, after: intruder }])).toThrow(EditorValidationError);
    expect(session.document).toEqual(before);
    expect(session.canRedo).toBe(true);
    const forged = clone(before); forged.objects.push(intruder);
    expect(() => new EditorSession(forged, { context })).toThrow(EditorValidationError);
    expect(() => parseChangeSet({ schemaVersion: 1, documentId: forged.id, baseDocument: forged, operations: [] }, context)).toThrow(EditorValidationError);
    expect(session.redo().objects.find(o => o.id === plant.id)!.x).toBe(13);
  });

  it('keeps the original trusted World snapshot when caller-owned data later changes', () => {
    const { document, context } = setup(), session = new EditorSession(document, { context });
    const sourceTree = context.baselineWorld.areas.get('town-main')!.def.objects.find(o => o.id === 'town-tree-120-17')!;
    sourceTree.x++;
    expect(validateDocument(document, context).some(issue => issue.code === 'overlap')).toBe(true);
    expect(session.commit([])).toEqual(session.document);
    expect(session.exportChanges().operations).toEqual([]);
  });

  it('keeps explicitly supplied rail links through commit and export', () => {
    const document = clone(sample) as unknown as EditorDocument;
    document.portals = [];
    const baselineWorld = assembleEditorWorld(document);
    document.variant = clone(baselineWorld.variant);
    const link = { from: { areaId: 'demo-outdoor', x: 1, y: 4 }, to: { areaId: 'demo-room', x: 1, y: 1 } };
    const context: EditorValidationContext = { baselineWorld, railLinks: [link] };
    expect(validateDocument(document, { baselineWorld })).toContainEqual(expect.objectContaining({ path: 'areas.demo-room', code: 'unreachable' }));
    expect(validateDocument(document, context)).toEqual([]);
    const originalContext = clone(context);
    const session = new EditorSession(document, { context }), tree = session.document.objects.find(o => o.id === 'demo-tree')!;
    link.to.x = 0;
    expect(validateDocument(document, context).some(issue => issue.code === 'arrival')).toBe(true);
    const edited = session.commit([{ type: 'move', table: 'objects', id: tree.id, before: tree, after: { ...tree, x: 3 } }]);
    const changes = session.exportChanges();
    expect(applyChangeSet(document, changes, originalContext)).toEqual(edited);
    expect(() => applyChangeSet(document, changes, { baselineWorld })).toThrow(EditorValidationError);
    expect(changes.baseDocument).not.toHaveProperty('railLinks');
  });

  it('preserves numeric style, facility kind, source districts and variant through document and runtime', () => {
    const { world, document, context } = setup();
    expect(validateDocument(document).length).toBeGreaterThan(0);
    expect(validateDocument(document, context)).toEqual([]);
    const loaded = loadDocument(serializeDocument(document, context), context);
    // F5 reuses apartment style '0' for the background building; town-neighbor adds 2 numbered houses.
    expect(loaded.objects.filter(o => /^\d+$/.test(o.style ?? '')).length).toBe(64);
    // 12 town-main facilities + station-neighbor from PR #59.
    expect(loaded.facilities.filter(f => f.kind).length).toBe(13);
    const rebuilt = assembleEditorWorld(loaded);
    expect(rebuilt.variant).toEqual(world.variant);
    for (const [id, area] of world.areas) {
      expect(rebuilt.areas.get(id)!.def.districts).toEqual(area.def.districts);
      expect(rebuilt.areas.get(id)!.ground).toEqual(area.ground);
      expect(rebuilt.areas.get(id)!.solid).toEqual(area.solid);
    }
    expect(diffDocuments(loaded, document, context).operations).toEqual([]);
    const runtimeDistrict = rebuilt.areas.get('town-main')!.def.districts![0];
    const originalName = loaded.areas.find(a => a.id === 'town-main')!.districts![0].name;
    runtimeDistrict.name = 'changed only in rebuilt world';
    expect(loaded.areas.find(a => a.id === 'town-main')!.districts![0].name).toBe(originalName);
    expect(world.areas.get('town-main')!.def.districts![0].name).toBe(originalName);
  });

  it('keeps variant metadata without reapplying resolved extra interactions', () => {
    const document = clone(sample) as unknown as EditorDocument;
    const { areaId: _areaId, objectId: _objectId, ...extra } = document.interactions[0];
    document.variant = { id: 'childhood', stage: 'childhood', edgeMessage: 'edge', facilityStates: { 'demo-house': 'closed' },
      disabledPortals: ['demo-enter'], disabledInteractions: [extra.id], extraInteractions: { 'demo-outdoor': [extra] } };
    const world = buildEditorWorld(document);
    expect(world.variant).toEqual(document.variant);
    expect(world.areas.get('demo-outdoor')!.interactions.length).toBe(document.interactions.filter(i => i.areaId === 'demo-outdoor').length);
    expect(world.areas.get('demo-outdoor')!.def.portals.some(p => p.id === 'demo-enter')).toBe(true);
  });

  it.each([
    ['expanded existing footprint', (d: EditorDocument) => { d.objects.find(o => o.id === 'town-tree-120-17')!.w++; }],
    ['extra overlapping object', (d: EditorDocument) => { d.objects.push({ id: 'intruder', areaId: 'town-main', kind: 'tree', x: 120, y: 17, w: 1, h: 1, solid: true }); }],
    ['moved overlap partner', (d: EditorDocument) => { d.objects.find(o => o.id === 'town-gym-115-14')!.x++; }],
    ['new wall under an existing object', (d: EditorDocument) => { const a = d.areas.find(a => a.id === 'town-main')!; a.ground[34 * a.width + 30] = T.WALL; }],
  ] as const)('rejects a new overlap despite trusted baseline: %s', (_name, mutate) => {
    const { document, context } = setup(); mutate(document);
    expect(codes(document, context)).toContain('overlap');
  });

  it('does not use candidate or change-set baseDocument as the trusted baseline', () => {
    const { document, context } = setup(), bad = clone(document);
    bad.objects.push({ id: 'intruder', areaId: 'town-main', kind: 'tree', x: 120, y: 17, w: 1, h: 1, solid: true });
    expect(() => parseDocument(bad, context)).toThrow();
    expect(() => parseChangeSet({ schemaVersion: 1, documentId: bad.id, baseDocument: bad, operations: [] }, context)).toThrow();
    expect(validateDocument(document, context)).toEqual([]);
    expect(context.baselineWorld.areas.get('town-main')!.def.objects.some(o => o.id === 'intruder')).toBe(false);
  });

  it('rejects unknown self-declared exceptions, unsafe styles, facility kinds and lost metadata', () => {
    const { document, context } = setup();
    expect(validateDocument({ ...document, exceptions: ['anything'] }, context).some(i => i.code === 'unknown-field')).toBe(true);
    expect(validateDocument({ ...document, railLinks: [] }, context).some(i => i.code === 'unknown-field')).toBe(true);
    const badStyle = clone(document); badStyle.objects[0].style = '../escape';
    expect(codes(badStyle, context)).toContain('format');
    const badKind = clone(document); (badKind.facilities[0] as { kind?: string }).kind = 'not-a-facility';
    expect(codes(badKind, context)).toContain('value');
    const badDistrict = clone(document); delete badDistrict.areas.find(a => a.id === 'town-main')!.districts;
    expect(codes(badDistrict, context)).toContain('metadata');
    const badVariant = clone(document); delete badVariant.variant;
    expect(codes(badVariant, context)).toContain('metadata');
  });

  it('keeps no-op export empty and preview/apply/reload atomic for an entrance-free facility move', () => {
    const { document, context } = setup(), base = parseDocument(document, context), before = serializeDocument(base, context);
    const empty = loadChangeSet(serializeChangeSet(diffDocuments(base, base, context), context), context);
    expect(empty.operations).toEqual([]);
    expect(serializeDocument(applyChangeSet(base, empty, context), context)).toBe(before);
    const next = clone(base); next.objects.find(o => o.id === 'town-gazebo-96-56')!.x++;
    const changes = loadChangeSet(serializeChangeSet(diffDocuments(base, next, context), context), context);
    expect(changes.operations).toHaveLength(1);
    expect(changes.operations[0]).toMatchObject({ type: 'move', table: 'objects', id: 'town-gazebo-96-56' });
    const preview = previewChangeSet(base, changes, context);
    expect(preview.document).toEqual(parseDocument(next, context));
    expect(serializeDocument(base, context)).toBe(before);
    const reloaded = loadDocument(serializeDocument(applyChangeSet(base, changes, context), context), context);
    expect(diffDocuments(reloaded, next, context).operations).toEqual([]);
    expect(() => applyChangeSet(reloaded, changes, context)).toThrow();
    const first = changes.operations[0];
    if (first.type !== 'move' || first.table !== 'objects') throw new Error('Expected an object move');
    const missing = { type: 'delete' as const, table: 'objects' as const, id: 'missing-tree', before: { ...first.before, id: 'missing-tree' } };
    expect(() => applyChangeSet(base, { ...changes, operations: [first, missing] }, context)).toThrow();
    expect(serializeDocument(base, context)).toBe(before);
  });

  it('moves a building, its outdoor entrance and return together without shifting indoor endpoints', () => {
    const { document, context } = setup(), next = clone(document);
    const oldEnterTo = clone(enter(next).to), oldExitFrom = clone(exit(next).from);
    home(next).x++; enter(next).from.x++; exit(next).to.x++;
    expect(validateDocument(next, context)).toEqual([]);
    expect(enter(next).to).toEqual(oldEnterTo); expect(exit(next).from).toEqual(oldExitFrom);
    const changes = diffDocuments(document, next, context);
    expect(changes.operations.map(o => o.id).sort()).toEqual(['home-enter', 'home-exit', 'town-house-32-27']);
    expect(applyChangeSet(document, changes, context)).toEqual(parseDocument(next, context));
  });

  it.each([
    ['building only', (d: EditorDocument) => { home(d).x++; }],
    ['entrance left behind', (d: EditorDocument) => { home(d).x++; exit(d).to.x++; }],
    ['return left behind', (d: EditorDocument) => { home(d).x++; enter(d).from.x++; }],
  ] as const)('rejects a partial facility move: %s', (_name, mutate) => {
    const { document, context } = setup(); mutate(document);
    expect(codes(document, context)).toContain('facility-link');
  });

  it('rejects moving indoor endpoints along with an outdoor facility', () => {
    const { document, context } = setup();
    const next = clone(document); home(next).x++; enter(next).from.x++; exit(next).to.x++;
    enter(next).to.x++;
    expect(codes(next, context)).toContain('facility-link');
    const other = clone(document); home(other).x++; enter(other).from.x++; exit(other).to.x++;
    exit(other).from.x++;
    expect(codes(other, context)).toContain('facility-link');
  });

  it('permits coordinated entrance/return movement without moving the building', () => {
    const { document, context } = setup(), next = clone(document);
    enter(next).from.x++; exit(next).to.x++;
    expect(validateDocument(next, context)).toEqual([]);
    const changes = diffDocuments(document, next, context);
    expect(changes.operations.map(o => o.id).sort()).toEqual(['home-enter', 'home-exit']);
    expect(applyChangeSet(document, changes, context)).toEqual(parseDocument(next, context));
  });

  it.fails('permits a facility move after independently moving its entrance and return', () => {
    const { document, context } = setup();
    const doors = clone(document);
    enter(doors).from.x++; exit(doors).to.x++;
    const afterEntrance = applyChangeSet(document, diffDocuments(document, doors, context), context);
    expect(home(afterEntrance).x).toBe(home(document).x);
    expect(enter(afterEntrance).from.x).toBe(enter(document).from.x + 1);
    expect(exit(afterEntrance).to.x).toBe(exit(document).to.x + 1);

    const moveFacility = mapMoveOperations(afterEntrance, { table: 'objects', id: home(afterEntrance).id }, home(afterEntrance).x + 1, home(afterEntrance).y);
    const afterFacility = applyChangeSet(afterEntrance, createChangeSet(afterEntrance, moveFacility, context), context);
    expect(home(afterFacility).x).toBe(home(afterEntrance).x + 1);
    expect(enter(afterFacility).from.x).toBe(enter(afterEntrance).from.x + 1);
    expect(exit(afterFacility).to.x).toBe(exit(afterEntrance).to.x + 1);
    expect(enter(afterFacility).to).toEqual(enter(afterEntrance).to);
    expect(exit(afterFacility).from).toEqual(exit(afterEntrance).from);
    expect(loadDocument(serializeDocument(afterFacility, context), context)).toEqual(afterFacility);
  });

  it('does not let a trusted rail edge start on a forced portal', () => {
    const valid = clone(corridorFixture) as unknown as EditorDocument;
    valid.portals.find(p => p.id === 'exit-room')!.to.x = 3;
    const world = buildEditorWorld(valid);
    valid.variant = clone(world.variant);
    const blocked = clone(valid); blocked.portals.find(p => p.id === 'exit-room')!.to.x = 1;
    expect(validateDocument(blocked, { baselineWorld: world })).toContainEqual(expect.objectContaining({ path: 'interactions.far-npc', code: 'unreachable' }));
    const context: EditorValidationContext = { baselineWorld: world, railLinks: [{ from: { areaId: 'corridor', x: 2, y: 1 }, to: { areaId: 'corridor', x: 3, y: 1 } }] };
    expect(validateDocument(valid, context)).toContainEqual(expect.objectContaining({ path: 'context.railLinks[0].from', code: 'arrival' }));
  });
});
