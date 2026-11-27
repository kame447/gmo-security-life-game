import { describe, expect, it } from 'vitest';
import type { InteractionDef, PortalDef } from '../src/core/types';
import { LifeEventDirector } from '../src/events/director';
import { layoutGoalMarks, type MinimapGoals } from '../src/minimap/goals';
import { buildAreaMap } from '../src/minimap/model';
import { resolveGoalLocations } from '../src/minimap/targets';
import { STORY_ERRANDS, STORY_HOME_FACILITY } from '../src/story/config';
import { StoryDirector } from '../src/story/director';
import { STORY_EVENTS } from '../src/story/events';
import { storyMapGoals } from '../src/story/map-goals';
import { newStoryState, type StoryPhase } from '../src/story/state';
import { buildWorld, CHILDHOOD_VARIANT, type World } from '../src/world';
import { toRuntime } from '../src/world/runtime';
import { T } from '../src/world/tiles';

function goal(id: string, eventKey: string, done = false): MinimapGoals {
  return { pending: done ? [] : [id], done: done ? [id] : [], targets: [{ id, eventKey }] };
}

function locations(world: World, areaId: string, goals: MinimapGoals | undefined) {
  const area = world.areas.get(areaId)!;
  return resolveGoalLocations(world, area, buildAreaMap(area, world.facilities.values()).markers, goals);
}

function story(phase: StoryPhase) {
  const saved = { ...newStoryState(), phase };
  if (phase !== 'meet-mother' && phase !== 'errands') saved.errandsDone = STORY_ERRANDS.map(errand => errand.id);
  return StoryDirector.resume(saved, new LifeEventDirector(STORY_EVENTS));
}

const npc = (id: string, x: number): InteractionDef =>
  ({ id, kind: 'npc', name: id, x, y: 3, solid: true, eventKey: 'person', lines: [] });
const portal = (id: string, to: string, x: number): PortalDef =>
  ({ id, from: { x, y: 1 }, to: { areaId: to, x: 2, y: 2, facing: 'down' } });
const sample = (id: string, portals: PortalDef[], interactions: InteractionDef[] = []) =>
  toRuntime({ id, name: id, kind: 'indoor', width: 12, height: 8, ground: new Uint8Array(96).fill(T.FLOOR_WOOD),
    objects: [], portals, interactions });

