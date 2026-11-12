import { DIR, TILE, feetAtTile, pxToTile, type Facing } from '../core/coords';
import { normalizeAppearance, type PlayerAppearance } from '../core/appearance';
import type { InteractionDef, MapEvent, MapEventSink, SaveData } from '../core/types';
import type { AreaRuntime, World } from '../world';

export interface InputState { dir: Facing | null; run: boolean }
export interface DialogState { speaker: string; lines: string[]; index: number }
export const WALK_SPEED = 72;
export const RUN_SPEED = 128;
export const HITBOX = { halfW: 5, h: 8 };

function outside(area: AreaRuntime, x: number, y: number): boolean {
  return x - HITBOX.halfW < 0 || x + HITBOX.halfW > area.width * TILE ||
    y - HITBOX.h < 0 || y > area.height * TILE;
}

/** Half-open hitbox bounds keep a player touching a wall outside its tile. */
function canStand(area: AreaRuntime, x: number, y: number): boolean {
  if (outside(area, x, y)) return false;
  const left = pxToTile(x - HITBOX.halfW);
  const right = Math.ceil((x + HITBOX.halfW) / TILE) - 1;
  const top = pxToTile(y - HITBOX.h);
  const bottom = Math.ceil(y / TILE) - 1;
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (area.solid[ty * area.width + tx]) return false;
    }
  }
  return true;
}

export function parseSave(raw: unknown, world: World): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SaveData>;
  if (s.v !== 1 || s.variantId !== world.variant.id || typeof s.areaId !== 'string' ||
      typeof s.x !== 'number' || typeof s.y !== 'number' ||
      !Number.isFinite(s.x) || !Number.isFinite(s.y) ||
      !(['up', 'down', 'left', 'right'] as unknown[]).includes(s.facing)) return null;
  const area = world.areas.get(s.areaId);
  if (!area || !canStand(area, s.x, s.y)) return null;
  return { v: 1, variantId: world.variant.id, areaId: s.areaId, x: s.x, y: s.y,
    facing: s.facing as Facing, appearance: normalizeAppearance(s.appearance) };
}

export class Game {
  readonly world: World;
  player: { areaId: string; x: number; y: number; facing: Facing };
  appearance: PlayerAppearance;
  moving = false;
  walkTime = 0;
  dialog: DialogState | null = null;
  private readonly sink?: MapEventSink;
  private readonly listeners = new Set<(e: MapEvent) => void>();
  private edgeContact: string | null = null;

  constructor(world: World, opts?: { save?: unknown; sink?: MapEventSink }) {
    this.world = world;
    this.sink = opts?.sink;
    const saved = parseSave(opts?.save, world);
    this.appearance = normalizeAppearance(saved?.appearance);
    const start = world.start;
    this.player = saved
      ? { areaId: saved.areaId, x: saved.x, y: saved.y, facing: saved.facing }
      : { areaId: start.areaId, ...feetAtTile(start.x, start.y), facing: start.facing };
  }

  get area(): AreaRuntime { return this.world.areas.get(this.player.areaId)!; }

  on(fn: (e: MapEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(e: MapEvent): { speaker?: string; lines: string[] } | void {
    const result = this.sink?.onMapEvent(e);
    for (const fn of this.listeners) fn(e);
    return result;
  }

  update(dt: number, input: InputState): void {
    this.moving = false;
    if (this.dialog || !Number.isFinite(dt) || dt <= 0) return;
    if (!input.dir) { this.edgeContact = null; return; }
    this.player.facing = input.dir;
    const { dx, dy } = DIR[input.dir];
    let remaining = dt * (input.run ? RUN_SPEED : WALK_SPEED);
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      let nx = this.player.x + dx * step;
      let ny = this.player.y + dy * step;
      if (!canStand(this.area, nx, ny)) {
        if (outside(this.area, nx, ny)) {
          const key = `${this.player.areaId}:${input.dir}`;
          if (key !== this.edgeContact) {
            this.edgeContact = key;
            this.emit({ type: 'edge', areaId: this.player.areaId, side: input.dir });
          }
          break;
        }
        // Correct small corner overlaps, checking the entire lateral route.
        let corrected = false;
        for (const sign of [-1, 1]) {
          for (let offset = 1; offset <= 5; offset++) {
            const cx = this.player.x + (dy ? sign * offset : 0);
            const cy = this.player.y + (dx ? sign * offset : 0);
            if (!canStand(this.area, cx, cy)) break;
            if (canStand(this.area, cx + dx * step, cy + dy * step)) {
              nx = cx + dx * step;
              ny = cy + dy * step;
              corrected = true;
              break;
            }
          }
          if (corrected) break;
        }
        if (!corrected) break;
      }
      this.player.x = nx;
      this.player.y = ny;
      this.moving = true;
      this.edgeContact = null;
      this.walkTime += step / (input.run ? RUN_SPEED : WALK_SPEED);
      remaining -= step;
      const tx = pxToTile(nx);
      const ty = pxToTile(ny - 4);
      const portal = this.area.portalAt.get(ty * this.area.width + tx);
      if (portal) {
        const fromAreaId = this.player.areaId;
        this.player = { areaId: portal.to.areaId, ...feetAtTile(portal.to.x, portal.to.y), facing: portal.to.facing };
        this.emit({ type: 'portal', portalId: portal.id, fromAreaId, toAreaId: portal.to.areaId, facilityId: portal.facilityId });
        this.emit({ type: 'area-enter', areaId: this.player.areaId });
        break;
      }
    }
  }

  facingInteraction(): InteractionDef | undefined {
    const { dx, dy } = DIR[this.player.facing];
    const tx = pxToTile(this.player.x) + dx;
    const ty = pxToTile(this.player.y - 4) + dy;
    if (tx < 0 || ty < 0 || tx >= this.area.width || ty >= this.area.height) return undefined;
    return this.area.interactionAt.get(ty * this.area.width + tx);
  }

  action(): void {
    if (this.dialog) {
      this.dialog.index++;
      if (this.dialog.index >= this.dialog.lines.length) this.dialog = null;
      return;
    }
    const target = this.facingInteraction();
    if (!target) return;
    const response = this.emit({ type: 'interact', areaId: this.player.areaId, interactionId: target.id, eventKey: target.eventKey });
    const lines = response ? response.lines : target.lines;
    if (lines.length) {
      this.dialog = { speaker: response?.speaker ?? target.name, lines: [...lines], index: 0 };
      this.moving = false;
    }
  }

  setAppearance(a: PlayerAppearance): void {
    this.appearance = normalizeAppearance(a);
  }

  reset(): void {
    const s = this.world.start;
    this.player = { areaId: s.areaId, ...feetAtTile(s.x, s.y), facing: s.facing };
    this.dialog = null;
    this.moving = false;
    this.walkTime = 0;
    this.edgeContact = null;
    this.emit({ type: 'area-enter', areaId: s.areaId });
  }

  serialize(): SaveData {
    return { v: 1, variantId: this.world.variant.id, ...this.player, appearance: normalizeAppearance(this.appearance) };
  }
}
