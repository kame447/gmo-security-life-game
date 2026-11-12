import type { AreaDef, DistrictDef, FacilityDef, InteractionDef, ObjectDef, PortalDef, SpawnPoint, VariantDef } from '../core/types';
import { isSolidGround } from './tiles';
import { createTown, FACILITIES, LANDMARKS } from './town';
import { createClassroom, createHome, createKonbini } from './interiors';

export { LANDMARKS };
export interface AreaRuntime {
  def: AreaDef;
  width: number;
  height: number;
  ground: Uint8Array;
  solid: Uint8Array;
  portalAt: Map<number, PortalDef>;
  interactionAt: Map<number, InteractionDef>;
  objects: ObjectDef[];
  interactions: InteractionDef[];
}
export interface World {
  areas: Map<string, AreaRuntime>;
  facilities: Map<string, FacilityDef>;
  start: SpawnPoint;
  variant: VariantDef;
}
export const CHILDHOOD_VARIANT: VariantDef = { id: 'childhood', stage: 'childhood' };
/** Fixed outdoor waypoints for real-input performance measurement, never timing claims. */
export const PERF_ROUTES: Record<string, { name: string; points: { x: number; y: number }[] }> = {
  straightRoad: { name: 'かんせんどうろのちょくせん', points: [{ x: 12, y: 39 }, { x: 78, y: 39 }] },
  corners: { name: 'じゅうたくがいのかど', points: [{ x: 29, y: 11 }, { x: 43, y: 11 }, { x: 43, y: 22 }, { x: 29, y: 22 }, { x: 29, y: 11 }, { x: 43, y: 11 }] },
  crosswalk: { name: 'こうさてんのおうだんほどう', points: [{ x: 25, y: 37 }, { x: 25, y: 41 }, { x: 29, y: 41 }, { x: 29, y: 37 }] },
  bridge: { name: 'かわをわたってがっこうへ', points: [{ x: 78, y: 39 }, { x: 94, y: 39 }, { ...LANDMARKS.schoolGate }] },
  footbridge: { name: 'ほこうしゃばしからこうえんへ', points: [{ x: 100, y: 41 }, { x: 100, y: 54 }, { ...LANDMARKS.parkPlaza }] },
  diagonalChunks: { name: 'いえからえきまえのチャンクきょうかい', points: [{ ...LANDMARKS.homeFront }, { x: 35, y: 39 }, { x: 29, y: 39 }, { x: 29, y: 58 }, { x: 46, y: 58 }, { x: 46, y: 65 }, { ...LANDMARKS.stationFront }] },
};
type Point = { x: number; y: number };
const inside = (a: { width: number; height: number }, x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < a.width && y < a.height;
const neighbors = (p: Point): Point[] => [{ x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }];

export function buildWorld(variant: VariantDef = CHILDHOOD_VARIANT): World {
  const facilities = new Map(FACILITIES.map(f => [f.id, { ...f, state: variant.facilityStates?.[f.id] ?? f.state }]));
  const areas = new Map<string, AreaRuntime>();
  for (const base of [createTown(), createHome(), createClassroom(), createKonbini()]) {
    const def: AreaDef = { ...base,
      portals: base.portals.filter(p => !variant.disabledPortals?.includes(p.id) && (!p.facilityId || facilities.get(p.facilityId)?.state !== 'closed')),
      interactions: [...base.interactions, ...(variant.extraInteractions?.[base.id] ?? [])].filter(i => !variant.disabledInteractions?.includes(i.id)),
    };
    const a: AreaRuntime = { def, width: def.width, height: def.height, ground: def.ground,
      solid: Uint8Array.from(def.ground, t => isSolidGround(t) ? 1 : 0),
      portalAt: new Map(), interactionAt: new Map(), objects: def.objects, interactions: def.interactions };
    const occupy = (o: { x: number; y: number; w?: number; h?: number }, fn: (index: number) => void) => {
      for (let dy = 0; dy < (o.h ?? 1); dy++) for (let dx = 0; dx < (o.w ?? 1); dx++) {
        if (inside(a, o.x + dx, o.y + dy)) fn((o.y + dy) * a.width + o.x + dx);
      }
    };
    for (const o of a.objects) if (o.solid) occupy(o, i => { a.solid[i] = 1; });
    for (const o of a.interactions) occupy(o, i => { a.interactionAt.set(i, o); if (o.solid) a.solid[i] = 1; });
    // Carve active doors last. A disabled door retains its building/wall collision.
    for (const p of def.portals) occupy(p.from, i => { a.portalAt.set(i, p); a.solid[i] = 0; });
    areas.set(def.id, a);
  }
  return { areas, facilities, start: { areaId: 'town-main', ...LANDMARKS.homeFront, facing: 'down' }, variant };
}

export function isSolidTile(area: AreaRuntime, tx: number, ty: number): boolean {
  return !inside(area, tx, ty) || area.solid[ty * area.width + tx] !== 0;
}

/** Four-neighbor BFS in tile coordinates; includes both endpoints. */
export function findPath(area: AreaRuntime, from: Point, to: Point): Point[] | null {
  if (isSolidTile(area, from.x, from.y) || isSolidTile(area, to.x, to.y)) return null;
  const first = from.y * area.width + from.x, goal = to.y * area.width + to.x;
  const previous = new Int32Array(area.width * area.height).fill(-1);
  const queue = [first]; previous[first] = first;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (index === goal) {
      const path: Point[] = [];
      for (let i = goal; ; i = previous[i]) {
        path.push({ x: i % area.width, y: Math.floor(i / area.width) });
        if (i === first) return path.reverse();
      }
    }
    for (const p of neighbors({ x: index % area.width, y: Math.floor(index / area.width) })) {
      if (isSolidTile(area, p.x, p.y)) continue;
      const i = p.y * area.width + p.x;
      if (previous[i] !== -1) continue;
      previous[i] = index; queue.push(i);
    }
  }
  return null;
}

