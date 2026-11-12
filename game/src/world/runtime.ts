import type { AreaDef, DistrictDef, FacilityDef, InteractionDef, ObjectDef, PortalDef, SpawnPoint, VariantDef } from '../core/types';
import { isSolidGround } from './tiles';

/** 年代差分を適用し、衝突・出入口・調査対象をタイル索引にした実行時のエリア。 */
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

export type Point = { x: number; y: number };
type TileRect = { x: number; y: number; w?: number; h?: number };

export const inside = (a: { width: number; height: number }, x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < a.width && y < a.height;

export const neighbors = (p: Point): Point[] => [
  { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y },
];

export function isSolidTile(area: AreaRuntime, tx: number, ty: number): boolean {
  return !inside(area, tx, ty) || area.solid[ty * area.width + tx] !== 0;
}

export function districtAt(area: AreaRuntime, tx: number, ty: number): DistrictDef | undefined {
  return area.def.districts?.find(d => tx >= d.x && ty >= d.y && tx < d.x + d.w && ty < d.y + d.h);
}

/** 差分適用済みの定義から、衝突レイヤーと出入口・調査対象のタイル索引を組み立てる。 */
export function toRuntime(def: AreaDef): AreaRuntime {
  const a: AreaRuntime = {
    def, width: def.width, height: def.height, ground: def.ground,
    solid: Uint8Array.from(def.ground, t => isSolidGround(t) ? 1 : 0),
    portalAt: new Map(), interactionAt: new Map(), objects: def.objects, interactions: def.interactions,
  };
  const occupy = (o: TileRect, fn: (index: number) => void) => {
    for (let dy = 0; dy < (o.h ?? 1); dy++) {
      for (let dx = 0; dx < (o.w ?? 1); dx++) {
        if (inside(a, o.x + dx, o.y + dy)) fn((o.y + dy) * a.width + o.x + dx);
      }
    }
  };
  for (const o of a.objects) if (o.solid) occupy(o, i => { a.solid[i] = 1; });
  for (const o of a.interactions) occupy(o, i => { a.interactionAt.set(i, o); if (o.solid) a.solid[i] = 1; });
  // Carve active doors last. A disabled door retains its building/wall collision.
  for (const p of def.portals) occupy(p.from, i => { a.portalAt.set(i, p); a.solid[i] = 0; });
  return a;
}
