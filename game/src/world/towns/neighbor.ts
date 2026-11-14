import type { AreaDef, FacilityDef, ObjectDef } from '../../core/types';
import { isRoad, T } from '../tiles';
import { applyRailSwitches, townRailLayout } from '../rail-layout';
import { getStationFlow, NEIGHBOR_FLOW_LAYOUT, NEIGHBOR_FLOW_PLATFORMS } from '../station-flow';

/** Provisional geometry, shared by the outdoor station, entrance and tests. */
export const NEIGHBOR_STATION_LAYOUT = {
  townHeight: 52,
  trackY: 38,
  trackRows: 2,
  building: { x: 18, y: 40, w: 12, h: 5 },
  entrance: { x: 24, y: 44 },
  front: { x: 24, y: 45 },
} as const;

/** 名前・配置は比較用の暫定案。線路へ歩いて入らず、看板に向かって乗車する。 */
export const NEIGHBOR_STATION_ACCESS = {
  stationId: 'station-neighbor',
  name: 'となりまち',
  boarding: { areaId: 'station-neighbor-interior', x: NEIGHBOR_FLOW_PLATFORMS[0].sign.x, y: NEIGHBOR_FLOW_PLATFORMS[0].sign.y + 1, facing: 'up', interactionId: NEIGHBOR_FLOW_PLATFORMS[0].sign.interactionId,
    eventKey: NEIGHBOR_FLOW_PLATFORMS[0].sign.eventKey },
  // 到着後に操作を戻す位置 = 改札の外。
  arrival: { areaId: 'station-neighbor-interior', ...getStationFlow('station-neighbor').gate.outside },
  entrance: { areaId: 'station-neighbor-interior', x: 6, y: 14, facing: 'up' },
  townFront: { areaId: 'town-neighbor', ...NEIGHBOR_STATION_LAYOUT.front, facing: 'down' },
} as const;

/** 既存の施設一覧とは別に追加する、隣町駅の暫定メタデータ。 */
export const NEIGHBOR_FACILITIES: readonly FacilityDef[] = [
  { id: NEIGHBOR_STATION_ACCESS.stationId, name: 'となりまちのえき', areaId: NEIGHBOR_STATION_ACCESS.townFront.areaId,
    kind: 'station', interior: 'full', state: 'open' },
];

/** 異なる地理と探索対象を持つ、暫定の小さな町。 */
export function createNeighborTown(): AreaDef {
  const width = 48, height = NEIGHBOR_STATION_LAYOUT.townHeight;
  const ground = new Uint8Array(width * height).fill(T.GRASS);
  const objects: ObjectDef[] = [];
  const rect = (x: number, y: number, w: number, h: number, tile: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) ground[yy * width + xx] = tile;
  };
  const object = (id: string, kind: string, x: number, y: number, w: number, h: number,
    solid = true, style?: string, facilityId?: string) => objects.push({ id, kind, x, y, w, h, solid, style, facilityId, layer: solid ? 'sorted' : 'decal' });

  // A river and its walking bridge divide the town; the station and square are on the west bank.
  rect(37, 0, 4, height, T.WATER);
  rect(0, 10, width, 1, T.SIDEWALK); rect(0, 11, width, 3, T.ASPHALT); rect(0, 14, width, 1, T.SIDEWALK);
  rect(23, 0, 3, NEIGHBOR_STATION_LAYOUT.trackY, T.ASPHALT);
  rect(37, 11, 4, 3, T.BRIDGE);
  rect(16, 1, 16, 9, T.PLAZA);
  // Walking crossings flank the station; the river remains a railway-only bridge.
  for (const x of [14, 32]) rect(x, 35, 2, 10, T.PARKPATH);
  for (let y = NEIGHBOR_STATION_LAYOUT.trackY; y < NEIGHBOR_STATION_LAYOUT.trackY + NEIGHBOR_STATION_LAYOUT.trackRows; y++) {
    for (let x = 0; x < width; x++) {
      const previous = ground[y * width + x];
      ground[y * width + x] = previous === T.WATER ? T.RAIL_BRIDGE
        : isRoad(previous) || previous === T.SIDEWALK || previous === T.PARKPATH ? T.CROSSING : T.RAIL;
    }
  }
  applyRailSwitches(ground, width, townRailLayout(NEIGHBOR_STATION_LAYOUT));
  rect(12, 40, 25, height - 40, T.PLAZA);
  rect(7, 20, 10, 7, T.GARDEN); rect(27, 18, 8, 11, T.PARKPATH);
  const station = NEIGHBOR_STATION_LAYOUT.building;
  object('neighbor-station-building', 'station', station.x, station.y, station.w, station.h, true, undefined, NEIGHBOR_STATION_ACCESS.stationId);
  object('neighbor-west-house', 'house', 5, 18, 7, 5, true, '2');
  object('neighbor-house', 'house', 14, 22, 7, 5, true, '1');
  object('neighbor-board-object', 'board', 10, 15, 1, 1);
  object('neighbor-bench', 'bench', 31, 20, 2, 1);
  for (const [x, y] of [[3, 4], [8, 5], [33, 5], [34, 27], [43, 18], [44, 28]]) {
    object(`neighbor-tree-${x}-${y}`, 'tree', x, y, 1, 1, true, 'green');
  }

  return {
    id: 'town-neighbor', name: 'となりまち', kind: 'outdoor', width, height, ground, objects,
    districts: [
      { id: 'neighbor-station-district', name: 'えきまえ', x: 0, y: NEIGHBOR_STATION_LAYOUT.trackY, w: 37, h: height - NEIGHBOR_STATION_LAYOUT.trackY },
      { id: 'neighbor-river-district', name: 'かわべ', x: 0, y: 0, w: 48, h: NEIGHBOR_STATION_LAYOUT.trackY },
      { id: 'neighbor-east-district', name: 'はしのむこう', x: 37, y: NEIGHBOR_STATION_LAYOUT.trackY, w: 11, h: height - NEIGHBOR_STATION_LAYOUT.trackY },
    ],
    portals: [{ id: 'neighbor-station-enter', from: { ...NEIGHBOR_STATION_LAYOUT.entrance }, to: { ...NEIGHBOR_STATION_ACCESS.entrance }, facilityId: NEIGHBOR_STATION_ACCESS.stationId }],
    interactions: [
      { id: 'neighbor-town-board', kind: 'sign', name: 'まちのけいじばん', x: 10, y: 15, solid: true,
        eventKey: 'neighbor.board', lines: ['かわの むこうにも みちが つづいているよ。'] },
      { id: 'neighbor-town-friend', kind: 'npc', name: 'まちのひと', x: 31, y: 24, sprite: 'friend', facing: 'down', solid: true,
        eventKey: 'neighbor.friend', lines: ['こんにちは。ここからも でんしゃに のれるよ。'] },
    ],
  };
}

