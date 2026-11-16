import { pxToTile, type Facing } from '../core/coords';
import type { MapEvent, SpawnPoint } from '../core/types';
import type { PlayerPosition } from '../map/explorer';

/** 乗車は、ホームのこのタイルから指定された対象を向いて操作したときだけ始まる。 */
export interface RailwayStation {
  readonly id: string;
  readonly name: string;
  readonly boarding: Readonly<SpawnPoint> & { readonly interactionId: string; readonly eventKey: string };
  readonly arrival: Readonly<SpawnPoint>;
}

/** 同一路線の各駅へ選択して移動できる。運賃や時刻はこの試作では定義しない。 */
export interface RailwayLine {
  readonly id: string;
  readonly stations: readonly string[];
}

export interface RailLink {
  readonly from: { readonly areaId: string; readonly x: number; readonly y: number };
  readonly to: { readonly areaId: string; readonly x: number; readonly y: number };
}

type InteractEvent = Extract<MapEvent, { type: 'interact' }>;
const FACINGS: readonly Facing[] = ['up', 'down', 'left', 'right'];
const pointIsValid = (point: Readonly<SpawnPoint>) => !!point.areaId && Number.isInteger(point.x) && point.x >= 0 &&
  Number.isInteger(point.y) && point.y >= 0 && FACINGS.includes(point.facing);
const copyStation = (station: RailwayStation): RailwayStation => ({ ...station, boarding: { ...station.boarding }, arrival: { ...station.arrival } });
const tilePoint = (point: Readonly<SpawnPoint>) => ({ areaId: point.areaId, x: point.x, y: point.y });

/** データだけを追加して停車駅を増やせる、UI非依存の路線表。 */
export class RailwayNetwork {
  private readonly stations = new Map<string, RailwayStation>();
  private readonly lines: readonly RailwayLine[];

  constructor(stations: readonly RailwayStation[], lines: readonly RailwayLine[]) {
    const locations = new Set<string>(), interactions = new Set<string>();
    for (const station of stations) {
      const board = station.boarding;
      const location = `${board.areaId}:${board.x},${board.y}`;
      const interaction = `${board.areaId}:${board.interactionId}`;
      if (!station.id || !station.name || this.stations.has(station.id) || !pointIsValid(board) ||
          !pointIsValid(station.arrival) || !board.interactionId || !board.eventKey ||
          locations.has(location) || interactions.has(interaction)) throw new Error(`Invalid railway station: ${station.id}`);
      locations.add(location); interactions.add(interaction);
      this.stations.set(station.id, copyStation(station));
    }
    const lineIds = new Set<string>();
    for (const line of lines) {
      if (!line.id || lineIds.has(line.id) || line.stations.length < 2 ||
          new Set(line.stations).size !== line.stations.length || line.stations.some(id => !this.stations.has(id))) {
        throw new Error(`Invalid railway line: ${line.id}`);
      }
      lineIds.add(line.id);
    }
    this.lines = lines.map(line => ({ id: line.id, stations: [...line.stations] }));
  }

  station(id: string): RailwayStation | undefined {
    const station = this.stations.get(id);
    return station && copyStation(station);
  }

  destinations(originId: string): RailwayStation[] {
    const ids = new Set<string>();
    for (const line of this.lines) if (line.stations.includes(originId)) {
      for (const id of line.stations) if (id !== originId) ids.add(id);
    }
    return [...ids].map(id => copyStation(this.stations.get(id)!));
  }

  /** 検証器用の有向辺。ここで出入口や自動遷移は作らない。 */
  railLinks(): RailLink[] {
    return [...this.stations.values()].flatMap(origin => this.destinations(origin.id).map(destination => ({
      from: tilePoint(origin.boarding), to: tilePoint(destination.arrival),
    })));
  }

  /** 対象IDだけでなく、足元のタイルと向きも照合する。 */
  boardingStation(event: InteractEvent, player: Readonly<PlayerPosition>): RailwayStation | undefined {
    if (event.areaId !== player.areaId || !Number.isFinite(player.x) || !Number.isFinite(player.y)) return undefined;
    for (const station of this.stations.values()) {
      const board = station.boarding;
      if (board.areaId === player.areaId && board.x === pxToTile(player.x) && board.y === pxToTile(player.y - 4) &&
          board.facing === player.facing && board.interactionId === event.interactionId && board.eventKey === event.eventKey) {
        return copyStation(station);
      }
    }
    return undefined;
  }
}
