import { describe, expect, it } from 'vitest';
import type { EditorDocument, EditorObject } from '../src/editor/types';
import { buildWorld } from '../src/world';
import { areaEntries, filterEntries, objectName } from '../src/world-editor/entity-list';
import { HOME_AREA, WorldEditorModel } from '../src/world-editor/model';

function documentFixture(): EditorDocument {
  return {
    schemaVersion: 1, id: 'entity-list-fixture', tileSize: 16,
    start: { areaId: 'town', x: 0, y: 0, facing: 'down' },
    catalogs: { sprites: ['friend'], eventKeys: ['friend.hello', 'board.read'] },
    areas: [
      { id: 'town', name: 'まち', kind: 'outdoor', width: 20, height: 20, ground: Array(400).fill(0) },
      { id: 'room', name: 'へや', kind: 'indoor', width: 10, height: 10, ground: Array(100).fill(0) },
    ],
    facilities: [
      { id: 'bakery', name: 'パンや', areaId: 'town', interior: 'full', state: 'open' },
      { id: 'door-only', name: '図書館', areaId: 'town', interior: 'full', state: 'open' },
      { id: 'unplaced', name: '未配置の施設', areaId: 'town', interior: 'background', state: 'closed' },
      { id: 'room-facility', name: '別エリア', areaId: 'room', interior: 'full', state: 'open' },
    ],
    objects: [
      { id: 'bakery-building', areaId: 'town', kind: 'shop', style: 'bakery', facilityId: 'bakery', x: 2, y: 3, w: 6, h: 6, solid: true },
      { id: 'chair-one', areaId: 'town', kind: 'chair-wood', catalogId: 'chair-wood', x: 10, y: 3, w: 1, h: 1, solid: true },
      { id: 'other-building', areaId: 'room', kind: 'house', facilityId: 'door-only', x: 1, y: 2, w: 5, h: 4, solid: true },
    ],
    interactions: [
      { id: 'town-friend', areaId: 'town', kind: 'npc', name: 'Alice', sprite: 'friend', x: 1, y: 1, solid: true, eventKey: 'friend.hello', lines: ['こんにちは。'] },
      { id: 'bakery-board', areaId: 'town', kind: 'sign', name: 'パンやの看板', objectId: 'bakery-building', x: 2, y: 3, w: 2, h: 1, solid: false, eventKey: 'board.read', lines: ['営業中'] },
      { id: 'distant-reference', areaId: 'town', kind: 'object', name: '参照先は別エリア', objectId: 'other-building', x: 12, y: 4, solid: false, eventKey: 'board.read', lines: ['案内'] },
      { id: 'room-friend', areaId: 'room', kind: 'npc', name: 'Alice', sprite: 'friend', x: 1, y: 1, solid: true, eventKey: 'friend.hello', lines: ['こんにちは。'] },
    ],
    portals: [
      { id: 'bakery-door', areaId: 'town', facilityId: 'bakery', from: { x: 4, y: 9, w: 2 }, to: { areaId: 'room', x: 1, y: 1, facing: 'up' } },
      { id: 'library-door', areaId: 'town', facilityId: 'door-only', from: { x: 15, y: 9 }, to: { areaId: 'room', x: 1, y: 1, facing: 'up' } },
      { id: 'room-exit', areaId: 'room', from: { x: 1, y: 9 }, to: { areaId: 'town', x: 1, y: 1, facing: 'down' } },
    ],
  };
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

describe('配置済み対象の一覧・検索', () => {
  it('全5種類を区別して現在のエリアだけを列挙する', () => {
    const entries = areaEntries(documentFixture(), 'town');
    expect(entries.map(entry => entry.key).sort()).toEqual([
      'facility:bakery', 'facility:door-only', 'facility:unplaced',
      'interaction:bakery-board', 'interaction:distant-reference',
      'npc:town-friend', 'object:bakery-building', 'object:chair-one',
      'portal:bakery-door', 'portal:library-door',
    ].sort());
    expect(new Set(entries.map(entry => entry.kind))).toEqual(new Set(['npc', 'object', 'facility', 'interaction', 'portal']));
    expect(areaEntries(documentFixture(), 'missing')).toEqual([]);
    expect(areaEntries(documentFixture(), 'room').some(entry => entry.id === 'town-friend')).toBe(false);
  });

  it('種類と検索を併用し、日本語の名前・大文字のID・前後空白を扱う', () => {
    const entries = areaEntries(documentFixture(), 'town');
    expect(filterEntries(entries, 'npc', '  ALICE  ').map(entry => entry.id)).toEqual(['town-friend']);
    expect(filterEntries(entries, 'all', '  CHAIR-ONE  ').map(entry => entry.id)).toEqual(['chair-one']);
    expect(filterEntries(entries, 'facility', 'パン').map(entry => entry.id)).toEqual(['bakery']);
    expect(filterEntries(entries, 'interaction').map(entry => entry.id)).toEqual(['bakery-board', 'distant-reference']);
    expect(filterEntries(entries, 'interaction', 'Alice')).toEqual([]);
    expect(filterEntries(entries, 'all', 'Alice town')).toEqual([]);
    expect(filterEntries(entries, 'all', 'ない名前')).toEqual([]);
    expect(filterEntries(entries, 'all', '   ')).toEqual(entries);
  });

  it('画面と同じ施設・カタログ・従来家具の表示名を検索できる', () => {
    const document = documentFixture(), object = document.objects[1];
    expect(objectName(document.objects[0], document.facilities)).toBe('パンや');
    expect(objectName(object, document.facilities)).toBe('木のいす');
    const base: EditorObject = { ...object, catalogId: undefined };
    expect(objectName({ ...base, kind: 'tree', style: 'cherry' }, [])).toBe('桜');
    expect(objectName({ ...base, kind: 'desk' }, [])).toBe('学習づくえ');
    expect(objectName({ ...base, kind: 'unknown-kind' }, [])).toBe('unknown-kind');
    expect(filterEntries(areaEntries(document, 'town'), 'object', '木のいす').map(entry => entry.id)).toEqual(['chair-one']);
    expect(filterEntries(areaEntries(document, 'town'), 'portal', 'パンやの出入口').map(entry => entry.id)).toEqual(['bakery-door']);
  });

  it('参照対象の座標と関連する配置物を同じエリアから解決する', () => {
    const entries = new Map(areaEntries(documentFixture(), 'town').map(entry => [entry.key, entry]));
    expect(entries.get('facility:bakery')).toMatchObject({ objectId: 'bakery-building', bounds: { x: 2, y: 3, w: 6, h: 6 } });
    expect(entries.get('portal:bakery-door')).toMatchObject({ objectId: 'bakery-building', bounds: { x: 4, y: 9, w: 2, h: 1 } });
    expect(entries.get('interaction:bakery-board')).toMatchObject({ objectId: 'bakery-building', bounds: { x: 2, y: 3, w: 2, h: 1 } });
    expect(entries.get('facility:door-only')).toMatchObject({ bounds: { x: 15, y: 9, w: 1, h: 1 } });
    expect(entries.get('facility:door-only')?.objectId).toBeUndefined();
    expect(entries.get('interaction:distant-reference')?.objectId).toBeUndefined();
    expect(entries.get('facility:unplaced')?.bounds).toBeUndefined();
    expect(entries.get('npc:town-friend')).toMatchObject({ bounds: { x: 1, y: 1, w: 1, h: 1 } });
  });

  it('検索・絞り込みは文書を変更せず、記号を含む名前も文字列として扱う', () => {
    const document = documentFixture(), literal = '<img src=x onerror=alert(1)>';
    document.interactions[0].name = literal;
    const initial = structuredClone(document);
    freeze(document);
    const entries = areaEntries(document, 'town');
    freeze(entries);
    expect(filterEntries(entries, 'npc', '<IMG')[0].name).toBe(literal);
    expect(filterEntries(entries, 'object', 'いす')).toHaveLength(1);
    expect(document).toEqual(initial);
    expect(entries).toHaveLength(10);
  });

  it('実ワールドの編集・Undo/Redo・エリア変更後にも現在の名前を検索する', () => {
    const model = new WorldEditorModel(buildWorld()), before = model.document;
    model.updateNpc('home-mother', { name: '検索で見つける名前' }, HOME_AREA);
    expect(filterEntries(areaEntries(model.document, HOME_AREA), 'npc', '検索で見つける名前').map(entry => entry.id)).toEqual(['home-mother']);
    expect(filterEntries(areaEntries(model.document, 'town-main'), 'npc', '検索で見つける名前')).toEqual([]);
    model.session.undo();
    expect(filterEntries(areaEntries(model.document, HOME_AREA), 'npc', '検索で見つける名前')).toEqual([]);
    expect(model.document).toEqual(before);
    model.session.redo();
    expect(filterEntries(areaEntries(model.document, HOME_AREA), 'npc', '検索で見つける名前')).toHaveLength(1);
    const dirty = model.dirty, snapshot = model.document;
    filterEntries(areaEntries(model.document, HOME_AREA), 'all', 'no-result');
    expect(model.dirty).toBe(dirty);
    expect(model.document).toEqual(snapshot);
  }, 15000);
});
