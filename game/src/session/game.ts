/**
 * ゲームの1セッション。マップ探索・会話・主人公の外見・保存を組み合わせ、
 * 入力（update/action）を各担当へ振り分ける（DOM 非依存）。
 */
import { normalizeAppearance, type PlayerAppearance } from '../core/appearance';
import type { InteractionDef, MapEvent, MapEventSink } from '../core/types';
import { DialogController, type DialogState } from '../events/dialog';
import { MapExplorer, positionAt, type InputState, type PlayerPosition } from '../map/explorer';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { PHONE_CONTENT } from '../phone/content';
import { PhoneModel } from '../phone/model';
import { createSave, parseSave, type SaveData } from '../state/save';
import type { AreaRuntime, World } from '../world';

type SinkResponse = { speaker?: string; lines: string[] } | void;

export class Game {
  readonly world: World;
  appearance: PlayerAppearance;
  readonly phone: PhoneModel;
  private readonly explorer: MapExplorer;
  private readonly dialogs = new DialogController();
  private readonly sink?: MapEventSink;
  private readonly listeners = new Set<(e: MapEvent) => void>();

  constructor(world: World, opts?: { save?: unknown; sink?: MapEventSink; initialPhoneOwned?: boolean }) {
    this.world = world;
    this.sink = opts?.sink;
    const initialPhoneOwned = opts?.initialPhoneOwned ?? PHONE_INITIAL_OWNED;
    const saved = parseSave(opts?.save, world, initialPhoneOwned);
    this.appearance = normalizeAppearance(saved?.appearance);
    this.phone = new PhoneModel(PHONE_CONTENT, { initialOwned: initialPhoneOwned, saved: saved?.phone });
    const start = saved
      ? { areaId: saved.areaId, x: saved.x, y: saved.y, facing: saved.facing }
      : positionAt(world.start);
    this.explorer = new MapExplorer(world, start, e => { this.emit(e); });
  }

  get player(): PlayerPosition { return this.explorer.player; }
  set player(p: PlayerPosition) { this.explorer.player = p; }
  get area(): AreaRuntime { return this.explorer.area; }
  get moving(): boolean { return this.explorer.moving; }
  get walkTime(): number { return this.explorer.walkTime; }
  get dialog(): DialogState | null { return this.dialogs.current; }
  set dialog(d: DialogState | null) { this.dialogs.current = d; }

  on(fn: (e: MapEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(e: MapEvent): SinkResponse {
    const result = this.sink?.onMapEvent(e);
    for (const fn of this.listeners) fn(e);
    return result;
  }

  /** Movement pauses while a dialog is open. */
  update(dt: number, input: InputState): void {
    if (this.dialogs.current) { this.explorer.halt(); return; }
    this.explorer.update(dt, input);
  }

  facingInteraction(): InteractionDef | undefined { return this.explorer.facingInteraction(); }

  /** Advance an open dialog, or interact with what the player faces. */
  action(): void {
    if (this.dialogs.current) { this.dialogs.advance(); return; }
    const target = this.explorer.facingInteraction();
    if (!target) return;
    const response = this.emit({ type: 'interact', areaId: this.player.areaId, interactionId: target.id, eventKey: target.eventKey });
    const lines = response ? response.lines : target.lines;
    if (this.dialogs.open(response?.speaker ?? target.name, lines)) this.explorer.halt();
  }

  setAppearance(a: PlayerAppearance): void {
    this.appearance = normalizeAppearance(a);
  }

  /** Back to the start point. Appearance is kept. */
  reset(): void {
    this.explorer.reset(positionAt(this.world.start));
    this.dialogs.close();
    this.emit({ type: 'area-enter', areaId: this.world.start.areaId });
  }

  serialize(): SaveData {
    return createSave(this.world, this.player, this.appearance, undefined, this.phone.save());
  }
}
