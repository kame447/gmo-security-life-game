import { describe, expect, it } from 'vitest';
import { clerkEvents } from '../src/app/clerk-events';
import type { AreaDef, InteractionDef, MapEventSink, ObjectDef } from '../src/core/types';
import { feetAtTile, type Facing } from '../src/core/coords';
import { Game } from '../src/session/game';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { ModalPanels } from '../src/ui/modal-panels';
import { buildWorld } from '../src/world';
import { toRuntime, type World } from '../src/world/runtime';
import { T } from '../src/world/tiles';

const world = buildWorld();

function setupClerkSession(customWorld: World = world) {
  let sink: MapEventSink | undefined, flow: ClerkFlow | undefined;
  const game = new Game(customWorld, { sink: { onMapEvent: event => sink?.onMapEvent(event) } });
  const modals = new ModalPanels(() => !!game.dialog, () => {});
  const panel = { get isOpen() { return !!flow && flow.phase !== 'closed'; }, handleKey() {} };
  modals.register({ id: 'shop', panel });
  sink = clerkEvents(game, { openPanel: (id, open) => modals.open(id, open) }, context => {
    flow = new ClerkFlow(context.catalog, context.greeting, game.assets);
  });
  return { game, modals, getFlow: () => flow };
}

function buildTestRoom(objects: ObjectDef[], interactions: InteractionDef[], groundOverrides: Array<[number, number, number]> = []): World {
  const width = 9, height = 9;
  const ground = new Uint8Array(width * height).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) ground[y * width + x] = T.WALL;
  }
  for (const [x, y, tile] of groundOverrides) ground[y * width + x] = tile;
  const def: AreaDef = { id: 'test-shop-interior', name: 'テスト商店', kind: 'indoor', width, height, ground, objects, portals: [], interactions };
  return {
    areas: new Map([[def.id, toRuntime(def)]]),
    facilities: new Map(),
    start: { areaId: def.id, x: 1, y: 1, facing: 'down' },
    variant: { id: 'childhood', stage: 'childhood' },
  };
}
describe('registered clerk conversation integration', () => {
  it('opens the original indoor greeting as a modal, then returns to that room after purchase', () => {
    let sink: MapEventSink | undefined, flow: ClerkFlow | undefined;
    const game = new Game(world, { sink: { onMapEvent: event => sink?.onMapEvent(event) } });
    const modals = new ModalPanels(() => !!game.dialog, () => {});
    const panel = { get isOpen() { return !!flow && flow.phase !== 'closed'; }, handleKey() {} };
    modals.register({ id: 'shop', panel });
    sink = clerkEvents(game, { openPanel: (id, open) => modals.open(id, open) }, context => { flow = new ClerkFlow(context.catalog, context.greeting, game.assets); });
    game.player = { areaId: 'shop-konbini-interior', ...feetAtTile(10, 2), facing: 'down' };
    const before = { ...game.player };
    const original = game.facingInteraction()!;
    game.action();
    expect(modals.mode).toBe('shop'); expect(game.dialog).toBeNull();
    expect(flow!.phase).toBe('greeting'); expect(flow!.greetingLine).toBe(original.lines[0]);
    expect(modals.open('shop', () => {})).toBe(false);
    expect(modals.open('phone', () => {})).toBe(false);
    flow!.advanceGreeting(); flow!.chooseBuy(); flow!.reviewPurchase(); flow!.confirmPurchase();
    flow!.close();
    expect(modals.mode).toBe('explore'); expect(game.player).toEqual(before);
    expect(game.assets.quantity('bottled-water')).toBe(1);
  });
  it('keeps the shelf and outdoor targets on their original dialog path', () => {
    const game = new Game(world);
    const handler = clerkEvents(game, { openPanel: () => { throw Error('must not open'); } }, () => {});
    for (const [areaId, x, y, facing, id, key] of [
      ['shop-konbini-interior', 2, 5, 'up', 'konbini-snacks', 'shopping.konbini.snacks'],
      ['town-main', 48, 54, 'up', 'candy-shopkeeper', 'shopping.candy'],
      ['town-main', 50, 54, 'up', 'shopping-vending', 'shopping.vending'],
    ] as const) {
      game.player = { areaId, ...feetAtTile(x, y), facing };
      expect(handler.onMapEvent({ type: 'interact', areaId, interactionId: id, eventKey: key })).toBeUndefined();
    }
  });
});

