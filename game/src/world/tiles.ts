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
  /** ポイント（分岐）。W=駅の区間の西端、E=東端。N=北の行、S=南の行。上りの線が北の行へ斜めに寄る。 */
  SWITCH_W_S: 34,
  SWITCH_W_N: 35,
  SWITCH_E_N: 36,
  SWITCH_E_S: 37,
} as const;

export type TileId = (typeof T)[keyof typeof T];

const SOLID = new Set<number>([T.VOID, T.WATER, T.BANK, T.RAIL, T.FENCE, T.HEDGE, T.WALL, T.WALL_TOP,
  T.RAIL_BRIDGE, T.RAIL_FENCE, T.PLATFORM_EDGE, T.BOARDING_SIGN, T.CROSSING_SIGNAL,
  T.SWITCH_W_S, T.SWITCH_W_N, T.SWITCH_E_N, T.SWITCH_E_S]);
const ROAD = new Set<number>([T.ASPHALT, T.LANE_H, T.LANE_V, T.ZEBRA_H, T.ZEBRA_V]);

export const isSolidGround = (t: number): boolean => SOLID.has(t);
export const isRoad = (t: number): boolean => ROAD.has(t);
export const isSwitchGround = (t: number): boolean => t === T.SWITCH_W_S || t === T.SWITCH_W_N || t === T.SWITCH_E_N || t === T.SWITCH_E_S;
export const isRailGround = (t: number): boolean => t === T.RAIL || t === T.RAIL_BRIDGE || t === T.CROSSING || t === T.CROSSING_SIGNAL || isSwitchGround(t);
