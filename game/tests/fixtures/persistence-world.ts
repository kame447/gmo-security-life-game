/** Fictional, validated data for persistence gate tests; not game content. */
import { buildEditorWorld } from '../../src/editor/index.ts';
import type { EditorDocument } from '../../src/editor/types.ts';

export function persistenceWorld() {
  const document: EditorDocument = { schemaVersion: 1, id: 'persistence-fixture', tileSize: 16,
    start: { areaId: 'fixture-yard', x: 1, y: 1, facing: 'right' }, catalogs: { sprites: ['friend'], eventKeys: ['fixture.talk'] },
    areas: [
      { id: 'fixture-yard', name: 'Fictional yard', kind: 'outdoor', width: 8, height: 6, ground: Array(48).fill(1) },
      { id: 'fixture-room', name: 'Fictional room', kind: 'indoor', width: 6, height: 6, ground: Array(36).fill(19) },
    ], facilities: [{ id: 'fixture-house', areaId: 'fixture-yard', name: 'Fictional house', interior: 'full', state: 'open' }],
    objects: [{ id: 'fixture-tree', areaId: 'fixture-yard', kind: 'tree', x: 3, y: 3, w: 1, h: 1, solid: true }],
    interactions: [{ id: 'fixture-clerk', areaId: 'fixture-yard', kind: 'npc', name: 'Fixture',
      x: 4, y: 2, solid: true, sprite: 'friend', eventKey: 'fixture.talk', lines: ['Fixture only.'] }],
    portals: [
      { id: 'fixture-enter', areaId: 'fixture-yard', facilityId: 'fixture-house', from: { x: 6, y: 4 }, to: { areaId: 'fixture-room', x: 2, y: 2, facing: 'up' } },
      { id: 'fixture-exit', areaId: 'fixture-room', facilityId: 'fixture-house', from: { x: 2, y: 4 }, to: { areaId: 'fixture-yard', x: 6, y: 3, facing: 'down' } },
    ] };
  return buildEditorWorld(document);
}
