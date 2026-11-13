/** 地面タイルID。値は保存データに含めない（マップは毎回データから組み立てる）。 */
export const T = {
  VOID: 0,
  GRASS: 1,
  ASPHALT: 2,
  LANE_H: 3,
  LANE_V: 4,
  ZEBRA_H: 5,
  ZEBRA_V: 6,
  SIDEWALK: 7,
  PLAZA: 8,
  WATER: 9,
  BANK: 10,
  BRIDGE: 11,
  DIRT: 12,
  PARKPATH: 13,
  RAIL: 14,
  CROSSING: 15,
  PLATFORM: 16,
  FENCE: 17,
  HEDGE: 18,
  FLOOR_WOOD: 19,
  FLOOR_TATAMI: 20,
  FLOOR_CLASS: 21,
  WALL: 22,
  WALL_TOP: 23,
  MAT: 24,
  SAND: 25,
  GARDEN: 26,
  PARKING: 27,
  RAIL_BRIDGE: 28,
  RAIL_FENCE: 29,
  TICKET_GATE: 30,
  PLATFORM_EDGE: 31,
  BOARDING_SIGN: 32,
  CROSSING_SIGNAL: 33,
} as const;

export type TileId = (typeof T)[keyof typeof T];

const SOLID = new Set<number>([T.VOID, T.WATER, T.BANK, T.RAIL, T.FENCE, T.HEDGE, T.WALL, T.WALL_TOP,
  T.RAIL_BRIDGE, T.RAIL_FENCE, T.PLATFORM_EDGE, T.BOARDING_SIGN, T.CROSSING_SIGNAL]);
const ROAD = new Set<number>([T.ASPHALT, T.LANE_H, T.LANE_V, T.ZEBRA_H, T.ZEBRA_V]);

export const isSolidGround = (t: number): boolean => SOLID.has(t);
export const isRoad = (t: number): boolean => ROAD.has(t);
export const isRailGround = (t: number): boolean => t === T.RAIL || t === T.RAIL_BRIDGE || t === T.CROSSING || t === T.CROSSING_SIGNAL;
