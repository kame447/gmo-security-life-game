import type { AreaDef, ObjectDef } from '../../core/types';
import { T } from '../tiles';

/** 名前・配置は比較用の暫定案。線路へ歩いて入らず、看板に向かって乗車する。 */
export const NEIGHBOR_STATION_ACCESS = {
  stationId: 'station-neighbor',
  name: 'となりまち',
  boarding: { areaId: 'station-neighbor-interior', x: 9, y: 5, facing: 'up',
    interactionId: 'neighbor-station-boarding', eventKey: 'travel.station.board' },
  arrival: { areaId: 'station-neighbor-interior', x: 9, y: 6, facing: 'down' },
  entrance: { areaId: 'station-neighbor-interior', x: 9, y: 10, facing: 'up' },
  townFront: { areaId: 'town-neighbor', x: 24, y: 7, facing: 'down' },
} as const;

/** 異なる地理と探索対象を持つ、暫定の小さな町。 */
export function createNeighborTown(): AreaDef {
  const width = 48, height = 36;
  const ground = new Uint8Array(width * height).fill(T.GRASS);
  const objects: ObjectDef[] = [];
  const rect = (x: number, y: number, w: number, h: number, tile: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) ground[yy * width + xx] = tile;
  };
  const object = (id: string, kind: string, x: number, y: number, w: number, h: number,
    solid = true, style?: string) => objects.push({ id, kind, x, y, w, h, solid, style, layer: solid ? 'sorted' : 'decal' });

  // A river and its walking bridge divide the town; the station and square are on the west bank.
  rect(37, 0, 4, height, T.WATER);
  rect(0, 10, width, 1, T.SIDEWALK); rect(0, 11, width, 3, T.ASPHALT); rect(0, 14, width, 1, T.SIDEWALK);
  rect(23, 0, 3, height, T.ASPHALT);
  rect(37, 11, 4, 3, T.BRIDGE);
  rect(16, 1, 16, 9, T.PLAZA);
  rect(7, 20, 10, 7, T.GARDEN); rect(27, 18, 8, 11, T.PARKPATH);
  object('neighbor-station-building', 'station', 18, 2, 12, 5);
  object('neighbor-shop', 'shop', 5, 18, 7, 5, true, 'bookstore');
  object('neighbor-house', 'house', 14, 22, 7, 5, true, '1');
  object('neighbor-board-object', 'board', 10, 15, 1, 1);
  object('neighbor-bench', 'bench', 31, 20, 2, 1);
  for (const [x, y] of [[3, 4], [8, 5], [33, 5], [34, 27], [43, 18], [44, 28]]) {
    object(`neighbor-tree-${x}-${y}`, 'tree', x, y, 1, 1, true, 'green');
  }

  return {
    id: 'town-neighbor', name: 'となりまち', kind: 'outdoor', width, height, ground, objects,
    districts: [
      { id: 'neighbor-station-district', name: 'えきまえ', x: 0, y: 0, w: 37, h: 15 },
      { id: 'neighbor-river-district', name: 'かわべ', x: 0, y: 15, w: 48, h: 21 },
      { id: 'neighbor-east-district', name: 'はしのむこう', x: 37, y: 0, w: 11, h: 15 },
    ],
    portals: [{ id: 'neighbor-station-enter', from: { x: 24, y: 6 }, to: { ...NEIGHBOR_STATION_ACCESS.entrance } }],
    interactions: [
      { id: 'neighbor-town-board', kind: 'sign', name: 'まちのけいじばん', x: 10, y: 15, solid: true,
        eventKey: 'neighbor.board', lines: ['かわの むこうにも みちが つづいているよ。'] },
      { id: 'neighbor-town-friend', kind: 'npc', name: 'まちのひと', x: 31, y: 24, sprite: 'friend', facing: 'down', solid: true,
        eventKey: 'neighbor.friend', lines: ['こんにちは。ここからも でんしゃに のれるよ。'] },
    ],
  };
}

/** 町とホームを結ぶ駅。乗車の判定は看板での明示操作だけが担当する。 */
export function createNeighborStation(): AreaDef {
  const width = 20, height = 12;
  const ground = new Uint8Array(width * height).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) ground[y * width + x] = T.WALL;
    if (x > 0 && x < width - 1 && (y === 2 || y === 3)) ground[y * width + x] = T.RAIL;
  }
  ground[11 * width + 9] = T.MAT;
  return {
    id: 'station-neighbor-interior', name: 'となりまちのえき', kind: 'indoor', width, height, ground,
    objects: [
      { id: 'neighbor-station-train', kind: 'train', x: 3, y: 2, w: 14, h: 2, solid: false, layer: 'decal' },
      { id: 'neighbor-station-board-object', kind: 'board', x: 9, y: 4, w: 1, h: 1, solid: true },
      { id: 'neighbor-station-bench', kind: 'bench', x: 3, y: 7, w: 2, h: 1, solid: true },
    ],
    portals: [{ id: 'neighbor-station-exit', from: { x: 9, y: 11 }, to: { ...NEIGHBOR_STATION_ACCESS.townFront } }],
    interactions: [{ id: 'neighbor-station-boarding', kind: 'sign', name: 'でんしゃのあんない', x: 9, y: 4, solid: true,
      eventKey: 'travel.station.board', lines: ['ここから でんしゃに のれるよ。'] }],
  };
}
