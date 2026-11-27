import type { PortalDef } from '../core/types';
import type { AreaRuntime, World } from '../world';
import type { GoalLocation, MinimapGoals, MinimapTarget } from './goals';
import type { MapPoint } from './model';

const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const center = (rect: { x: number; y: number; w?: number; h?: number }): MapPoint =>
  ({ x: rect.x + (rect.w ?? 1) / 2, y: rect.y + (rect.h ?? 1) / 2 });

function interaction(area: AreaRuntime, eventKey: string) {
  return area.interactions.filter(item => item.eventKey === eventKey).sort(byId)[0];
}

/** 有効な出入口だけをたどり、最少のエリア移動で目的地へ向かう最初の入口・階段を返す。 */
function firstPortal(world: World, start: AreaRuntime, destinations: ReadonlySet<string>): PortalDef | undefined {
  const visited = new Set([start.def.id]);
  const queue: { area: AreaRuntime; first?: PortalDef }[] = [{ area: start }];
  for (let i = 0; i < queue.length; i++) {
    const { area, first } = queue[i];
    const portals = [...new Set(area.portalAt.values())].sort(byId);
    for (const portal of portals) {
      const next = world.areas.get(portal.to.areaId);
      if (!next || visited.has(next.def.id)) continue;
      const entry = first ?? portal;
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
  const portal = firstPortal(world, area, destinations);
  return portal && center(portal.from);
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
