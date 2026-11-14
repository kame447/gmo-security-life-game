import { feetAtTile } from '../core/coords';
import type { MapEvent, SpawnPoint } from '../core/types';
import { canStand, positionAt } from '../map/explorer';
import type { Game } from '../session/game';
import { RailwayNetwork, type RailwayStation } from '../world/railway';
import { directionBetween, type Direction } from './direction';
import { TravelMenu, type TravelMenuState } from './menu';
import { TRAVEL_LINES } from './network';
import { readStationFlows, type StationFlow } from './stations';

export interface Ticket { readonly originId: string; readonly destinationId: string; readonly direction: Direction }

export type TravelResult =
  | { readonly ok: true; readonly originId: string; readonly destinationId: string }
  | { readonly ok: false; readonly reason: 'not-riding' | 'origin-unavailable' | 'destination-unavailable' };

export type NoticeKind = 'ticket-issued' | 'no-ticket' | 'wrong-platform';
export type TravelView =
  | TravelMenuState
  | { readonly step: 'notice'; readonly kind: NoticeKind; readonly destinationName?: string }
  | { readonly step: 'board'; readonly originName: string; readonly destinationName: string }
  | { readonly step: 'riding' };

/** false means no transition occurred; the shared Game may emit its normal area-enter event on success. */
export type TravelArrival = (destination: Readonly<SpawnPoint>) => boolean;

type Mode = 'closed' | 'menu' | 'notice' | 'board' | 'riding';

/**
 * 改札で行き先を選んできっぷを受け取り、ホームの看板で乗車して発車する流れの状態。
 * 位置を変えるのは commitArrival() の1回だけで、きっぷは保存しない（再読み込みで出発前に戻る）。
 */
export class TrainTravelSession {
  private readonly menu = new TravelMenu();
  private mode: Mode = 'closed';
  private notice: NoticeKind = 'no-ticket';
  private ticket: Ticket | null = null;

  constructor(private readonly game: Pick<Game, 'player' | 'world' | 'dialog' | 'facingInteraction'>,
    private readonly railway: RailwayNetwork, private readonly arrive?: TravelArrival,
    private readonly flows: readonly StationFlow[] = readStationFlows(), private readonly lineOrder: readonly string[] = TRAVEL_LINES[0].stations) {}

  get isOpen(): boolean { return this.mode !== 'closed'; }
  get isRiding(): boolean { return this.mode === 'riding'; }
  get currentTicket(): Ticket | null { return this.ticket && { ...this.ticket }; }

  get state(): TravelView {
    if (this.mode === 'menu') return this.menu.state;
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

  private atBoardingPoint(station: RailwayStation): boolean {
    const board = station.boarding;
    const event = { type: 'interact' as const, areaId: this.game.player.areaId, interactionId: board.interactionId, eventKey: board.eventKey };
    return !this.game.dialog && this.facing(board.areaId, board.interactionId, board.eventKey) &&
      this.railway.boardingStation(event, this.game.player)?.id === station.id;
  }

  private openMenu(origin: RailwayStation): boolean {
    const opened = this.menu.open({ id: origin.id, name: origin.name },
      this.railway.destinations(origin.id).map(station => ({ id: station.id, name: station.name })));
    if (opened) this.mode = 'menu';
    return opened;
  }

  /** 改札の操作で行き先メニュー、のりばの看板の操作できっぷの確認や案内を開く。 */
  begin(event: MapEvent): boolean {
    if (event.type !== 'interact' || this.isOpen || this.game.dialog) return false;
    for (const flow of this.flows) {
      const gate = flow.gate, origin = this.railway.station(flow.stationId);
      if (origin && gate && event.areaId === gate.areaId && event.interactionId === gate.interactionId &&
          event.eventKey === gate.eventKey && this.facing(gate.areaId, gate.interactionId, gate.eventKey)) return this.openMenu(origin);
    }
    const origin = this.railway.boardingStation(event, this.game.player);
    if (!origin || !this.atBoardingPoint(origin)) return false;
    const flow = this.flows.find(item => item.stationId === origin.id);
    if (flow && !flow.gate && !(this.ticket?.originId === origin.id)) return this.openMenu(origin);
    const ticket = this.ticket;
    if (!ticket || ticket.originId !== origin.id) { this.notice = 'no-ticket'; this.mode = 'notice'; return true; }
    const platform = flow?.platforms.find(item => item.sign.interactionId === event.interactionId && item.sign.eventKey === event.eventKey);
    this.mode = platform && !platform.directions.includes(ticket.direction) ? 'notice' : 'board';
    if (this.mode === 'notice') this.notice = 'wrong-platform';
    return true;
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

  /** きっぷを返して閉じる。 */
  returnTicket(): void { if (this.mode === 'menu') { this.menu.cancel(); this.ticket = null; this.mode = 'closed'; } }

  back(): boolean {
    if (this.mode === 'menu') {
      const changed = this.menu.back();
      if (this.menu.state.step === 'closed') this.mode = 'closed';
      return changed;
    }
    if (this.mode === 'notice' || this.mode === 'board') { this.mode = 'closed'; return true; }
    return false;
  }
  cancel(): void { if (this.mode !== 'riding') { this.menu.cancel(); this.mode = 'closed'; } }

  /** 乗車を始める。1枚のきっぷで1回だけ成功し、以後は取り消せない。 */
  startRide(): Ticket | null {
    if (this.mode !== 'board' || !this.ticket) return null;
    const origin = this.railway.station(this.ticket.originId);
    if (!origin || !this.atBoardingPoint(origin)) { this.mode = 'closed'; return null; }
    this.mode = 'riding';
    return { ...this.ticket };
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
