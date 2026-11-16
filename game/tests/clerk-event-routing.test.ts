/// <reference types="vite/client" />
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import mainSource from '../src/main.ts?raw';
import { clerkEvents } from '../src/app/clerk-events';
import { feetAtTile } from '../src/core/coords';
import type { MapEvent, MapEventSink } from '../src/core/types';
import { STORE_CONTACTS } from '../src/data/stores';
import { LifeEventDirector } from '../src/events/director';
import type { LifeEventDef } from '../src/events/life-events';
import { canStand } from '../src/map/explorer';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

/** Exercise the real bootstrap's routing expression, rather than duplicating its ordering in this test. */
function bootstrapRoute(shop: MapEventSink, life: LifeEventDirector): MapEventSink['onMapEvent'] {
  const ast = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true);
  let expression = '';
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'onMapEvent' && node.initializer.getText(ast).includes('shopEvents')) expression = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); expect(expression).not.toBe('');
  return new Function('shopEvents', 'lifeEvents', `return (${expression});`)(shop, life);
}
function setup(defs: LifeEventDef[]) {
  const life = new LifeEventDirector(defs), open = vi.fn();
  let route: MapEventSink['onMapEvent'];
  const game = new Game(buildWorld(), { sink: { onMapEvent: event => route(event) } });
  const store = STORE_CONTACTS[0], area = game.world.areas.get(store.interiorAreaId)!;
  const clerk = area.interactions.find(i => i.kind === 'npc' && i.eventKey === store.clerkEventKey)!;
  let found = false;
  for (let y = 0; y < area.height && !found; y++) for (let x = 0; x < area.width && !found; x++) {
    const p = feetAtTile(x, y); if (!canStand(area, p.x, p.y)) continue;
    for (const facing of ['up', 'right', 'down', 'left'] as const) {
      game.player = { areaId: area.def.id, ...p, facing };
      if (game.facingInteraction()?.id === clerk.id) { found = true; break; }
    }
  }
  expect(found).toBe(true);
  const host = { openPanel: vi.fn((_id: string, action?: () => void) => { action?.(); return true; }) };
  route = bootstrapRoute(clerkEvents(game, host, open), life);
  return { game, life, host, open, route, event: { type: 'interact', areaId: area.def.id, interactionId: clerk.id, eventKey: clerk.eventKey } as MapEvent };
}
const def: LifeEventDef = {
  id: 'audit-clerk', title: 'テスト', category: 'daily', trigger: { eventKey: STORE_CONTACTS[0].clerkEventKey },
  intro: ['店員のイベント。'], effects: [{ kind: 'flag', flag: 'clerk-event' }],
};
describe('clerk life event arbitration in the real bootstrap', () => {
  it('delivers a matching one-time event before the shop, and allows shopping on the next visit', () => {
    const s = setup([def]); s.game.action();
    expect(s.life.state.experienced(def.id)).toBe(true); expect(s.life.state.flag('clerk-event')).toBe(true);
    expect(s.game.dialog?.lines).toEqual(def.intro); expect(s.open).not.toHaveBeenCalled();
    while (s.game.dialog) s.game.action();
    s.game.action(); expect(s.open).toHaveBeenCalledTimes(1);
  });
  it('keeps a matching choice pending without also opening the shop or applying hidden effects', () => {
    const choice = { ...def, effects: undefined, prompt: 'どうする？', choices: [
      { id: 'yes', label: 'はい', result: ['はい。'], effects: [{ kind: 'flag' as const, flag: 'chose-yes' }] },
      { id: 'no', label: 'いいえ', result: ['いいえ。'] },
    ] };
    const s = setup([choice]); s.game.action();
    expect(s.life.pending?.event.id).toBe(def.id); expect(s.open).not.toHaveBeenCalled();
    expect(s.life.state.flag('chose-yes')).toBe(false);
    expect(s.life.choose('yes')?.lines).toEqual(['はい。']); expect(s.life.state.flag('chose-yes')).toBe(true);
  });
  it('preserves shop opening when no life event matches and rejects unrelated interaction keys', () => {
    const s = setup([]); s.game.action(); expect(s.open).toHaveBeenCalledTimes(1);
    s.route({ ...s.event, eventKey: 'not-a-clerk' } as MapEvent);
    expect(s.open).toHaveBeenCalledTimes(1); expect(s.life.state.history).toEqual([]);
  });
});
