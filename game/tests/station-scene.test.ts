import { afterEach, describe, expect, it } from 'vitest';
import { TILE } from '../src/core/coords';
import { BOARDING_DOOR_RIGHT, CAR_DOOR_CENTERS, CAR_LENGTH, TRAIN_HEIGHT_PX, TRAIN_LENGTH_PX, trainDoorLocalX } from '../src/town-train/car';
import { stationScene, trainEntryX, trainExitX, trainStopX } from '../src/town-train/station-scene';
import { PLAYER_H } from '../src/render/player-sprite';
import { buildWorld, getStationFlow, isSolidTile, findPath } from '../src/world';
import { T } from '../src/world/tiles';

afterEach(() => stationScene.reset());

describe.each(['station', 'station-neighbor'])('%s: trains drawn on the station map', stationId => {
  const flow = getStationFlow(stationId), area = () => buildWorld().areas.get(flow.gate.areaId)!;

  it('stops with a door centred on the platform door tile, mirrored for each heading', () => {
    for (const p of flow.platforms) {
      const doorX = trainStopX(p) + trainDoorLocalX(p.heading);
      expect(doorX).toBe(p.door.x * TILE + TILE / 2);
    }
    expect(trainDoorLocalX('right') + trainDoorLocalX('left')).toBe(TRAIN_LENGTH_PX);
    expect(CAR_DOOR_CENTERS[0] + CAR_DOOR_CENTERS[1]).toBe(CAR_LENGTH);
    expect(BOARDING_DOOR_RIGHT).toBe(CAR_LENGTH + 2 + CAR_DOOR_CENTERS[0]);
  });

  it('enters from the arriving side and leaves toward the heading, outside the room, and fits inside it when stopped', () => {
    const width = area().width * TILE;
    for (const p of flow.platforms) {
      const stop = trainStopX(p), entry = trainEntryX(p, width), exit = trainExitX(p, width);
      expect(stop).toBeGreaterThanOrEqual(0);
      expect(stop + TRAIN_LENGTH_PX).toBeLessThanOrEqual(width);
      if (p.heading === 'right') { expect(entry + TRAIN_LENGTH_PX).toBeLessThanOrEqual(0); expect(exit).toBeGreaterThanOrEqual(width); }
      else { expect(entry).toBeGreaterThanOrEqual(width); expect(exit + TRAIN_LENGTH_PX).toBeLessThanOrEqual(0); }
    }
  });

  it('lets the player stand at each door front and keeps the stopped train off the gate passage', () => {
    const a = area();
    for (const p of flow.platforms) {
      expect(isSolidTile(a, p.doorFront.x, p.doorFront.y)).toBe(false);
      expect(Math.abs(p.doorFront.y - p.door.y)).toBe(1);
      expect(a.ground[p.door.y * a.width + p.door.x]).toBe(T.RAIL);
      expect(findPath(a, flow.alight, p.doorFront), p.id).not.toBeNull();
      expect(findPath(a, flow.alight, p.boardTile), p.id).not.toBeNull();
      const left = trainStopX(p), right = left + TRAIN_LENGTH_PX;
      for (const gx of [flow.gate.tile.x, flow.gate.tile.x + 1]) {
        if (p.direction === 'up') expect(gx * TILE >= right || (gx + 1) * TILE <= left, `${p.id} passage ${gx}`).toBe(true);
      }
    }
  });

  it('rows of track run to both room edges so trains cross the map boundary', () => {
    const a = area();
    for (const p of flow.platforms) for (const x of [0, a.width - 1]) expect(a.ground[p.track.y * a.width + x]).toBe(T.RAIL);
  });
});

describe('train size and scene store', () => {
  it('is proportioned for the 16px tile and the 26px-tall player', () => {
    expect(TRAIN_HEIGHT_PX).toBeGreaterThan(PLAYER_H);
    expect(TRAIN_HEIGHT_PX).toBeLessThanOrEqual(PLAYER_H * 2);
    expect(TRAIN_LENGTH_PX / TILE).toBeGreaterThanOrEqual(8);
  });
  it('only applies to the named area and can be cleared', () => {
    stationScene.set('station-main-interior', { trains: [{ direction: 'down', x: 0, doorOpen: 0 }], actor: { x: 1, y: 2, facing: 'down', walking: false, visible: true } });
    expect(stationScene.get('station-main-interior')?.trains).toHaveLength(1);
    expect(stationScene.get('town-main')).toBeNull();
    stationScene.set('station-main-interior', null);
    expect(stationScene.get('station-main-interior')).toBeNull();
    stationScene.setFadeSuppressed(true);
    expect(stationScene.isFadeSuppressed()).toBe(true);
    stationScene.reset();
    expect(stationScene.isFadeSuppressed()).toBe(false);
  });
});
