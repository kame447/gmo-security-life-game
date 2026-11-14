import { feetAtTile, pxToTile } from '../core/coords';
import type { MapEvent, SpawnPoint } from '../core/types';
import { canStand, positionAt } from '../map/explorer';
import type { Game } from '../session/game';
import { RailwayNetwork, type RailwayStation } from '../world/railway';
import { directionBetween, type Direction, type Heading } from './direction';
import { TravelMenu, type TravelMenuState } from './menu';
import { TRAVEL_LINES } from './network';
import { readStationFlows, type StationFlow, type StationPlatform } from './stations';

/** 改札で決めた1回の乗車。きっぷは持たず、決定の直後に演出が始まる。 */
export interface RideRequest {
  readonly originId: string;
  readonly destinationId: string;
  readonly direction: Direction;
  /** 発車して出ていく向き。 */
  readonly heading: Heading;
  /** 出発駅の乗るホーム、到着駅の降りるホーム（同じ方向）、到着駅の下車位置。数値は getStationFlow が持つ。 */
  readonly boardPlatform: StationPlatform;
  readonly alightPlatform: StationPlatform;
  readonly alight: StationFlow['alight'];
  readonly originAreaId: string;
  readonly destinationAreaId: string;
}

export type TravelResult =
  | { readonly ok: true; readonly originId: string; readonly destinationId: string }
  | { readonly ok: false; readonly reason: 'not-riding' | 'destination-unavailable' };

export type TravelView = TravelMenuState | { readonly step: 'exit' } | { readonly step: 'riding' };

/** false means no transition occurred; the shared Game may emit its normal area-enter event on success. */
export type TravelArrival = (destination: Readonly<SpawnPoint>) => boolean;

type Mode = 'closed' | 'menu' | 'exit' | 'riding';

/**
 * 改札を南から操作すると行き先の一覧、決めればそのまま乗車の演出（確認なし）。北から操作すると、一覧なしで改札を出る。
 * 位置を変えるのは commitArrival()（到着）と passExit()（改札を出る）だけ。保存するものはなく、再読み込みで出発前に戻る。
 */
export class TrainTravelSession {
  private readonly menu = new TravelMenu();
  private mode: Mode = 'closed';
  private ride: RideRequest | null = null;
  private exitGateY = 0;

  constructor(private readonly game: Pick<Game, 'player' | 'world' | 'dialog' | 'facingInteraction'>,
    private readonly railway: RailwayNetwork, private readonly arrive?: TravelArrival,
    private readonly flows: readonly StationFlow[] = readStationFlows(), private readonly lineOrder: readonly string[] = TRAVEL_LINES[0].stations) {}

  get isOpen(): boolean { return this.mode !== 'closed'; }
  get isRiding(): boolean { return this.mode === 'riding'; }
  /** 出場の動きが通る改札の行。 */
  get exitRow(): number { return this.exitGateY; }

  get state(): TravelView {
    if (this.mode === 'menu') return this.menu.state;
    return this.mode === 'exit' ? { step: 'exit' } : this.mode === 'riding' ? { step: 'riding' } : { step: 'closed' };
  }

  private facing(area: string, id: string, key: string): boolean {
    const player = this.game.player, world = this.game.world.areas.get(player.areaId), target = world && this.game.facingInteraction();
    return player.areaId === area && !!world && canStand(world, player.x, player.y) && target?.id === id && target.eventKey === key;
  }

  /** 改札の南側から上向き＝入場、北側から下向き＝出場。それ以外は null。 */
  private gateSide(gate: NonNullable<StationFlow['gate']>): 'south' | 'north' | null {
    const player = this.game.player, x = pxToTile(player.x), y = pxToTile(player.y - 4);
    if (x < gate.tile.x || x >= gate.tile.x + gate.w) return null;
    if (y === gate.tile.y + 1 && player.facing === 'up') return 'south';
    return y === gate.tile.y - 1 && player.facing === 'down' ? 'north' : null;
  }

  private openMenu(origin: RailwayStation): boolean {
    const opened = this.menu.open({ id: origin.id, name: origin.name },
      this.railway.destinations(origin.id).map(station => ({ id: station.id, name: station.name })));
    if (opened) this.mode = 'menu';
    return opened;
  }

