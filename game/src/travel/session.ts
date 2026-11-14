import { feetAtTile } from '../core/coords';
import type { MapEvent, SpawnPoint } from '../core/types';
import { canStand, positionAt } from '../map/explorer';
import type { Game } from '../session/game';
import { pxToTile } from '../core/coords';
import { RailwayNetwork, type RailwayStation } from '../world/railway';
import { directionBetween, type Direction, type Heading } from './direction';
import { TravelMenu, type TravelMenuState } from './menu';
import { TRAVEL_LINES } from './network';
import { readStationFlows, type PlatformFlow, type StationFlow } from './stations';

export interface Ticket { readonly originId: string; readonly destinationId: string; readonly direction: Direction }

export type TravelResult =
  | { readonly ok: true; readonly originId: string; readonly destinationId: string }
  | { readonly ok: false; readonly reason: 'not-riding' | 'origin-unavailable' | 'destination-unavailable' };

/** 乗車の開始時に演出へ渡す内容。 */
export interface RideRequest extends Ticket { readonly heading: Heading }

export type NoticeKind = 'ticket-issued' | 'no-ticket' | 'wrong-platform';
export type TravelView =
  | TravelMenuState
  | { readonly step: 'exit' }
  | { readonly step: 'notice'; readonly kind: NoticeKind; readonly destinationName?: string }
  | { readonly step: 'board'; readonly originName: string; readonly destinationName: string }
  | { readonly step: 'riding' };

/** false means no transition occurred; the shared Game may emit its normal area-enter event on success. */
export type TravelArrival = (destination: Readonly<SpawnPoint>) => boolean;

type Mode = 'closed' | 'menu' | 'notice' | 'exit' | 'board' | 'riding';

/**
 * 改札で行き先を選んできっぷを受け取り、ホームの看板で乗車して発車する流れの状態。
 * 位置を変えるのは commitArrival() の1回だけで、きっぷは保存しない（再読み込みで出発前に戻る）。
 */
export class TrainTravelSession {
  private readonly menu = new TravelMenu();
  private mode: Mode = 'closed';
  private notice: NoticeKind = 'no-ticket';
  private ticket: Ticket | null = null;
  private platform: PlatformFlow | null = null;

  constructor(private readonly game: Pick<Game, 'player' | 'world' | 'dialog' | 'facingInteraction'>,
    private readonly railway: RailwayNetwork, private readonly arrive?: TravelArrival,
    private readonly flows: readonly StationFlow[] = readStationFlows(), private readonly lineOrder: readonly string[] = TRAVEL_LINES[0].stations) {}

  get isOpen(): boolean { return this.mode !== 'closed'; }
  get isRiding(): boolean { return this.mode === 'riding'; }
  get currentTicket(): Ticket | null { return this.ticket && { ...this.ticket }; }

