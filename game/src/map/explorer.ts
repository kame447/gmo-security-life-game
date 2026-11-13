/**
 * マップ探索：移動・衝突・出入口の遷移・調査対象の判定だけを扱う（DOM 非依存）。
 * 会話・外見・保存は扱わず、起きたことは MapEvent として通知する。
 */
import { DIR, TILE, feetAtTile, pxToTile, type Facing } from '../core/coords';
import type { InteractionDef, MapEvent, SpawnPoint } from '../core/types';
import type { AreaRuntime, World } from '../world';

export interface InputState { dir: Facing | null; run: boolean }
export interface PlayerPosition { areaId: string; x: number; y: number; facing: Facing }

export const WALK_SPEED = 72;
export const RUN_SPEED = 128;
export const HITBOX = { halfW: 5, h: 8 };

function outside(area: AreaRuntime, x: number, y: number): boolean {
  return x - HITBOX.halfW < 0 || x + HITBOX.halfW > area.width * TILE ||
    y - HITBOX.h < 0 || y > area.height * TILE;
}

/** Half-open hitbox bounds keep a player touching a wall outside its tile. */
export function canStand(area: AreaRuntime, x: number, y: number): boolean {
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

export function positionAt(spawn: SpawnPoint): PlayerPosition {
  return { areaId: spawn.areaId, ...feetAtTile(spawn.x, spawn.y), facing: spawn.facing };
}

/** The tile under the player's feet, used for portals and facing checks. */
const feetTile = (p: PlayerPosition) => ({ tx: pxToTile(p.x), ty: pxToTile(p.y - 4) });

export class MapExplorer {
  player: PlayerPosition;
  moving = false;
  walkTime = 0;
  private edgeContact: string | null = null;

  constructor(
    private readonly world: World,
    start: PlayerPosition,
    private readonly emit: (e: MapEvent) => void,
  ) {
    this.player = start;
  }

  get area(): AreaRuntime { return this.world.areas.get(this.player.areaId)!; }

  /** Stop the walk animation without touching position or edge state (e.g. while a dialog is open). */
  halt(): void { this.moving = false; }

  update(dt: number, input: InputState): void {
    this.moving = false;
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!input.dir) { this.edgeContact = null; return; }
    this.player.facing = input.dir;
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    let remaining = dt * speed;
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      const next = this.nextPosition(input.dir, step);
      if (!next) break;
      this.player.x = next.x;
      this.player.y = next.y;
      this.moving = true;
      this.edgeContact = null;
      this.walkTime += step / speed;
      remaining -= step;
      if (this.enterPortal()) break;
    }
  }

  /** One sub-pixel step with corner correction; null when blocked (emitting an edge once per contact). */
  private nextPosition(dir: Facing, step: number): { x: number; y: number } | null {
    const { dx, dy } = DIR[dir];
    const nx = this.player.x + dx * step;
    const ny = this.player.y + dy * step;
    if (canStand(this.area, nx, ny)) return { x: nx, y: ny };
    if (outside(this.area, nx, ny)) {
      const key = `${this.player.areaId}:${dir}`;
      if (key !== this.edgeContact) {
        this.edgeContact = key;
        this.emit({ type: 'edge', areaId: this.player.areaId, side: dir });
      }
      return null;
    }
    // Correct small corner overlaps, checking the entire lateral route.
    for (const sign of [-1, 1]) {
      for (let offset = 1; offset <= 5; offset++) {
        const cx = this.player.x + (dy ? sign * offset : 0);
        const cy = this.player.y + (dx ? sign * offset : 0);
        if (!canStand(this.area, cx, cy)) break;
        if (canStand(this.area, cx + dx * step, cy + dy * step)) return { x: cx + dx * step, y: cy + dy * step };
      }
    }
    return null;
  }

  private enterPortal(): boolean {
    const { tx, ty } = feetTile(this.player);
    const portal = this.area.portalAt.get(ty * this.area.width + tx);
    if (!portal) return false;
    const fromAreaId = this.player.areaId;
    this.player = positionAt({ ...portal.to });
    this.emit({ type: 'portal', portalId: portal.id, fromAreaId, toAreaId: portal.to.areaId, facilityId: portal.facilityId });
    this.emit({ type: 'area-enter', areaId: this.player.areaId });
    return true;
  }

  facingInteraction(): InteractionDef | undefined {
    const { dx, dy } = DIR[this.player.facing];
    const { tx: fx, ty: fy } = feetTile(this.player);
    const tx = fx + dx, ty = fy + dy;
    if (tx < 0 || ty < 0 || tx >= this.area.width || ty >= this.area.height) return undefined;
    return this.area.interactionAt.get(ty * this.area.width + tx);
  }

  reset(start: PlayerPosition): void {
    this.player = start;
    this.moving = false;
    this.walkTime = 0;
    this.edgeContact = null;
  }
}
