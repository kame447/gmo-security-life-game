import { describe, expect, it } from 'vitest';
import { clerkEvents } from '../src/app/clerk-events';
import type { MapEventSink } from '../src/core/types';
import { feetAtTile } from '../src/core/coords';
import { Game } from '../src/session/game';
import { ClerkFlow } from '../src/shop/clerk-flow';
import { ModalPanels } from '../src/ui/modal-panels';
import { buildWorld } from '../src/world';

const world = buildWorld();
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
