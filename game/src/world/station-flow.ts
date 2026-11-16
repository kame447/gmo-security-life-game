import { headingOf, oppositeHeading, type RailDirection, type RailHeading } from './rail-geometry';

/**
 * 駅ごとの「改札 → ホーム → 乗車 → 発車／到着 → 下車 → 改札の外」の位置データ。#36（乗車）はここだけを読む。
 * 構内は単式ホーム1面・線路1本（北端、部屋の左右の端まで連続）。上りも下りも同じ線路・同じドアの tile を使い、
 * 列車の入ってくる側（arriveFrom）と出ていく側（heading）だけが違う。向きは rail-geometry.ts の定義から導く。
 * 他の world モジュールを import しない（landmarks・interiors・towns が、この値から座標を作る）。
 */
export interface InteriorStationLayout {
  readonly areaId: string;
  readonly width: number;
  readonly height: number;
  readonly northFenceY: number;
  /** 線路の行（1本）。 */
  readonly trackY: number;
  readonly platformTop: number;
  readonly platformBottom: number;
  readonly gateY: number;
  /** [0] は入場の列、[1] は出場の列。どちらも solid の操作対象で、歩いては通れない（乗車側が歩かせる）。 */
  readonly gateXs: readonly [number, number];
  /** 停車したときドアが揃う列。 */
  readonly doorX: number;
}

export interface StationPlatform {
  readonly id: string;
  readonly direction: RailDirection;
  /** のりばの案内（両方向で同じ）。ホームの tile 上の solid な操作対象。 */
  readonly sign: { readonly interactionId: string; readonly eventKey: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  readonly boardTile: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  /** 停車した車両のドアの tile（線路の行上）。両方向で同じ。 */
  readonly door: { readonly x: number; readonly y: number };
  /** ドアのホーム側の立ち位置。ここから線路の向きへ1歩進むと乗り込み。 */
  readonly doorFront: { readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  /** 線路の位置。x0 は左端、x1 は右端の次（排他）の tile。 */
  readonly track: { readonly y: number; readonly rows: 1; readonly x0: number; readonly x1: number };
  /** 発車して出ていく向きと、到着して入ってくる側。 */
  readonly heading: RailHeading;
  readonly arriveFrom: RailHeading;
}

export interface StationDirectionInfo { readonly heading: RailHeading; readonly arriveFrom: RailHeading }

export interface StationFlow {
  readonly stationId: string;
  readonly gate: {
    readonly areaId: string; readonly interactionId: string; readonly eventKey: string;
    /** 改札の2タイルの左端（w:2）。entryX が入場の列、exitX が出場の列。 */
    readonly tile: { readonly x: number; readonly y: number }; readonly w: 2; readonly entryX: number; readonly exitX: number;
    /** 入場前の位置（改札の入場の列の南）。 */
    readonly front: { readonly x: number; readonly y: number; readonly facing: 'up' };
    /** 改札のホーム側の1つ内側（出場の列）。ここは線路の tile ではなく、doorFront から真南へ歩いて着く。 */
    readonly inside: { readonly x: number; readonly y: number; readonly facing: 'up' };
    /** 出場のあと操作を戻す位置と向き。往路・帰路とも駅ごとに1つ。 */
    readonly outside: { readonly x: number; readonly y: number; readonly facing: 'down' };
  };
  /** gate.front / gate.outside と同じ（areaId つき）。 */
  readonly front: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' };
  readonly outside: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'down' };
  readonly platform: StationPlatform;
  readonly directions: Readonly<Record<RailDirection, StationDirectionInfo>>;
  /** 互換: 2要素（geometry は同一、direction・heading・arriveFrom だけ違う）。 */
  readonly platforms: readonly StationPlatform[];
  /** 降りた位置（= doorFront）。 */
  readonly alight: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'down' };
}

export const STATION_FLOW_LAYOUT: InteriorStationLayout = {
  areaId: 'station-main-interior', width: 36, height: 18,
  northFenceY: 2, trackY: 3, platformTop: 4, platformBottom: 9, gateY: 10, gateXs: [17, 18], doorX: 18,
};
export const NEIGHBOR_FLOW_LAYOUT: InteriorStationLayout = {
  areaId: 'station-neighbor-interior', width: 32, height: 16,
  northFenceY: 1, trackY: 2, platformTop: 3, platformBottom: 7, gateY: 8, gateXs: [6, 7], doorX: 16,
};

function platformsOf(layout: InteriorStationLayout, prefix: string, signId: string, eventKey: string): StationPlatform[] {
  const mk = (direction: RailDirection): StationPlatform => {
    const x = layout.doorX, frontY = layout.platformTop;
    return {
      id: `${prefix}-${direction}`, direction,
      // のりばの案内は、ドアへ歩く列を避けて横に置く。
      sign: { interactionId: signId, eventKey, x: x + 3, y: frontY, facing: 'up' },
      boardTile: { areaId: layout.areaId, x, y: frontY + 1, facing: 'up' },
      door: { x, y: layout.trackY },
      doorFront: { x, y: frontY, facing: 'up' },
      track: { y: layout.trackY, rows: 1, x0: 0, x1: layout.width },
      heading: headingOf(direction), arriveFrom: oppositeHeading(headingOf(direction)),
    };
  };
  return [mk('down'), mk('up')];
}

function flowOf(stationId: string, layout: InteriorStationLayout, platforms: StationPlatform[], interactionId: string, eventKey: string): StationFlow {
  const [entryX, exitX] = layout.gateXs, y = layout.gateY;
  const [down, up] = platforms;
  return {
    stationId,
    gate: { areaId: layout.areaId, interactionId, eventKey, tile: { x: entryX, y }, w: 2, entryX, exitX,
      front: { x: entryX, y: y + 1, facing: 'up' }, inside: { x: exitX, y: y - 1, facing: 'up' }, outside: { x: exitX, y: y + 1, facing: 'down' } },
    front: { areaId: layout.areaId, x: entryX, y: y + 1, facing: 'up' },
    outside: { areaId: layout.areaId, x: exitX, y: y + 1, facing: 'down' },
    platform: down,
    directions: { down: { heading: down.heading, arriveFrom: down.arriveFrom }, up: { heading: up.heading, arriveFrom: up.arriveFrom } },
    platforms,
    alight: { areaId: layout.areaId, x: layout.doorX, y: layout.platformTop, facing: 'down' },
  };
}

export const STATION_FLOW_PLATFORMS: readonly StationPlatform[] = platformsOf(STATION_FLOW_LAYOUT, 'main', 'station-boarding', 'travel.station.board');
export const NEIGHBOR_FLOW_PLATFORMS: readonly StationPlatform[] = platformsOf(NEIGHBOR_FLOW_LAYOUT, 'neighbor', 'neighbor-station-boarding', 'travel.station.board');

const flows: Readonly<Record<string, StationFlow>> = {
  station: flowOf('station', STATION_FLOW_LAYOUT, [...STATION_FLOW_PLATFORMS], 'station-ticket', 'station.ticket'),
  'station-neighbor': flowOf('station-neighbor', NEIGHBOR_FLOW_LAYOUT, [...NEIGHBOR_FLOW_PLATFORMS], 'neighbor-station-ticket', 'neighbor.station.ticket'),
};

export function getStationFlow(stationId: string): StationFlow {
  const flow = flows[stationId];
  if (!flow) throw new Error(`Unknown station: ${stationId}`);
  return flow;
}

export const STATION_FLOW_IDS: readonly string[] = Object.keys(flows);