  /** 改札の操作だけが対象。のりばの案内など、ほかの操作は通常の会話のままにする。 */
  begin(event: MapEvent): boolean {
    if (event.type !== 'interact' || this.isOpen || this.game.dialog) return false;
    for (const flow of this.flows) {
      const gate = flow.gate, origin = this.railway.station(flow.stationId), side = gate && this.gateSide(gate);
      if (!origin || !gate || !side || event.areaId !== gate.areaId || event.interactionId !== gate.interactionId ||
          event.eventKey !== gate.eventKey || !this.facing(gate.areaId, gate.interactionId, gate.eventKey)) continue;
      if (side === 'south') return this.openMenu(origin);
      this.mode = 'exit'; this.exitGateY = gate.tile.y;
      return true;
    }
    return false;
  }

  /** 行き先を決める。この1回の決定で乗車が始まり、以後は取り消せない。 */
  choose(id: string): RideRequest | null {
    if (this.mode !== 'menu' || !this.menu.select(id)) return null;
    const journey = this.menu.confirm()!;
    const flow = this.flows.find(item => item.stationId === journey.originId), gate = flow?.gate;
    const direction = directionBetween(this.lineOrder, journey.originId, journey.destinationId) ?? 'down';
    const platform = flow?.platforms.find(item => item.direction === direction) ?? flow?.platforms[0];
    const toFlow = this.flows.find(item => item.stationId === journey.destinationId);
    const alightPlatform = toFlow?.platforms.find(item => item.direction === direction) ?? toFlow?.platforms[0];
    if (!gate || !platform || !toFlow || !alightPlatform || this.gateSide(gate) !== 'south') { this.mode = 'closed'; return null; }
    this.ride = { originId: journey.originId, destinationId: journey.destinationId, direction, heading: platform.heading,
      boardPlatform: platform, alightPlatform, alight: toFlow.alight, originAreaId: gate.areaId, destinationAreaId: toFlow.gate.areaId };
    this.mode = 'riding';
    return { ...this.ride };
  }

  back(): boolean {
    if (this.mode === 'menu') {
      const changed = this.menu.back();
      if (this.menu.state.step === 'closed') this.mode = 'closed';
      return changed;
    }
    if (this.mode === 'exit') { this.mode = 'closed'; return true; }
    return false;
  }
  cancel(): void { if (this.mode !== 'riding') { this.menu.cancel(); this.mode = 'closed'; } }

  /** 改札を北から出る。選択も確認も無い。位置の移動は到着と同じ共有フックを使う。 */
  passExit(): boolean {
    if (this.mode !== 'exit') return false;
    const flow = this.flows.find(item => item.gate?.areaId === this.game.player.areaId), gate = flow?.gate;
    if (!gate || this.gateSide(gate) !== 'north' || !this.facing(gate.areaId, gate.interactionId, gate.eventKey)) { this.mode = 'closed'; return false; }
    const spawn = { areaId: gate.areaId, x: pxToTile(this.game.player.x), y: gate.tile.y + 1, facing: 'down' as const };
    const area = this.game.world.areas.get(spawn.areaId), feet = feetAtTile(spawn.x, spawn.y);
    if (!area || !canStand(area, feet.x, feet.y) || area.portalAt.has(spawn.y * area.width + spawn.x)) { this.mode = 'closed'; return false; }
    const moved = this.arrive ? this.arrive(spawn) : ((this.game.player = positionAt(spawn)), true);
    this.mode = 'closed';
    return moved;
  }

  /** 出発した列車が画面の外にいる間に呼ぶ。位置を変える唯一の場所（到着）。 */
  commitArrival(): TravelResult {
    if (this.mode !== 'riding' || !this.ride) return { ok: false, reason: 'not-riding' };
    const ride = this.ride;
    const done = (result: TravelResult): TravelResult => { this.mode = 'closed'; this.ride = null; return result; };
    const destination = this.railway.destinations(ride.originId).find(station => station.id === ride.destinationId);
    const target = destination && this.game.world.areas.get(destination.arrival.areaId);
    if (!destination || !target) return done({ ok: false, reason: 'destination-unavailable' });
    const arrival = destination.arrival, feet = feetAtTile(arrival.x, arrival.y);
    if (!canStand(target, feet.x, feet.y) || target.portalAt.has(arrival.y * target.width + arrival.x)) {
      return done({ ok: false, reason: 'destination-unavailable' });
    }
    if (this.arrive) {
      if (!this.arrive({ ...arrival })) return done({ ok: false, reason: 'destination-unavailable' });
    } else this.game.player = positionAt(arrival);
    return done({ ok: true, originId: ride.originId, destinationId: ride.destinationId });
  }
}
