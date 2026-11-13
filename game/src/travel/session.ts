import { feetAtTile } from '../core/coords';
import type { MapEvent, SpawnPoint } from '../core/types';
import { canStand, positionAt } from '../map/explorer';
import type { Game } from '../session/game';
import { RailwayNetwork, type RailwayStation } from '../world/railway';
import { TravelMenu, type TravelMenuState } from './menu';

export type TravelResult =
  | { readonly ok: true; readonly originId: string; readonly destinationId: string }
  | { readonly ok: false; readonly reason: 'not-confirming' | 'origin-unavailable' | 'destination-unavailable' };

/** false means no transition occurred; the shared Game may emit its normal area-enter event on success. */
export type TravelArrival = (destination: Readonly<SpawnPoint>) => boolean;

/** 共有UIはこの状態を表示し、成功結果を受けて入力解除・保存を行う。 */
export class TrainTravelSession {
  private readonly menu = new TravelMenu();

  constructor(private readonly game: Pick<Game, 'player' | 'world' | 'dialog' | 'facingInteraction'>,
    private readonly railway: RailwayNetwork, private readonly arrive?: TravelArrival) {}

  get state(): TravelMenuState { return this.menu.state; }
  get isOpen(): boolean { return this.menu.state.step !== 'closed'; }

  private atBoardingPoint(station: RailwayStation): boolean {
    const player = this.game.player, area = this.game.world.areas.get(player.areaId);
    const target = area && this.game.facingInteraction();
    const event = { type: 'interact' as const, areaId: player.areaId,
      interactionId: station.boarding.interactionId, eventKey: station.boarding.eventKey };
    return !this.game.dialog && !!area && canStand(area, player.x, player.y) &&
      target?.id === event.interactionId && target.eventKey === event.eventKey &&
      this.railway.boardingStation(event, player)?.id === station.id;
  }

  /** Only an actual station interaction, from the permitted tile and direction, can open the menu. */
  begin(event: MapEvent): boolean {
    if (event.type !== 'interact' || this.isOpen || this.game.dialog) return false;
    const origin = this.railway.boardingStation(event, this.game.player);
    if (!origin || !this.atBoardingPoint(origin)) return false;
    return this.menu.open({ id: origin.id, name: origin.name },
      this.railway.destinations(origin.id).map(station => ({ id: station.id, name: station.name })));
  }

  select(id: string): boolean { return this.menu.select(id); }
  back(): boolean { return this.menu.back(); }
  cancel(): void { this.menu.cancel(); }

  /** Position is the only game field changed; no time, asset or appearance state is reset. */
  confirm(): TravelResult {
    const state = this.menu.state;
    if (state.step !== 'confirm') return { ok: false, reason: 'not-confirming' };
    const origin = this.railway.station(state.origin.id);
    if (!origin || !this.atBoardingPoint(origin)) {
      this.menu.cancel();
      return { ok: false, reason: 'origin-unavailable' };
    }
    const destination = this.railway.destinations(origin.id).find(station => station.id === state.destination.id);
    const target = destination && this.game.world.areas.get(destination.arrival.areaId);
    if (!destination || !target) return { ok: false, reason: 'destination-unavailable' };
    const arrival = destination.arrival, feet = feetAtTile(arrival.x, arrival.y);
    if (!canStand(target, feet.x, feet.y) || target.portalAt.has(arrival.y * target.width + arrival.x)) {
      return { ok: false, reason: 'destination-unavailable' };
    }
    if (this.arrive) {
      if (!this.arrive({ ...arrival })) return { ok: false, reason: 'destination-unavailable' };
    } else this.game.player = positionAt(arrival);
    this.menu.confirm();
    return { ok: true, originId: origin.id, destinationId: destination.id };
  }
}
