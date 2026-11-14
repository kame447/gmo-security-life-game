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
  /**
   * ポイント（分岐）。上りの線が北の行へ、3タイル（48px）かけてなめらかに寄って合流する。
   * W=駅の区間の西側（東へ進むほど北へ寄る）、E=東側（東へ進むほど南へ戻る）。S=南の行、N=北の行。A→B→C→D は
   * 斜めのレールが続く順（W は A が最も西、E は D が最も西）。
   */
  SWITCH_WS_A: 34,
  SWITCH_WS_B: 35,
  SWITCH_WN_C: 36,
  SWITCH_WN_D: 37,
  SWITCH_EN_D: 38,
  SWITCH_EN_C: 39,
  SWITCH_ES_B: 40,
  SWITCH_ES_A: 41,
  /** 柵で囲う線路の保護帯。歩けない地面と周囲の柵を同じ tile から導く。 */
  RAIL_GUARD: 42,
} as const;

export type TileId = (typeof T)[keyof typeof T];

const SOLID = new Set<number>([T.VOID, T.WATER, T.BANK, T.RAIL, T.FENCE, T.HEDGE, T.WALL, T.WALL_TOP,
  T.RAIL_BRIDGE, T.RAIL_FENCE, T.PLATFORM_EDGE, T.BOARDING_SIGN, T.CROSSING_SIGNAL,
  T.SWITCH_WS_A, T.SWITCH_WS_B, T.SWITCH_WN_C, T.SWITCH_WN_D, T.SWITCH_EN_D, T.SWITCH_EN_C, T.SWITCH_ES_B, T.SWITCH_ES_A, T.RAIL_GUARD]);
const ROAD = new Set<number>([T.ASPHALT, T.LANE_H, T.LANE_V, T.ZEBRA_H, T.ZEBRA_V]);

export const isSolidGround = (t: number): boolean => SOLID.has(t);
export const isRoad = (t: number): boolean => ROAD.has(t);
export const isSwitchGround = (t: number): boolean => t >= T.SWITCH_WS_A && t <= T.SWITCH_ES_A;
export const isRailGround = (t: number): boolean => t === T.RAIL || t === T.RAIL_BRIDGE || t === T.CROSSING || t === T.CROSSING_SIGNAL || isSwitchGround(t);