describe('across-counter clerk interaction', () => {
  it('reaches the konbini clerk from across the counter (10,5 facing up) and opens the shop modal', () => {
    const { game, modals, getFlow } = setupClerkSession();
    game.player = { areaId: 'shop-konbini-interior', ...feetAtTile(10, 5), facing: 'up' };
    const before = { ...game.player };
    const target = game.facingInteraction();
    expect(target?.id).toBe('konbini-clerk');
    game.action();
    const flow = getFlow()!;
    expect(modals.mode).toBe('shop');
    expect(game.dialog).toBeNull();
    expect(flow.phase).toBe('greeting');
    expect(flow.greetingLine).toBe(target!.lines[0]);
    flow.advanceGreeting(); flow.chooseBuy(); flow.reviewPurchase(); flow.confirmPurchase();
    flow.close();
    expect(modals.mode).toBe('explore');
    expect(game.player).toEqual(before);
    expect(game.assets.quantity('bottled-water')).toBe(1);
  });

  it('keeps side and rear adjacent clerk conversations working as before', () => {
    for (const [x, y, facing] of [
      [9, 3, 'right'],
      [11, 3, 'left'],
      [10, 2, 'down'],
    ] as const) {
      const { game, modals, getFlow } = setupClerkSession();
      game.player = { areaId: 'shop-konbini-interior', ...feetAtTile(x, y), facing };
      expect(game.facingInteraction()?.id).toBe('konbini-clerk');
      game.action();
      expect(modals.mode).toBe('shop');
      expect(getFlow()!.phase).toBe('greeting');
    }
  });

  it('does not reach the konbini clerk diagonally across the counter or when facing away', () => {
    const { game, modals } = setupClerkSession();
    for (const [x, y, facing] of [
      [9, 5, 'up'],
      [11, 5, 'up'],
      [10, 5, 'down'],
      [10, 5, 'left'],
      [10, 5, 'right'],
    ] as [number, number, Facing][]) {
      game.player = { areaId: 'shop-konbini-interior', ...feetAtTile(x, y), facing };
      expect(game.facingInteraction()).toBeUndefined();
      game.action();
      expect(modals.mode).toBe('explore');
      expect(game.dialog).toBeNull();
    }
  });

  it('works generically in arbitrary enclosed-counter shop layouts from all four directions', () => {
    const clerk: InteractionDef = {
      id: 'generic-clerk', kind: 'npc', name: 'パンやさん', x: 4, y: 4, sprite: 'shopkeeper',
      facing: 'down', solid: true, eventKey: 'shopping.bakery.clerk', lines: ['やききたての パンだよ。'],
    };
    const counters: ObjectDef[] = [
      { id: 'c-top', kind: 'counter', x: 3, y: 3, w: 3, h: 1, solid: true },
      { id: 'c-bottom', kind: 'counter', x: 3, y: 5, w: 3, h: 1, solid: true },
      { id: 'c-left', kind: 'counter', x: 3, y: 4, w: 1, h: 1, solid: true },
      { id: 'c-right', kind: 'counter', x: 5, y: 4, w: 1, h: 1, solid: true },
    ];
    const game = new Game(buildTestRoom(counters, [clerk]));
    for (const [x, y, facing] of [
      [4, 6, 'up'],
      [4, 2, 'down'],
      [2, 4, 'right'],
      [6, 4, 'left'],
    ] as const) {
      game.player = { areaId: 'test-shop-interior', ...feetAtTile(x, y), facing };
      expect(game.facingInteraction()?.id).toBe('generic-clerk');
      game.dialog = null;
      game.action();
      expect(game.dialog).toEqual({ speaker: 'パンやさん', lines: ['やききたての パンだよ。'], index: 0 });
    }
  });

  it('blocks across-tile talk through walls, other furniture, empty gaps, double counters, or overlapping obstacles', () => {
    const npc = (x: number, y: number, id = 'blocked-npc'): InteractionDef => ({
      id, kind: 'npc', name: '店員', x, y, sprite: 'clerk', solid: true, eventKey: `test.${id}`, lines: ['こんにちは。'],
    });

    // Wall tile between player (2,4) and NPC (2,2)
    const wallGame = new Game(buildTestRoom([], [npc(2, 2)], [[2, 3, T.WALL]]));
    wallGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(wallGame.facingInteraction()).toBeUndefined();

    // Another solid object (shopshelf, desk) between player and NPC
    const shelfGame = new Game(buildTestRoom(
      [{ id: 'shelf', kind: 'shopshelf', x: 2, y: 3, w: 1, h: 1, solid: true }],
      [npc(2, 2)],
    ));
    shelfGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(shelfGame.facingInteraction()).toBeUndefined();

    // Empty walkable tile between player and NPC
    const gapGame = new Game(buildTestRoom([], [npc(2, 2)]));
    gapGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(gapGame.facingInteraction()).toBeUndefined();

    // Two-tile-thick counter between player (2,5) and NPC (2,2)
    const thickGame = new Game(buildTestRoom(
      [{ id: 'thick-counter', kind: 'counter', x: 2, y: 3, w: 1, h: 2, solid: true }],
      [npc(2, 2)],
    ));
    thickGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 5), facing: 'up' };
    expect(thickGame.facingInteraction()).toBeUndefined();

    // Counter overlapping a wall or another solid object
    const overlappedGame = new Game(buildTestRoom(
      [
        { id: 'overlap-counter', kind: 'counter', x: 2, y: 3, w: 1, h: 1, solid: true },
        { id: 'overlap-pillar', kind: 'shopshelf', x: 2, y: 3, w: 1, h: 1, solid: true },
      ],
      [npc(2, 2)],
    ));
    overlappedGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(overlappedGame.facingInteraction()).toBeUndefined();

    const wallCounterGame = new Game(buildTestRoom(
      [{ id: 'wall-counter', kind: 'counter', x: 2, y: 3, w: 1, h: 1, solid: true }],
      [npc(2, 2)],
      [[2, 3, T.WALL_TOP]],
    ));
    wallCounterGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(wallCounterGame.facingInteraction()).toBeUndefined();
  });

  it('preserves counter self-interactions, ignores non-NPCs behind counters, and keeps other NPC/object checks intact', () => {
    const counterNote: InteractionDef = {
      id: 'counter-note', kind: 'object', name: 'レジだい', x: 2, y: 3, solid: true,
      eventKey: 'test.counter', lines: ['レジスターが おいてある。'],
    };
    const backShelf: InteractionDef = {
      id: 'back-shelf', kind: 'object', name: 'うらのたな', x: 4, y: 2, solid: true,
      eventKey: 'test.backshelf', lines: ['おくの たなだ。'],
    };
    const clerkBehindNote: InteractionDef = {
      id: 'clerk-behind', kind: 'npc', name: 'てんいん', x: 2, y: 2, sprite: 'clerk', solid: true,
      eventKey: 'test.clerk', lines: ['いらっしゃい。'],
    };
    const roomGame = new Game(buildTestRoom(
      [{ id: 'cnt', kind: 'counter', x: 2, y: 3, w: 3, h: 1, solid: true }],
      [counterNote, clerkBehindNote, backShelf],
    ));
    // Direct interaction on the counter itself wins over reaching across it.
    roomGame.player = { areaId: 'test-shop-interior', ...feetAtTile(2, 4), facing: 'up' };
    expect(roomGame.facingInteraction()?.id).toBe('counter-note');
    // Non-NPC behind an uninteractable counter tile is not reached across the counter.
    roomGame.player = { areaId: 'test-shop-interior', ...feetAtTile(4, 4), facing: 'up' };
    expect(roomGame.facingInteraction()).toBeUndefined();

    // Existing home/classroom/konbini interactions remain intact.
    const { game } = setupClerkSession();
    game.player = { areaId: 'home-family-interior', ...feetAtTile(5, 9), facing: 'up' };
    expect(game.facingInteraction()?.id).toBe('home-tablet');
    game.player = { areaId: 'home-family-interior', ...feetAtTile(12, 4), facing: 'right' };
    expect(game.facingInteraction()?.id).toBe('home-mother');
    game.player = { areaId: 'shop-konbini-interior', ...feetAtTile(2, 5), facing: 'up' };
    expect(game.facingInteraction()?.id).toBe('konbini-snacks');
  });
});
