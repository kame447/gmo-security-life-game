import type { AreaRuntime, World } from '../world';
import { TRAIN_NETWORK } from '../travel/network';
import type { GoalLocation, MinimapGoals, MinimapTarget } from './goals';
import type { MapPoint } from './model';

const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const center = (rect: { x: number; y: number; w?: number; h?: number }): MapPoint =>
  ({ x: rect.x + (rect.w ?? 1) / 2, y: rect.y + (rect.h ?? 1) / 2 });

function interaction(area: AreaRuntime, eventKey: string) {
  return area.interactions.filter(item => item.eventKey === eventKey).sort(byId)[0];
}

/** 有効な出入口と電車の接続をたどり、最初の入口・階段・乗り場を案内する。移動そのものは始めない。 */
function firstRoutePoint(world: World, start: AreaRuntime, destinations: ReadonlySet<string>): MapPoint | undefined {
  const visited = new Set([start.def.id]);
  const queue: { area: AreaRuntime; first?: MapPoint }[] = [{ area: start }];
  const railLinks = TRAIN_NETWORK.railLinks();
  for (let i = 0; i < queue.length; i++) {
    const { area, first } = queue[i];
    const portals = [...new Set(area.portalAt.values())].sort(byId);
    const routes = [
      ...portals.map(portal => ({ areaId: portal.to.areaId, from: center(portal.from) })),
      ...railLinks.filter(link => link.from.areaId === area.def.id).map(link => ({ areaId: link.to.areaId, from: center(link.from) })),
    ];
    for (const route of routes) {
      const next = world.areas.get(route.areaId);
      if (!next || visited.has(next.def.id)) continue;
      const entry = first ?? route.from;
      if (destinations.has(next.def.id)) return entry;
      visited.add(next.def.id);
      queue.push({ area: next, first: entry });
    }
  }
  return undefined;
}

function targetPoint(world: World, area: AreaRuntime, target: MinimapTarget, route: boolean): MapPoint | undefined {
  if ('eventKey' in target) {
    const person = interaction(area, target.eventKey);
    if (person) return center(person);
  } else if (target.areaIds.includes(area.def.id)) return undefined;
  if (!route) return undefined;
  const destinations = new Set('eventKey' in target
    ? [...world.areas.values()].filter(candidate => interaction(candidate, target.eventKey)).map(candidate => candidate.def.id)
    : target.areaIds);
  return firstRoutePoint(world, area, destinations);
}

/** 施設の図柄・名称は動かさず、目的地の印だけを実際の相手か次の出入口へ置き換える。 */
export function resolveGoalLocations(world: World, area: AreaRuntime, facilities: readonly GoalLocation[],
  goals: MinimapGoals | undefined): GoalLocation[] {
  if (!goals) return [];
  const active = new Set([...goals.pending, ...goals.done]);
  const pending = new Set(goals.pending);
  const locations = new Map(facilities.filter(point => active.has(point.id)).map(point => [point.id, point]));
  const seen = new Set<string>();
  for (const target of goals.targets ?? []) {
    if (!active.has(target.id) || seen.has(target.id)) continue;
    seen.add(target.id);
    // 済んだ別エリアの用事で、今いる部屋の出口にチェックを並べない。
    const point = targetPoint(world, area, target, pending.has(target.id) || locations.has(target.id));
    if (point) locations.set(target.id, { id: target.id, ...point });
  }
  return [...locations.values()];
}