export function districtAt(area: AreaRuntime, tx: number, ty: number): DistrictDef | undefined {
  return area.def.districts?.find(d => tx >= d.x && ty >= d.y && tx < d.x + d.w && ty < d.y + d.h);
}

/** Validate definitions and flood the portal graph from the actual starting point. */
export function validateWorld(world: World): string[] {
  const errors: string[] = [], ids = new Set<string>();
  const id = (value: string) => { if (ids.has(value)) errors.push(`Duplicate ID: ${value}`); ids.add(value); };
  const reference = (value: string | undefined, owner: string) => {
    if (value && !world.facilities.has(value)) errors.push(`Unknown facility ${value}: ${owner}`);
  };
  const bounds = (area: AreaRuntime, r: { x: number; y: number; w?: number; h?: number }, owner: string) => {
    if (!inside(area, r.x, r.y) || !Number.isInteger(r.w ?? 1) || !Number.isInteger(r.h ?? 1) || (r.w ?? 1) < 1 || (r.h ?? 1) < 1 || !inside(area, r.x + (r.w ?? 1) - 1, r.y + (r.h ?? 1) - 1)) errors.push(`Out of bounds: ${owner}`);
  };
  for (const f of world.facilities.values()) {
    id(f.id); if (!world.areas.has(f.areaId)) errors.push(`Unknown area ${f.areaId}: ${f.id}`);
  }
  for (const [areaId, a] of world.areas) {
    id(a.def.id);
    if (areaId !== a.def.id) errors.push(`Area key mismatch: ${areaId}`);
    if (a.ground.length !== a.width * a.height || a.solid.length !== a.width * a.height) errors.push(`Invalid layer size: ${areaId}`);
    for (const d of a.def.districts ?? []) { id(d.id); bounds(a, d, d.id); }
    for (const o of a.objects) { if (o.id) id(o.id); bounds(a, o, o.id ?? o.kind); reference(o.facilityId, o.id ?? o.kind); }
    for (const i of a.interactions) { id(i.id); bounds(a, i, i.id); }
    for (const p of a.def.portals) {
      id(p.id); bounds(a, p.from, p.id); reference(p.facilityId, p.id);
      const target = world.areas.get(p.to.areaId);
      if (!target) errors.push(`Unknown destination ${p.to.areaId}: ${p.id}`);
      else if (isSolidTile(target, p.to.x, p.to.y)) errors.push(`Solid destination: ${p.id}`);
    }
  }
  const start = world.areas.get(world.start.areaId);
  if (!start || isSolidTile(start, world.start.x, world.start.y)) {
    errors.push('Invalid or solid starting point'); return errors;
  }
  const reached = new Map([...world.areas].map(([key]) => [key, new Set<number>()]));
  const queue: { areaId: string; x: number; y: number }[] = [];
  const visit = (areaId: string, x: number, y: number) => {
    const a = world.areas.get(areaId), seen = reached.get(areaId);
    if (!a || !seen || isSolidTile(a, x, y)) return;
    const index = y * a.width + x;
    if (seen.has(index)) return;
    seen.add(index); queue.push({ areaId, x, y });
  };
  visit(world.start.areaId, world.start.x, world.start.y);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], a = world.areas.get(p.areaId)!;
    for (const n of neighbors(p)) visit(p.areaId, n.x, n.y);
    const door = a.portalAt.get(p.y * a.width + p.x);
    if (door) visit(door.to.areaId, door.to.x, door.to.y);
  }
  for (const [areaId, a] of world.areas) {
    const seen = reached.get(areaId)!;
    for (const p of a.def.portals) {
      if (!Array.from({ length: p.from.w ?? 1 }, (_, dx) => p.from.y * a.width + p.from.x + dx).some(i => seen.has(i))) errors.push(`Unreachable portal: ${p.id}`);
    }
    for (const i of a.interactions) {
      let accessible = false;
      for (let dy = 0; dy < (i.h ?? 1); dy++) for (let dx = 0; dx < (i.w ?? 1); dx++) {
        for (const n of neighbors({ x: i.x + dx, y: i.y + dy })) {
          if (inside(a, n.x, n.y) && !isSolidTile(a, n.x, n.y) && seen.has(n.y * a.width + n.x)) accessible = true;
        }
      }
      if (!accessible) errors.push(`Unreachable interaction: ${i.id}`);
    }
  }
  return errors;
}
