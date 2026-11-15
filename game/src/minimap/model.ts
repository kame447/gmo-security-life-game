import { TILE } from '../core/coords';
import type { FacilityDef, FacilityKind } from '../core/types';
import type { PlayerPosition } from '../map/explorer';
import { buildingRepresentativeColor } from '../render/building-colors';
import type { AreaRuntime } from '../world';
import { T } from '../world/tiles';

/** Rendering categories are derived from the live area's ground and collision data. */
export const MAP_CELL = {
  void: 0, grass: 1, road: 2, path: 3, water: 4, floor: 5, blocked: 6, building: 7, portal: 8,
} as const;
export type MapCell = (typeof MAP_CELL)[keyof typeof MAP_CELL];

export interface AreaMap {
  readonly areaId: string;
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly colors: readonly string[];
  readonly markers: readonly FacilityMarker[];
}

export interface FacilityMarker {
  readonly id: string;
  readonly name: string;
  readonly kind: FacilityKind | 'facility';
  readonly x: number;
  readonly y: number;
}

const COLORS = ['#232e31', '#82aa6f', '#848d8b', '#d5caac', '#5091a6', '#d0b48c', '#45614f', '#986753', '#f8d66e'];
const ROADS = new Set<number>([T.ASPHALT, T.LANE_H, T.LANE_V, T.ZEBRA_H, T.ZEBRA_V, T.CROSSING]);
const PATHS = new Set<number>([T.SIDEWALK, T.PLAZA, T.BRIDGE, T.DIRT, T.PARKPATH, T.SAND, T.PARKING]);
const FLOORS = new Set<number>([T.FLOOR_WOOD, T.FLOOR_TATAMI, T.FLOOR_CLASS, T.MAT]);

export function buildAreaMap(area: AreaRuntime, facilities: Iterable<FacilityDef> = []): AreaMap {
  const { width, height } = area;
  const buildings: (string | undefined)[] = new Array(width * height);
  for (const object of area.objects) {
    const color = buildingRepresentativeColor(object);
    if (!object.solid || !color) continue;
    for (let y = Math.max(0, object.y); y < Math.min(height, object.y + object.h); y++) {
      for (let x = Math.max(0, object.x); x < Math.min(width, object.x + object.w); x++) buildings[y * width + x] = color;
    }
  }
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) {
    const tile = area.ground[i];
    if (area.portalAt.has(i)) cells[i] = MAP_CELL.portal;
    else if (tile === T.VOID) cells[i] = MAP_CELL.void;
    else if (tile === T.WATER) cells[i] = MAP_CELL.water;
    else if (area.solid[i]) cells[i] = buildings[i] ? MAP_CELL.building : MAP_CELL.blocked;
    else if (ROADS.has(tile)) cells[i] = MAP_CELL.road;
    else if (PATHS.has(tile)) cells[i] = MAP_CELL.path;
    else if (FLOORS.has(tile)) cells[i] = MAP_CELL.floor;
    else cells[i] = MAP_CELL.grass;
  }
  const colors = Array.from(cells, (cell, i) => cell === MAP_CELL.building ? buildings[i]! : COLORS[cell]);
  const markers: FacilityMarker[] = [];
  for (const facility of facilities) {
    if (facility.areaId !== area.def.id) continue;
    const object = area.objects.find(item => item.facilityId === facility.id);
    if (!object) continue;
    markers.push({ id: facility.id, name: facility.name, kind: facility.kind ?? 'facility',
      x: object.x + object.w / 2, y: object.y + object.h / 2 });
  }
  return { areaId: area.def.id, width, height, cells, colors, markers };
}

/** A different runtime object is rebuilt even if it happens to reuse an area ID. */
export class AreaMapCache {
  private readonly cache = new WeakMap<AreaRuntime, AreaMap>();
  constructor(private readonly facilities: ReadonlyMap<string, FacilityDef> = new Map()) {}

  get(area: AreaRuntime): AreaMap {
    let map = this.cache.get(area);
    if (!map) { map = buildAreaMap(area, this.facilities.values()); this.cache.set(area, map); }
    return map;
  }
}

export interface MapProjection { scale: number; left: number; top: number }
export interface MapPoint { x: number; y: number }

/** The player's position is the foot position, consistent with exploration collision. */
export function playerMapPoint(player: PlayerPosition): MapPoint {
  return { x: player.x / TILE, y: (player.y - 4) / TILE };
}

export function fitProjection(mapWidth: number, mapHeight: number, canvasWidth: number, canvasHeight: number, padding: number): MapProjection {
  const scale = Math.min((canvasWidth - 2 * padding) / mapWidth, (canvasHeight - 2 * padding) / mapHeight);
  return { scale, left: (canvasWidth - mapWidth * scale) / 2, top: (canvasHeight - mapHeight * scale) / 2 };
}

/** The local view follows the player; small rooms can use more space than a town. */
export function localProjection(mapWidth: number, mapHeight: number, canvasWidth: number, canvasHeight: number, center: MapPoint): MapProjection {
  const scale = Math.max(canvasWidth / 32, Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight));
  return { scale, left: canvasWidth / 2 - center.x * scale, top: canvasHeight / 2 - center.y * scale };
}

export function projectPoint(projection: MapProjection, point: MapPoint): MapPoint {
  return { x: projection.left + point.x * projection.scale, y: projection.top + point.y * projection.scale };
}