  get state(): TravelView {
    if (this.mode === 'menu') return this.menu.state;
    if (this.mode === 'exit') return { step: 'exit' };
    if (this.mode === 'notice') {
      const ticket = this.ticket, name = ticket && this.railway.station(ticket.destinationId)?.name;
      return { step: 'notice', kind: this.notice, ...(name ? { destinationName: name } : {}) };
    }
    if (this.mode === 'board' || this.mode === 'riding') {
      const ticket = this.ticket!;
      return this.mode === 'riding' ? { step: 'riding' } : { step: 'board',
        originName: this.railway.station(ticket.originId)?.name ?? '', destinationName: this.railway.station(ticket.destinationId)?.name ?? '' };
    }
    return { step: 'closed' };
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

  /** 足元のタイルと向きが乗車位置に合い、のりばの案内を向いているときだけ true。 */
  private atPlatform(platform: PlatformFlow): boolean {
    const player = this.game.player, board = platform.boardTile;
    return !this.game.dialog && this.facing(board.areaId, platform.sign.interactionId, platform.sign.eventKey) &&
      player.facing === board.facing && pxToTile(player.x) === board.x && pxToTile(player.y - 4) === board.y;
  }

  private openMenu(origin: RailwayStation): boolean {
    const opened = this.menu.open({ id: origin.id, name: origin.name },
      this.railway.destinations(origin.id).map(station => ({ id: station.id, name: station.name })));
    if (opened) this.mode = 'menu';
    return opened;
  }

  /** 改札の操作で行き先メニュー、のりばの案内の操作できっぷの確認や案内を開く。 */
  begin(event: MapEvent): boolean {
    if (event.type !== 'interact' || this.isOpen || this.game.dialog) return false;
    for (const flow of this.flows) {
      const gate = flow.gate, origin = this.railway.station(flow.stationId), side = gate && this.gateSide(gate);
      if (!origin || !gate || !side || event.areaId !== gate.areaId || event.interactionId !== gate.interactionId ||
          event.eventKey !== gate.eventKey || !this.facing(gate.areaId, gate.interactionId, gate.eventKey)) continue;
      if (side === 'south') return this.openMenu(origin);
      this.mode = 'exit';
      return true;
    }
    for (const flow of this.flows) {
      const platform = flow.platforms.find(item => item.boardTile.areaId === event.areaId &&
        item.sign.interactionId === event.interactionId && item.sign.eventKey === event.eventKey);
      const origin = platform && this.railway.station(flow.stationId);
      if (!platform || !origin || !this.atPlatform(platform)) continue;
      const ticket = this.ticket;
      if (!flow.gate && ticket?.originId !== origin.id) return this.openMenu(origin);
      if (!ticket || ticket.originId !== origin.id) { this.notice = 'no-ticket'; this.mode = 'notice'; return true; }
      if (platform.direction !== ticket.direction) { this.notice = 'wrong-platform'; this.mode = 'notice'; return true; }
      this.platform = platform; this.mode = 'board';
      return true;
    }
    return false;
  }

  select(id: string): boolean { return this.mode === 'menu' && this.menu.select(id); }

  /** きっぷを受け取る。位置も所持品も変えない。 */
  issue(): Ticket | null {
    const state = this.menu.state;
    if (this.mode !== 'menu' || state.step !== 'confirm') return null;
    const journey = this.menu.confirm()!;
    const direction = directionBetween(this.lineOrder, journey.originId, journey.destinationId) ?? 'down';
    this.ticket = { originId: journey.originId, destinationId: journey.destinationId, direction };
    this.notice = 'ticket-issued'; this.mode = 'notice';
    return { ...this.ticket };
  }

  /**
   * 改札を通る。入場（きっぷを受け取った直後）は改札の北、出場は改札の南へ立ち位置を移す。
   * 出場ではきっぷを取り消す（仮）。位置の移動は到着と同じ共有フック（エリア変更通知と保存を伴う）を使う。
   */
  passGate(): boolean {
    const entering = this.mode === 'notice' && this.notice === 'ticket-issued' && !!this.ticket;
    if (!entering && this.mode !== 'exit') return false;
    const flow = this.flows.find(item => entering ? item.stationId === this.ticket!.originId : item.gate &&
      item.gate.areaId === this.game.player.areaId), gate = flow?.gate;
    const side = gate && this.gateSide(gate);
    if (!gate || side !== (entering ? 'south' : 'north') || !this.facing(gate.areaId, gate.interactionId, gate.eventKey)) return false;
    const x = pxToTile(this.game.player.x);
    const spawn = entering ? { areaId: gate.areaId, x, y: gate.tile.y - 1, facing: 'up' as const }
      : { areaId: gate.areaId, x, y: gate.tile.y + 1, facing: 'down' as const };
    const area = this.game.world.areas.get(spawn.areaId), feet = feetAtTile(spawn.x, spawn.y);
    if (!area || !canStand(area, feet.x, feet.y) || area.portalAt.has(spawn.y * area.width + spawn.x)) return false;
    if (this.arrive) { if (!this.arrive(spawn)) return false; } else this.game.player = positionAt(spawn);
    if (!entering) this.ticket = null;
    this.mode = 'closed';
    return true;
  }

  /** きっぷを返して閉じる。 */
  returnTicket(): void { if (this.mode === 'menu') { this.menu.cancel(); this.ticket = null; this.mode = 'closed'; } }

  back(): boolean {
    if (this.mode === 'menu') {
      const changed = this.menu.back();
      if (this.menu.state.step === 'closed') this.mode = 'closed';
      return changed;
    }
    if (this.mode === 'notice' || this.mode === 'board' || this.mode === 'exit') { this.mode = 'closed'; return true; }
    return false;
  }
  cancel(): void { if (this.mode !== 'riding') { this.menu.cancel(); this.mode = 'closed'; } }

  /** 乗車を始める。1枚のきっぷで1回だけ成功し、以後は取り消せない。 */
  startRide(): RideRequest | null {
    const platform = this.platform;
    if (this.mode !== 'board' || !this.ticket || !platform) return null;
    if (!this.atPlatform(platform)) { this.mode = 'closed'; return null; }
    this.mode = 'riding';
    return { ...this.ticket, heading: platform.heading };
  }

  /** 発車の暗転の切れ目で呼ぶ。位置を変える唯一の場所。 */
  commitArrival(): TravelResult {
    if (this.mode !== 'riding' || !this.ticket) return { ok: false, reason: 'not-riding' };
    const ticket = this.ticket;
    const done = (result: TravelResult): TravelResult => { this.mode = 'closed'; this.ticket = null; return result; };
    const destination = this.railway.destinations(ticket.originId).find(station => station.id === ticket.destinationId);
    const target = destination && this.game.world.areas.get(destination.arrival.areaId);
    if (!destination || !target) return done({ ok: false, reason: 'destination-unavailable' });
    const arrival = destination.arrival, feet = feetAtTile(arrival.x, arrival.y);
    if (!canStand(target, feet.x, feet.y) || target.portalAt.has(arrival.y * target.width + arrival.x)) {
      return done({ ok: false, reason: 'destination-unavailable' });
    }
    if (this.arrive) {
      if (!this.arrive({ ...arrival })) return done({ ok: false, reason: 'destination-unavailable' });
    } else this.game.player = positionAt(arrival);
    return done({ ok: true, originId: ticket.originId, destinationId: ticket.destinationId });
  }
}