describe('goal locations from the active world', () => {
  it.each([
    ['station', 'station.staff'], ['park', 'park.friend'],
  ])('points to the outdoor %s person, rather than the facility center', (id, key) => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const person = town.interactions.find(item => item.eventKey === key)!;
    const building = buildAreaMap(town, world.facilities.values()).markers.find(marker => marker.id === id)!;
    const result = locations(world, 'town-main', goal(id, key));
    expect(result).toEqual([{ id, x: person.x + .5, y: person.y + .5 }]);
    expect([result[0].x, result[0].y]).not.toEqual([building.x, building.y]);
  });

  it.each([
    ['school', 'school.teacher', 'school-classroom-interior'],
    ['shop-konbini', 'shopping.konbini.clerk', 'shop-konbini-interior'],
  ])('guides through the %s entrance and then to its person', (id, key, insideId) => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const entrance = town.def.portals.find(item => item.to.areaId === insideId)!;
    expect(locations(world, 'town-main', goal(id, key))).toEqual([
      { id, x: entrance.from.x + (entrance.from.w ?? 1) / 2, y: entrance.from.y + .5 },
    ]);
    const inside = world.areas.get(insideId)!, person = inside.interactions.find(item => item.eventKey === key)!;
    expect(buildAreaMap(inside).markers).toEqual([]);
    expect(locations(world, insideId, goal(id, key))).toEqual([{ id, x: person.x + .5, y: person.y + .5 }]);
  });

  it('guides from upstairs to the mother and from downstairs to the bed', () => {
    const world = buildWorld(), id = STORY_HOME_FACILITY;
    expect(locations(world, 'home-family-2f', goal(id, 'home.mother'))).toEqual([{ id, x: 8.5, y: 1.5 }]);
    const mother = world.areas.get('home-family-interior')!.interactions.find(item => item.eventKey === 'home.mother')!;
    expect(locations(world, 'home-family-interior', goal(id, 'home.mother'))).toEqual([{ id, x: mother.x + .5, y: mother.y + .5 }]);
    expect(locations(world, 'home-family-interior', goal(id, 'home.bed'))).toEqual([{ id, x: 1.5, y: 1.5 }]);
    expect(locations(world, 'home-family-2f', goal(id, 'home.bed'))).toEqual([{ id, x: 2, y: 2.5 }]);
  });

  it('preserves completed status at the actual person and does not direct back to completed errands', () => {
    const world = buildWorld(), goals = goal('school', 'school.teacher', true);
    const points = locations(world, 'school-classroom-interior', goals);
    expect(layoutGoalMarks(points, goals, { scale: 2, left: 0, top: 0 }, 100, 100, 3))
      .toEqual([{ id: 'school', state: 'done', x: 21, y: 5, clamped: false }]);
    expect(locations(world, 'home-family-interior', goals)).toEqual([]);
  });

  it('uses live edited coordinates without changing facilities or interactions', () => {
    const world = buildWorld(), town = world.areas.get('town-main')!;
    const person = town.interactions.find(item => item.eventKey === 'station.staff')!;
    const goals = goal('station', person.eventKey), before = locations(world, 'town-main', goals)[0];
    person.x += 2;
    const actual = locations(world, 'town-main', goals)[0];
    expect(actual).toEqual({ ...before, x: before.x + 2 });
    expect(person.x).toBe(actual.x - .5);
  });

  it('falls back to a current-area facility for a missing person or disabled entrance', () => {
    const world = buildWorld({ ...CHILDHOOD_VARIANT, facilityStates: { school: 'closed' } });
    const town = world.areas.get('town-main')!, marker = buildAreaMap(town, world.facilities.values()).markers.find(item => item.id === 'school')!;
    expect(locations(world, 'town-main', goal('school', 'school.teacher'))).toEqual([marker]);
    expect(locations(world, 'town-main', goal('school', 'missing.person'))).toEqual([marker]);
    expect(locations(world, 'home-family-2f', goal('school', 'school.teacher'))).toEqual([]);
  });

  it('does not retain inactive or removed targets', () => {
    const world = buildWorld({ ...CHILDHOOD_VARIANT, disabledInteractions: ['station-staff'] });
    const goals = goal('station', 'station.staff');
    expect(locations(world, 'station-main-interior', goals)).toEqual([]);
    expect(locations(world, 'town-main', { ...goals, pending: [], done: [] })).toEqual([]);
    expect(locations(world, 'town-main', undefined)).toEqual([]);
  });

  it('chooses a shortest portal route despite cycles and ignores missing destinations', () => {
    const world = buildWorld();
    const start = sample('a', [portal('a-long', 'b', 1), portal('b-missing', 'missing', 2), portal('c-short', 'd', 3)]);
    world.areas = new Map([
      ['a', start], ['b', sample('b', [portal('cycle', 'a', 2), portal('long', 'c', 3)])],
      ['c', sample('c', [portal('end', 'e', 4)])], ['d', sample('d', [portal('short', 'e', 5)])],
      ['e', sample('e', [], [npc('person', 8)])],
    ]);
    expect(resolveGoalLocations(world, start, [], goal('destination', 'person'))).toEqual([{ id: 'destination', x: 3.5, y: 1.5 }]);
    const removed = start.def.portals.find(item => item.id === 'c-short')!;
    for (const [cell, value] of start.portalAt) if (value === removed) start.portalAt.delete(cell);
    expect(resolveGoalLocations(world, start, [], goal('destination', 'person'))).toEqual([{ id: 'destination', x: 1.5, y: 1.5 }]);
  });

  it('resolves duplicated event keys by stable interaction ID and prefers the current area', () => {
    const world = buildWorld(), area = sample('room', [], [npc('z-copy', 9), npc('a-person', 2)]);
    world.areas.set('room', area);
    world.areas.set('other', sample('other', [], [npc('0-other', 5)]));
    const goals = goal('destination', 'person');
    expect(resolveGoalLocations(world, area, [], goals)).toEqual([{ id: 'destination', x: 2.5, y: 3.5 }]);
    area.interactions.reverse();
    expect(resolveGoalLocations(world, area, [], goals)).toEqual([{ id: 'destination', x: 2.5, y: 3.5 }]);
  });
});

describe('story map presentation adapter', () => {
  it('adds the first mother destination without changing the director contract', () => {
    const current = story('meet-mother');
    expect(current.mapGoals()).toBeUndefined();
    expect(storyMapGoals(current)).toEqual({ pending: ['home-family'], done: [], targets: [{ id: 'home-family', eventKey: 'home.mother' }] });
    expect(storyMapGoals(undefined)).toBeUndefined();
  });

  it.each(['errands', 'return-home', 'milestone', 'stage'] as const)('preserves %s facility IDs and progress', phase => {
    const current = story(phase), before = current.save(), original = current.mapGoals()!;
    const presented = storyMapGoals(current)!;
    expect(presented.pending).toEqual(original.pending);
    expect(presented.done).toEqual(original.done);
    expect(current.save()).toEqual(before);
    expect(presented.targets?.length).toBeGreaterThan(0);
  });

  it('guides a stage place through its real entrance and removes goals after completion', () => {
    const current = story('stage'), world = buildWorld(), town = world.areas.get('town-main')!;
    const entrance = town.def.portals.find(item => item.to.areaId === 'school-classroom-interior')!;
    expect(locations(world, 'town-main', storyMapGoals(current)))
      .toEqual([{ id: 'school', x: entrance.from.x + (entrance.from.w ?? 1) / 2, y: entrance.from.y + .5 }]);
    expect(storyMapGoals(story('finished'))).toBeUndefined();
  });
});
