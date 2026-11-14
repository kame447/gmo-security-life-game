import { headingOf, oppositeHeading, trackRowOf, type RailDirection, type RailHeading } from './rail-geometry';

/**
 * 駅ごとの「改札 → ホーム → 乗車 → 発車／到着 → 下車」の位置データ。#36（乗車）はここだけを読む。
 * 構内は島式1面2線: 北の線が下り（右へ発車）、南の線が上り（左へ発車）。向きは rail-geometry.ts の定義から導く。
 * 他の world モジュールを import しない（landmarks・interiors・towns が、この値から座標を作る）。
 */
export interface InteriorStationLayout {
  readonly areaId: string;
  readonly width: number;
  readonly northFenceY: number;
  /** 下り線の行。直下に edge、その下がホーム。 */
  readonly downTrackY: number;
  readonly platformTop: number;
  readonly platformBottom: number;
  readonly upTrackY: number;
  readonly gateY: number;
  /** 改札の2タイル。どちらも solid な操作対象で、歩いては通れない（南側から上向きで入場、ホーム側から下向きで出場の操作をする）。構内通路は上り線を渡る。 */
  readonly gateXs: readonly [number, number];
}

export interface StationPlatform {
  readonly id: string;
  readonly direction: RailDirection;
  /** のりばの案内。ホームの tile 上の solid な操作対象。 */
  readonly sign: { readonly interactionId: string; readonly eventKey: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  readonly boardTile: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
  /** 停車した車両のドアの tile（線の行上）。 */
  readonly door: { readonly x: number; readonly y: number };
  /** この線の位置。x0 は左端、x1 は右端の次（排他）の tile。 */
  readonly track: { readonly y: number; readonly rows: 1; readonly x0: number; readonly x1: number };
  /** 発車して出ていく向きと、到着して入ってくる側。 */
  readonly heading: RailHeading;
  readonly arriveFrom: RailHeading;
}

export interface StationFlow {
  readonly stationId: string;
  readonly gate: { readonly areaId: string; readonly interactionId: string; readonly eventKey: string;
    readonly tile: { readonly x: number; readonly y: number }; readonly w: 2 };
  readonly platforms: readonly StationPlatform[];
  readonly alight: { readonly areaId: string; readonly x: number; readonly y: number; readonly facing: 'up' | 'down' };
}

export const STATION_FLOW_LAYOUT: InteriorStationLayout = {
  areaId: 'station-main-interior', width: 36,
  northFenceY: 2, downTrackY: 3, platformTop: 5, platformBottom: 8, upTrackY: 9, gateY: 10, gateXs: [17, 18],
};
export const NEIGHBOR_FLOW_LAYOUT: InteriorStationLayout = {
  areaId: 'station-neighbor-interior', width: 20,
  northFenceY: 1, downTrackY: 2, platformTop: 4, platformBottom: 6, upTrackY: 7, gateY: 8, gateXs: [9, 10],
};

function platformsOf(layout: InteriorStationLayout, prefix: string, ids: { down: string; up: string }, eventKey: string,
  columns: { down: number; up: number }): StationPlatform[] {
  const mk = (direction: RailDirection, x: number): StationPlatform => {
    const south = direction === 'up';
    const trackY = trackRowOf(layout.downTrackY, direction) + (direction === 'up' ? layout.upTrackY - layout.downTrackY - 1 : 0);
    const signY = south ? layout.platformBottom : layout.platformTop;
    const facing = south ? 'down' as const : 'up' as const;
    const board = south ? signY - 1 : signY + 1;
    return {
      id: `${prefix}-${direction}`, direction,
      sign: { interactionId: ids[direction], eventKey, x, y: signY, facing },
      boardTile: { areaId: layout.areaId, x, y: board, facing },
      door: { x, y: trackY },
      track: { y: trackY, rows: 1, x0: 1, x1: layout.width - 1 },
      heading: headingOf(direction), arriveFrom: oppositeHeading(headingOf(direction)),
    };
  };
  return [mk('down', columns.down), mk('up', columns.up)];
}

export const STATION_FLOW_PLATFORMS: readonly StationPlatform[] = platformsOf(STATION_FLOW_LAYOUT, 'main',
  { down: 'station-boarding', up: 'station-boarding-up' }, 'travel.station.board', { down: 12, up: 24 });
export const NEIGHBOR_FLOW_PLATFORMS: readonly StationPlatform[] = platformsOf(NEIGHBOR_FLOW_LAYOUT, 'neighbor',
  { down: 'neighbor-station-boarding', up: 'neighbor-station-boarding-up' }, 'travel.station.board', { down: 5, up: 14 });

const flows: Readonly<Record<string, StationFlow>> = {
  station: {
    stationId: 'station',
    gate: { areaId: STATION_FLOW_LAYOUT.areaId, interactionId: 'station-ticket', eventKey: 'station.ticket',
      tile: { x: STATION_FLOW_LAYOUT.gateXs[0], y: STATION_FLOW_LAYOUT.gateY }, w: 2 },
    platforms: STATION_FLOW_PLATFORMS,
    alight: { areaId: STATION_FLOW_LAYOUT.areaId, x: 17, y: 7, facing: 'down' },
  },
  'station-neighbor': {
    stationId: 'station-neighbor',
    gate: { areaId: NEIGHBOR_FLOW_LAYOUT.areaId, interactionId: 'neighbor-station-ticket', eventKey: 'neighbor.station.ticket',
      tile: { x: NEIGHBOR_FLOW_LAYOUT.gateXs[0], y: NEIGHBOR_FLOW_LAYOUT.gateY }, w: 2 },
    platforms: NEIGHBOR_FLOW_PLATFORMS,
    alight: { areaId: NEIGHBOR_FLOW_LAYOUT.areaId, x: 9, y: 5, facing: 'down' },
  },
};

export function getStationFlow(stationId: string): StationFlow {
  const flow = flows[stationId];
  if (!flow) throw new Error(`Unknown station: ${stationId}`);
  return flow;
}

export const STATION_FLOW_IDS: readonly string[] = Object.keys(flows);
