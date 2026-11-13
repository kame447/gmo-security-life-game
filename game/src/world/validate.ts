import { inside, isSolidTile, neighbors, type AreaRuntime, type World } from './runtime';

type TileRect = { x: number; y: number; w?: number; h?: number };

export interface RailPoint { readonly areaId: string; readonly x: number; readonly y: number }
/** Directed, explicitly confirmed travel; these links never create automatic portals. */
export interface RailLink { readonly from: RailPoint; readonly to: RailPoint }
export interface WorldValidationOptions { readonly railLinks?: readonly RailLink[] }

/** Validate definitions and flood the portal graph from the actual starting point. */
export function validateWorld(world: World, options: WorldValidationOptions = {}): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const id = (value: string) => {
    if (ids.has(value)) errors.push(`Duplicate ID: ${value}`);
    ids.add(value);
  };
  const reference = (value: string | undefined, owner: string) => {
    if (value && !world.facilities.has(value)) errors.push(`Unknown facility ${value}: ${owner}`);
  };
  const bounds = (area: AreaRuntime, r: TileRect, owner: string) => {
    const w = r.w ?? 1, h = r.h ?? 1;
    const valid = inside(area, r.x, r.y) && Number.isInteger(w) && Number.isInteger(h) &&
      w >= 1 && h >= 1 && inside(area, r.x + w - 1, r.y + h - 1);
    if (!valid) errors.push(`Out of bounds: ${owner}`);
  };

  for (const f of world.facilities.values()) {
    id(f.id);
    if (!world.areas.has(f.areaId)) errors.push(`Unknown area ${f.areaId}: ${f.id}`);
  }
  for (const [areaId, a] of world.areas) {
    id(a.def.id);
    if (areaId !== a.def.id) errors.push(`Area key mismatch: ${areaId}`);
    if (a.ground.length !== a.width * a.height || a.solid.length !== a.width * a.height) errors.push(`Invalid layer size: ${areaId}`);
    for (const d of a.def.districts ?? []) { id(d.id); bounds(a, d, d.id); }
    for (const o of a.objects) {
      if (o.id) id(o.id);
      bounds(a, o, o.id ?? o.kind);
      reference(o.facilityId, o.id ?? o.kind);
    }
    for (const i of a.interactions) { id(i.id); bounds(a, i, i.id); }
    for (const p of a.def.portals) {
      id(p.id);
      bounds(a, p.from, p.id);
      reference(p.facilityId, p.id);
      const target = world.areas.get(p.to.areaId);
      if (!target) errors.push(`Unknown destination ${p.to.areaId}: ${p.id}`);
      else if (isSolidTile(target, p.to.x, p.to.y)) errors.push(`Solid destination: ${p.id}`);
    }
  }

  const start = world.areas.get(world.start.areaId);
  if (!start || isSolidTile(start, world.start.x, world.start.y)) {
    errors.push('Invalid or solid starting point');
    return errors;
  }
  const validLinks: RailLink[] = [];
  for (const [index, link] of (options.railLinks ?? []).entries()) {
    let valid = true;
    for (const [side, point] of [['from', link.from], ['to', link.to]] as const) {
      const area = world.areas.get(point.areaId);
      const owner = `railLinks[${index}].${side}`;
      if (!area) { errors.push(`Unknown rail area ${point.areaId}: ${owner}`); valid = false; }
      else if (!inside(area, point.x, point.y)) { errors.push(`Out of bounds rail point: ${owner}`); valid = false; }
      else if (isSolidTile(area, point.x, point.y)) { errors.push(`Solid rail point: ${owner}`); valid = false; }
    }
    if (valid) validLinks.push(link);
  }
  const reached = reachableTiles(world, validLinks);
  for (const [areaId, a] of world.areas) {
    const seen = reached.get(areaId)!;
    for (const p of a.def.portals) {
      const doorTiles = Array.from({ length: p.from.w ?? 1 }, (_, dx) => p.from.y * a.width + p.from.x + dx);
      if (!doorTiles.some(i => seen.has(i))) errors.push(`Unreachable portal: ${p.id}`);
    }
    for (const i of a.interactions) {
      if (!isAccessible(a, i, seen)) errors.push(`Unreachable interaction: ${i.id}`);
    }
  }
  return errors;
}

/** Flood fill from the start, following portals into other areas. */
function reachableTiles(world: World, railLinks: readonly RailLink[]): Map<string, Set<number>> {
  const reached = new Map([...world.areas].map(([key]) => [key, new Set<number>()]));
  const departures = new Map<string, RailPoint[]>();
  for (const link of railLinks) {
    const key = `${link.from.areaId}:${link.from.x}:${link.from.y}`;
    const targets = departures.get(key) ?? [];
    targets.push(link.to); departures.set(key, targets);
  }
  const queue: { areaId: string; x: number; y: number }[] = [];
  const visit = (areaId: string, x: number, y: number) => {
    const a = world.areas.get(areaId), seen = reached.get(areaId);
    if (!a || !seen || isSolidTile(a, x, y)) return;
    const index = y * a.width + x;
    if (seen.has(index)) return;
    seen.add(index);
    queue.push({ areaId, x, y });
  };
  visit(world.start.areaId, world.start.x, world.start.y);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], a = world.areas.get(p.areaId)!;
    const door = a.portalAt.get(p.y * a.width + p.x);
    if (door) {
      visit(door.to.areaId, door.to.x, door.to.y);
      continue; // Normal movement enters the portal before any further walking or action.
    }
    for (const n of neighbors(p)) visit(p.areaId, n.x, n.y);
    for (const to of departures.get(`${p.areaId}:${p.x}:${p.y}`) ?? []) visit(to.areaId, to.x, to.y);
  }
  return reached;
}

/** An interaction is usable when a reached walkable tile touches any of its tiles. */
function isAccessible(a: AreaRuntime, r: TileRect, seen: Set<number>): boolean {
  for (let dy = 0; dy < (r.h ?? 1); dy++) {
    for (let dx = 0; dx < (r.w ?? 1); dx++) {
      for (const n of neighbors({ x: r.x + dx, y: r.y + dy })) {
        const tile = n.y * a.width + n.x;
        if (inside(a, n.x, n.y) && !isSolidTile(a, n.x, n.y) && !a.portalAt.has(tile) && seen.has(tile)) return true;
      }
    }
  }
  return false;
}
