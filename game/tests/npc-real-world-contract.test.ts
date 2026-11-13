/**
 * #25 tests-first contract, ee756d5. No real-world writer or NPC editor changes.
 * Main uses the live World. Station/store fixtures are NPC-only captures of the
 * fixed revisions below, not replacement maps or evidence of full map validation.
 * No git refs, external network or other branches are required to run this suite.
 */
import { describe, expect, it } from 'vitest';
import type { AreaDef, DistrictDef, InteractionDef, VariantDef } from '../src/core/types';
import { assembleEditorWorld } from '../src/editor/runtime';
import { validateDocument } from '../src/editor/schema';
import type { EditorDocument } from '../src/editor/types';
import { referenceScene } from '../src/editor-ui/map/reference';
import { buildWorld, type World } from '../src/world';
import { districtAt, toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

interface CapturedArea {
  id: string; name: string; kind: 'indoor' | 'outdoor'; width: number; height: number;
  districts?: DistrictDef[];
  npcs: { npc: InteractionDef; collision: { x: number; y: number; solid: number; interactionId: string }[] }[];
}
interface StoreReference {
  storeId: string; interiorAreaId: string; entrancePortalId: string; clerkEventKey: string; catalogId: string;
}
interface Capture {
  variant: VariantDef; start: World['start']; areas: CapturedArea[]; stores?: StoreReference[];
}
// Runtime capture 7fe30ce8e40b34c29ed530deaca8d41013126903; area/collision context only, terrain is not captured.
const STATION: Capture = {
  variant: {"id": "childhood", "stage": "childhood", "edgeMessage": "きょうは このあたりを たんけんしよう。"},
  start: {"areaId": "town-main", "x": 35, "y": 32, "facing": "down"},
  areas: [
    {"id": "town-main", "name": "いつものまち", "kind": "outdoor", "width": 128, "height": 96, "districts": [{"id": "town-residential-west", "name": "じゅうたくがい", "x": 0, "y": 0, "w": 84, "h": 41}, {"id": "town-center", "name": "えきまえ・しょうてんがい", "x": 0, "y": 41, "w": 84, "h": 55}, {"id": "town-school-north", "name": "がっこうのまわり", "x": 84, "y": 0, "w": 44, "h": 42}, {"id": "town-riverside-park", "name": "かわぞいこうえん", "x": 84, "y": 42, "w": 44, "h": 38}], "npcs": [{"npc": {"id": "neighbor-grandma", "kind": "npc", "name": "きんじょのおばあさん", "x": 40, "y": 33, "sprite": "grandma", "facing": "left", "solid": true, "eventKey": "neighborhood.grandma", "lines": ["おかえり。きょうも がっこう、たのしかった？"]}, "collision": [{"x": 40, "y": 33, "solid": 1, "interactionId": "neighbor-grandma"}]}, {"npc": {"id": "neighborhood-cat", "kind": "npc", "name": "ねこ", "x": 42, "y": 36, "sprite": "cat", "facing": "down", "solid": true, "eventKey": "neighborhood.cat", "lines": ["にゃあ。ひなたで のんびりしている。"]}, "collision": [{"x": 42, "y": 36, "solid": 1, "interactionId": "neighborhood-cat"}]}, {"npc": {"id": "school-guard", "kind": "npc", "name": "みまもりのひと", "x": 104, "y": 36, "sprite": "guard", "facing": "left", "solid": true, "eventKey": "school.guard", "lines": ["おはよう！ くるまを よくみて わたろうね。"]}, "collision": [{"x": 104, "y": 36, "solid": 1, "interactionId": "school-guard"}]}, {"npc": {"id": "park-friend", "kind": "npc", "name": "ともだち", "x": 100, "y": 61, "sprite": "friend", "facing": "left", "solid": true, "eventKey": "park.friend", "lines": ["いっしょに あそぼう！ なにして あそぶ？"]}, "collision": [{"x": 100, "y": 61, "solid": 1, "interactionId": "park-friend"}]}, {"npc": {"id": "candy-shopkeeper", "kind": "npc", "name": "だがしやさん", "x": 48, "y": 53, "sprite": "shopkeeper", "facing": "down", "solid": true, "eventKey": "shopping.candy", "lines": ["いらっしゃい。きょうの おやつは どれにする？"]}, "collision": [{"x": 48, "y": 53, "solid": 1, "interactionId": "candy-shopkeeper"}]}, {"npc": {"id": "station-staff", "kind": "npc", "name": "えきいんさん", "x": 32, "y": 90, "sprite": "staff", "facing": "left", "solid": true, "eventKey": "station.staff", "lines": ["でんしゃは もうすぐ くるよ。きいろい せんの うちがわで まってね。"]}, "collision": [{"x": 32, "y": 90, "solid": 1, "interactionId": "station-staff"}]}]},
    {"id": "home-family-interior", "name": "じぶんのいえ", "kind": "indoor", "width": 16, "height": 12, "npcs": [{"npc": {"id": "home-mother", "kind": "npc", "name": "おかあさん", "x": 13, "y": 4, "sprite": "mother", "facing": "left", "solid": true, "eventKey": "home.mother", "lines": ["おかえり！ てを あらったら、おやつにしよう。"]}, "collision": [{"x": 13, "y": 4, "solid": 1, "interactionId": "home-mother"}]}]},
    {"id": "school-classroom-interior", "name": "きょうしつ", "kind": "indoor", "width": 18, "height": 12, "npcs": [{"npc": {"id": "school-teacher", "kind": "npc", "name": "せんせい", "x": 10, "y": 2, "sprite": "teacher", "facing": "down", "solid": true, "eventKey": "school.teacher", "lines": ["おはよう。きょうも いろんなことを みつけようね。"]}, "collision": [{"x": 10, "y": 2, "solid": 1, "interactionId": "school-teacher"}]}, {"npc": {"id": "school-classmate", "kind": "npc", "name": "クラスのともだち", "x": 12, "y": 6, "sprite": "classmate", "facing": "left", "solid": true, "eventKey": "school.classmate", "lines": ["ほうかご、こうえんで あそぼうよ！"]}, "collision": [{"x": 12, "y": 6, "solid": 1, "interactionId": "school-classmate"}]}]},
    {"id": "shop-konbini-interior", "name": "コンビニ", "kind": "indoor", "width": 14, "height": 10, "npcs": [{"npc": {"id": "konbini-clerk", "kind": "npc", "name": "てんいんさん", "x": 10, "y": 3, "sprite": "clerk", "facing": "left", "solid": true, "eventKey": "shopping.konbini.clerk", "lines": ["いらっしゃいませ。おやつも のみものも あるよ。ゆっくり みてね。"]}, "collision": [{"x": 10, "y": 3, "solid": 1, "interactionId": "konbini-clerk"}]}]},
    {"id": "town-neighbor", "name": "となりまち", "kind": "outdoor", "width": 48, "height": 52, "districts": [{"id": "neighbor-station-district", "name": "えきまえ", "x": 0, "y": 36, "w": 37, "h": 16}, {"id": "neighbor-river-district", "name": "かわべ", "x": 0, "y": 0, "w": 48, "h": 36}, {"id": "neighbor-east-district", "name": "はしのむこう", "x": 37, "y": 36, "w": 11, "h": 16}], "npcs": [{"npc": {"id": "neighbor-town-friend", "kind": "npc", "name": "まちのひと", "x": 31, "y": 24, "sprite": "friend", "facing": "down", "solid": true, "eventKey": "neighbor.friend", "lines": ["こんにちは。ここからも でんしゃに のれるよ。"]}, "collision": [{"x": 31, "y": 24, "solid": 1, "interactionId": "neighbor-town-friend"}]}]},
  ],
};

// Runtime capture bed878f3248bae0167c76b0437994a9705ba3a0a; area/collision context only, terrain is not captured.
const STORES: Capture = {
  variant: {"id": "childhood", "stage": "childhood", "edgeMessage": "きょうは このあたりを たんけんしよう。"},
  start: {"areaId": "town-main", "x": 35, "y": 32, "facing": "down"},
  areas: [
    {"id": "town-main", "name": "いつものまち", "kind": "outdoor", "width": 128, "height": 80, "districts": [{"id": "town-residential-west", "name": "じゅうたくがい", "x": 0, "y": 0, "w": 84, "h": 41}, {"id": "town-center", "name": "えきまえ・しょうてんがい", "x": 0, "y": 41, "w": 84, "h": 39}, {"id": "town-school-north", "name": "がっこうのまわり", "x": 84, "y": 0, "w": 44, "h": 42}, {"id": "town-riverside-park", "name": "かわぞいこうえん", "x": 84, "y": 42, "w": 44, "h": 38}], "npcs": [{"npc": {"id": "neighbor-grandma", "kind": "npc", "name": "きんじょのおばあさん", "x": 40, "y": 33, "sprite": "grandma", "facing": "left", "solid": true, "eventKey": "neighborhood.grandma", "lines": ["おかえり。きょうも がっこう、たのしかった？"]}, "collision": [{"x": 40, "y": 33, "solid": 1, "interactionId": "neighbor-grandma"}]}, {"npc": {"id": "neighborhood-cat", "kind": "npc", "name": "ねこ", "x": 42, "y": 36, "sprite": "cat", "facing": "down", "solid": true, "eventKey": "neighborhood.cat", "lines": ["にゃあ。ひなたで のんびりしている。"]}, "collision": [{"x": 42, "y": 36, "solid": 1, "interactionId": "neighborhood-cat"}]}, {"npc": {"id": "school-guard", "kind": "npc", "name": "みまもりのひと", "x": 104, "y": 36, "sprite": "guard", "facing": "left", "solid": true, "eventKey": "school.guard", "lines": ["おはよう！ くるまを よくみて わたろうね。"]}, "collision": [{"x": 104, "y": 36, "solid": 1, "interactionId": "school-guard"}]}, {"npc": {"id": "park-friend", "kind": "npc", "name": "ともだち", "x": 100, "y": 61, "sprite": "friend", "facing": "left", "solid": true, "eventKey": "park.friend", "lines": ["いっしょに あそぼう！ なにして あそぶ？"]}, "collision": [{"x": 100, "y": 61, "solid": 1, "interactionId": "park-friend"}]}, {"npc": {"id": "candy-shopkeeper", "kind": "npc", "name": "だがしやさん", "x": 48, "y": 53, "sprite": "shopkeeper", "facing": "down", "solid": true, "eventKey": "shopping.candy", "lines": ["いらっしゃい。きょうの おやつは どれにする？"]}, "collision": [{"x": 48, "y": 53, "solid": 1, "interactionId": "candy-shopkeeper"}]}, {"npc": {"id": "station-staff", "kind": "npc", "name": "えきいんさん", "x": 32, "y": 65, "sprite": "staff", "facing": "left", "solid": true, "eventKey": "station.staff", "lines": ["でんしゃは もうすぐ くるよ。きいろい せんの うちがわで まってね。"]}, "collision": [{"x": 32, "y": 65, "solid": 1, "interactionId": "station-staff"}]}]},
    {"id": "home-family-interior", "name": "じぶんのいえ", "kind": "indoor", "width": 16, "height": 12, "npcs": [{"npc": {"id": "home-mother", "kind": "npc", "name": "おかあさん", "x": 13, "y": 4, "sprite": "mother", "facing": "left", "solid": true, "eventKey": "home.mother", "lines": ["おかえり！ てを あらったら、おやつにしよう。"]}, "collision": [{"x": 13, "y": 4, "solid": 1, "interactionId": "home-mother"}]}]},
    {"id": "school-classroom-interior", "name": "きょうしつ", "kind": "indoor", "width": 18, "height": 12, "npcs": [{"npc": {"id": "school-teacher", "kind": "npc", "name": "せんせい", "x": 10, "y": 2, "sprite": "teacher", "facing": "down", "solid": true, "eventKey": "school.teacher", "lines": ["おはよう。きょうも いろんなことを みつけようね。"]}, "collision": [{"x": 10, "y": 2, "solid": 1, "interactionId": "school-teacher"}]}, {"npc": {"id": "school-classmate", "kind": "npc", "name": "クラスのともだち", "x": 12, "y": 6, "sprite": "classmate", "facing": "left", "solid": true, "eventKey": "school.classmate", "lines": ["ほうかご、こうえんで あそぼうよ！"]}, "collision": [{"x": 12, "y": 6, "solid": 1, "interactionId": "school-classmate"}]}]},
    {"id": "shop-konbini-interior", "name": "コンビニ", "kind": "indoor", "width": 14, "height": 10, "npcs": [{"npc": {"id": "konbini-clerk", "kind": "npc", "name": "てんいんさん", "x": 10, "y": 3, "sprite": "clerk", "facing": "left", "solid": true, "eventKey": "shopping.konbini.clerk", "lines": ["いらっしゃいませ。おやつも のみものも あるよ。ゆっくり みてね。"]}, "collision": [{"x": 10, "y": 3, "solid": 1, "interactionId": "konbini-clerk"}]}]},
    {"id": "shop-greengrocer-interior", "name": "やおや", "kind": "indoor", "width": 16, "height": 12, "npcs": [{"npc": {"id": "greengrocer-indoor-clerk", "kind": "npc", "name": "やおやさん", "x": 11, "y": 3, "sprite": "shopkeeper", "facing": "down", "solid": true, "eventKey": "shopping.greengrocer.clerk", "lines": ["いらっしゃい。やさいを ゆっくり みていってね。"]}, "collision": [{"x": 11, "y": 3, "solid": 1, "interactionId": "greengrocer-indoor-clerk"}]}]},
    {"id": "shop-bookstore-interior", "name": "ほんや", "kind": "indoor", "width": 18, "height": 12, "npcs": [{"npc": {"id": "bookstore-indoor-clerk", "kind": "npc", "name": "ほんやさん", "x": 13, "y": 3, "sprite": "clerk", "facing": "down", "solid": true, "eventKey": "shopping.bookstore.clerk", "lines": ["いらっしゃいませ。どんな ほんを さがしているの？"]}, "collision": [{"x": 13, "y": 3, "solid": 1, "interactionId": "bookstore-indoor-clerk"}]}]},
    {"id": "shop-candy-interior", "name": "だがしや", "kind": "indoor", "width": 14, "height": 10, "npcs": [{"npc": {"id": "candy-indoor-clerk", "kind": "npc", "name": "おっちゃん", "x": 10, "y": 3, "sprite": "shopkeeper", "facing": "down", "solid": true, "eventKey": "shopping.candy.clerk", "lines": ["いらっしゃい。きょうも よく きたね。"]}, "collision": [{"x": 10, "y": 3, "solid": 1, "interactionId": "candy-indoor-clerk"}]}]},
    {"id": "shop-bakery-interior", "name": "パンや", "kind": "indoor", "width": 16, "height": 12, "npcs": [{"npc": {"id": "bakery-indoor-clerk", "kind": "npc", "name": "パンやさん", "x": 11, "y": 3, "sprite": "clerk", "facing": "down", "solid": true, "eventKey": "shopping.bakery.clerk", "lines": ["いらっしゃいませ。パンを みていってね。"]}, "collision": [{"x": 11, "y": 3, "solid": 1, "interactionId": "bakery-indoor-clerk"}]}]},
    {"id": "shop-cafe-interior", "name": "きっさてん", "kind": "indoor", "width": 18, "height": 14, "npcs": [{"npc": {"id": "cafe-indoor-clerk", "kind": "npc", "name": "てんいんさん", "x": 13, "y": 3, "sprite": "clerk", "facing": "down", "solid": true, "eventKey": "shopping.cafe.clerk", "lines": ["いらっしゃいませ。どうぞ ゆっくり していってね。"]}, "collision": [{"x": 13, "y": 3, "solid": 1, "interactionId": "cafe-indoor-clerk"}]}]},
    {"id": "shop-pharmacy-interior", "name": "くすりや", "kind": "indoor", "width": 16, "height": 12, "npcs": [{"npc": {"id": "pharmacy-indoor-clerk", "kind": "npc", "name": "くすりやさん", "x": 11, "y": 3, "sprite": "clerk", "facing": "down", "solid": true, "eventKey": "shopping.pharmacy.clerk", "lines": ["いらっしゃいませ。なにか おさがしですか？"]}, "collision": [{"x": 11, "y": 3, "solid": 1, "interactionId": "pharmacy-indoor-clerk"}]}]},
  ],
  stores: [
    {"storeId": "shop-konbini", "interiorAreaId": "shop-konbini-interior", "entrancePortalId": "konbini-enter", "clerkEventKey": "shopping.konbini.clerk", "catalogId": "konbini"},
    {"storeId": "shop-greengrocer", "interiorAreaId": "shop-greengrocer-interior", "entrancePortalId": "greengrocer-enter", "clerkEventKey": "shopping.greengrocer.clerk", "catalogId": "greengrocer"},
    {"storeId": "shop-bookstore", "interiorAreaId": "shop-bookstore-interior", "entrancePortalId": "bookstore-enter", "clerkEventKey": "shopping.bookstore.clerk", "catalogId": "bookstore"},
    {"storeId": "shop-candy", "interiorAreaId": "shop-candy-interior", "entrancePortalId": "candy-enter", "clerkEventKey": "shopping.candy.clerk", "catalogId": "candy"},
    {"storeId": "shop-bakery", "interiorAreaId": "shop-bakery-interior", "entrancePortalId": "bakery-enter", "clerkEventKey": "shopping.bakery.clerk", "catalogId": "bakery"},
    {"storeId": "shop-cafe", "interiorAreaId": "shop-cafe-interior", "entrancePortalId": "cafe-enter", "clerkEventKey": "shopping.cafe.clerk", "catalogId": "cafe"},
    {"storeId": "shop-pharmacy", "interiorAreaId": "shop-pharmacy-interior", "entrancePortalId": "pharmacy-enter", "clerkEventKey": "shopping.pharmacy.clerk", "catalogId": "pharmacy"},
  ],
};

/** Rebuild only the recorded NPC slice on neutral terrain; never validate it as the source map. */
function capturedNpcWorld(capture: Capture): World {
  const areas = new Map(capture.areas.map(area => {
    const def: AreaDef = { id: area.id, name: area.name, kind: area.kind, width: area.width, height: area.height,
      ground: new Uint8Array(area.width * area.height).fill(T.GRASS), objects: [], portals: [],
      interactions: area.npcs.map(row => structuredClone(row.npc)),
      ...(area.districts ? { districts: structuredClone(area.districts) } : {}) };
    return [area.id, toRuntime(def)] as const;
  }));
  return { areas, facilities: new Map(), start: structuredClone(capture.start), variant: structuredClone(capture.variant) };
}

/** This is the current display projection plus the required document header, not a safe apply path. */
function rawDocument(world: World): EditorDocument {
  const scene = referenceScene(world);
  return { schemaVersion: 1, id: world.variant.id, tileSize: 16, start: structuredClone(world.start),
    catalogs: { sprites: [...new Set(scene.interactions.flatMap(npc => npc.sprite ? [npc.sprite] : []))],
      eventKeys: [...new Set(scene.interactions.map(npc => npc.eventKey))] }, ...scene };
}
function rawRoundTrip(world: World): World {
  return assembleEditorWorld(JSON.parse(JSON.stringify(rawDocument(world))));
}
function rows(world: World) {
  return [...world.areas.values()].flatMap(area => area.interactions.filter(npc => npc.kind === 'npc').map(npc => ({
    areaId: area.def.id, npc: structuredClone(npc),
    collision: Array.from({ length: npc.h ?? 1 }, (_, dy) => Array.from({ length: npc.w ?? 1 }, (_, dx) => {
      const x = npc.x + dx, y = npc.y + dy, cell = y * area.width + x;
      return { x, y, solid: area.solid[cell], interactionId: area.interactionAt.get(cell)?.id };
    })).flat(),
  }))).sort((a, b) => a.npc.id.localeCompare(b.npc.id));
}
function districts(world: World) {
  return [...world.areas.values()].filter(area => area.def.districts).map(area => ({ areaId: area.def.id, districts: area.def.districts }));
}
const worlds = [
  { label: 'main live World', make: () => buildWorld(), minimum: 10 },
  { label: 'station 7fe30ce NPC capture', make: () => capturedNpcWorld(STATION), minimum: 11 },
  { label: 'stores bed878f NPC capture', make: () => capturedNpcWorld(STORES), minimum: 16 },
];

for (const { label, make, minimum } of worlds) describe(label, () => {
  it('records every NPC, stable IDs, dialogue/event references and runtime collision lookups', () => {
    const source = make(), before = rows(source);
    expect(before.length).toBeGreaterThanOrEqual(minimum);
    expect(new Set(before.map(row => row.npc.id)).size).toBe(before.length);
    for (const row of before) {
      expect(row.npc.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(row.npc.name).not.toBe(''); expect(row.npc.sprite).toBeTruthy(); expect(row.npc.facing).toBeTruthy();
      expect(row.npc.eventKey).toBeTruthy(); expect(row.npc.lines.length).toBeGreaterThan(0);
      expect(row.collision.every(cell => cell.interactionId === row.npc.id && cell.solid === Number(row.npc.solid))).toBe(true);
    }
    expect(rows(rawRoundTrip(source))).toEqual(before);
    expect(rows(source)).toEqual(before);
  });
  it('accepts each unchanged NPC with strict validation in an explicitly isolated context', () => {
    // No map overlap/rail exceptions. This proves NPC field acceptance only.
    for (const row of rows(make())) {
      const area = make().areas.get(row.areaId)!;
      const npc = row.npc;
      const isolated: EditorDocument = { schemaVersion: 1, id: 'npc-contract-isolation', tileSize: 16,
        start: { areaId: row.areaId, x: npc.x > 0 ? npc.x - 1 : npc.x + (npc.w ?? 1), y: npc.y, facing: 'down' },
        catalogs: { sprites: [npc.sprite!], eventKeys: [npc.eventKey] },
        areas: [{ id: row.areaId, name: area.def.name, kind: area.def.kind, width: area.width, height: area.height,
          ground: Array(area.width * area.height).fill(T.GRASS) }],
        facilities: [], objects: [], portals: [], interactions: [{ ...npc, areaId: row.areaId }] };
      expect(validateDocument(isolated)).toEqual([]);
      const unknownSprite = structuredClone(isolated); unknownSprite.interactions[0].sprite = 'undeclared-sprite';
      expect(validateDocument(unknownSprite).some(issue => issue.code === 'reference')).toBe(true);
    }
  });
  it('identifies the missing metadata before recording expected failures', () => {
    const source = make(), restored = rawRoundTrip(source);
    expect(districts(source).length).toBeGreaterThan(0);
    expect(source.variant.edgeMessage).toBeTruthy();
    expect(districts(restored)).toEqual([]);
    expect(restored.variant.edgeMessage).toBeUndefined();
  });
  // Deliberate contract gaps in ee756d5, not skip/todo or a false full-world acceptance.
  // After a common metadata contract is approved, convert these into ordinary assertions.
  it.fails('EXPECTED GAP: preserves the original area districts through the current document', () => {
    const source = make(); expect(districts(rawRoundTrip(source))).toEqual(districts(source));
  });
  it.fails('EXPECTED GAP: preserves the whole source variant rather than id and fixed childhood stage', () => {
    const source = make(); expect(rawRoundTrip(source).variant).toEqual(source.variant);
  });
});

describe('source captures and store/NPC binding', () => {
  it.each([STATION, STORES])('matches every recorded footprint before exercising the projection', capture => {
    const world = capturedNpcWorld(capture);
    for (const area of capture.areas) for (const record of area.npcs) {
      expect(rows(world).find(row => row.areaId === area.id && row.npc.id === record.npc.id)?.collision).toEqual(record.collision);
    }
  });
  it('keeps station-specific area membership and the moved staff coordinates', () => {
    const world = rawRoundTrip(capturedNpcWorld(STATION));
    expect(rows(world).find(row => row.npc.id === 'station-staff')).toMatchObject({ areaId: 'town-main', npc: { x: 32, y: 90 } });
    expect(rows(world).find(row => row.npc.id === 'neighbor-town-friend')).toMatchObject({ areaId: 'town-neighbor', npc: { x: 31, y: 24 } });
    // District membership can be resolved in the source, but is a gap after reconstruction.
    expect(districtAt(capturedNpcWorld(STATION).areas.get('town-neighbor')!, 31, 24)?.id).toBe('neighbor-river-district');
  });
  it('retains all seven shopping.<id>.clerk joins without inferring stores from display names', () => {
    const original = capturedNpcWorld(STORES), restored = rawRoundTrip(original);
    const contacts = STORES.stores!;
    expect(contacts.length).toBe(7); expect(new Set(contacts.map(store => store.storeId)).size).toBe(7);
    for (const store of contacts) {
      const match = rows(restored).filter(row => row.areaId === store.interiorAreaId && row.npc.eventKey === store.clerkEventKey);
      expect(match.length).toBe(1);
      expect(match[0]).toEqual(rows(original).find(row => row.areaId === store.interiorAreaId && row.npc.eventKey === store.clerkEventKey));
      expect(store.clerkEventKey).toBe(`shopping.${store.catalogId}.clerk`);
      const referenceEnvelope = JSON.parse(JSON.stringify({ storeReference: store, npc: match[0] }));
      expect(referenceEnvelope.storeReference).toEqual(store);
    }
    const outdoorCandy = rows(restored).find(row => row.npc.id === 'candy-shopkeeper')!;
    expect(outdoorCandy.npc.eventKey).toBe('shopping.candy');
    expect(contacts.some(store => store.interiorAreaId === outdoorCandy.areaId && store.clerkEventKey === outdoorCandy.npc.eventKey)).toBe(false);
  });
});
