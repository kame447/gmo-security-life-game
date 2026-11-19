import type { SpawnPoint } from '../core/types';
import { getStationFlow, STATION_FLOW_PLATFORMS } from './station-flow';

/** Provisional geometry; keep entrance, front and track connected when the map changes. */
export const MAIN_STATION_LAYOUT = {
  townHeight: 96,
  trackY: 82,
  trackRows: 2,
  building: { x: 12, y: 84, w: 33, h: 5 },
  entrance: { x: 28, y: 88 },
  front: { x: 28, y: 89 },
} as const;

/**
 * 屋外 `town-main` の目印となるタイル座標。
 * 出入口の戻り先・開始地点・テストの基準点で共有し、同じ座標を複数箇所に直書きしない。
 */
export const LANDMARKS = {
  homeFront: { x: 35, y: 32 }, schoolGate: { x: 101, y: 36 },
  schoolDoorFront: { x: 103, y: 20 }, stationFront: MAIN_STATION_LAYOUT.front,
  parkPlaza: { x: 98, y: 60 }, shoppingStreet: { x: 47, y: 53 },
  konbiniDoorFront: { x: 63, y: 73 },
};

/** 新規開始・「さいしょから」の位置。 */
export const START: SpawnPoint = { areaId: 'town-main', ...LANDMARKS.homeFront, facing: 'down' };

/** #35/#36 shared station access. boarding・arrival・interaction は下りのホーム（従来の単一ののりば相当）。詳細は station-flow.ts。 */
const MAIN_DOWN = STATION_FLOW_PLATFORMS[0];
export const STATION_ACCESS = {
  stationId: 'station',
  areaId: 'station-main-interior',
  entrancePortalId: 'station-enter',
  exitPortalId: 'station-exit',
  outdoorEntrance: MAIN_STATION_LAYOUT.entrance,
  entry: { areaId: 'station-main-interior', x: 17, y: 16, facing: 'up' },
  // 従来の「のりばの案内の前」。案内は歩く列を避けて横にあるため、案内の真南の tile を指す。
  boarding: { areaId: 'station-main-interior', x: MAIN_DOWN.sign.x, y: MAIN_DOWN.sign.y + 1, facing: 'up' },
  // 到着後に操作を戻す位置 = 改札の外。
  arrival: { areaId: 'station-main-interior', ...getStationFlow('station').gate.outside },
  interaction: { id: MAIN_DOWN.sign.interactionId, x: MAIN_DOWN.sign.x, y: MAIN_DOWN.sign.y, eventKey: MAIN_DOWN.sign.eventKey },
} as const;
