import type { SpawnPoint } from '../core/types';

/**
 * 屋外 `town-main` の目印となるタイル座標。
 * 出入口の戻り先・開始地点・テストの基準点で共有し、同じ座標を複数箇所に直書きしない。
 */
export const LANDMARKS = {
  homeFront: { x: 35, y: 32 }, schoolGate: { x: 101, y: 36 },
  schoolDoorFront: { x: 103, y: 20 }, stationFront: { x: 28, y: 64 },
  parkPlaza: { x: 98, y: 60 }, shoppingStreet: { x: 47, y: 53 },
  konbiniDoorFront: { x: 54, y: 53 },
};

/** 新規開始・「さいしょから」の位置。 */
export const START: SpawnPoint = { areaId: 'town-main', ...LANDMARKS.homeFront, facing: 'down' };

/** #35/#36 shared station access. Tile coordinates and names are prototype values. */
export const STATION_ACCESS = {
  stationId: 'station',
  areaId: 'station-main-interior',
  entrancePortalId: 'station-enter',
  exitPortalId: 'station-exit',
  entry: { areaId: 'station-main-interior', x: 17, y: 16, facing: 'up' },
  boarding: { areaId: 'station-main-interior', x: 17, y: 9, facing: 'up' },
  arrival: { areaId: 'station-main-interior', x: 17, y: 10, facing: 'down' },
  interaction: { id: 'station-boarding', x: 17, y: 8, eventKey: 'travel.station.board' },
} as const;