/** 島式1面2線の構内。北の線が下り、南の線が上り。構造は本町の駅と同じ（station-flow.ts）。 */
export function createNeighborStation(): AreaDef {
  const f = NEIGHBOR_FLOW_LAYOUT, width = f.width, height = f.height;
  const ground = new Uint8Array(width * height).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // 線路は1本で、部屋の左右の端まで連続する。
    if (y === f.trackY) { ground[y * width + x] = T.RAIL; continue; }
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) { ground[y * width + x] = T.WALL; continue; }
    if (y === f.northFenceY || y === f.gateY) ground[y * width + x] = T.RAIL_FENCE;
    else if (y >= f.platformTop && y <= f.platformBottom) ground[y * width + x] = T.PLATFORM;
  }
  for (const x of f.gateXs) ground[f.gateY * width + x] = T.TICKET_GATE;
  for (const p of NEIGHBOR_FLOW_PLATFORMS.slice(0, 1)) ground[p.sign.y * width + p.sign.x] = T.BOARDING_SIGN;
  ground[(height - 1) * width + f.gateXs[0]] = T.MAT;
  const gate = getStationFlow('station-neighbor').gate;
  return {
    id: f.areaId, name: 'となりまちのえき', kind: 'indoor', width, height, ground,
    objects: [{ id: 'neighbor-station-bench', kind: 'bench', x: 2, y: 5, w: 2, h: 1, solid: true }, { id: 'neighbor-station-bench-2', kind: 'bench', x: 24, y: 5, w: 2, h: 1, solid: true }],
    portals: [{ id: 'neighbor-station-exit', from: { x: f.gateXs[0], y: height - 1 }, to: { ...NEIGHBOR_STATION_ACCESS.townFront }, facilityId: NEIGHBOR_STATION_ACCESS.stationId }],
    interactions: [
      { id: gate.interactionId, kind: 'object', name: 'かいさつ', x: gate.tile.x, y: gate.tile.y, w: 2, solid: true, eventKey: gate.eventKey,
        lines: ['きっぷを とおすところだ。'] },
      ...NEIGHBOR_FLOW_PLATFORMS.slice(0, 1).map(p => ({ id: p.sign.interactionId, kind: 'sign' as const, name: 'でんしゃのあんない', x: p.sign.x, y: p.sign.y,
        solid: true, eventKey: p.sign.eventKey, lines: ['ここから でんしゃに のれるよ。'] })),
    ],
  };
}
