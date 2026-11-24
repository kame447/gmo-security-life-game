/**
 * マップ探索：移動・衝突・出入口の遷移・調査対象の判定だけを扱う（DOM 非依存）。
 * 会話・外見・保存は扱わず、起きたことは MapEvent として通知する。
 */
import { DIR, TILE, feetAtTile, pxToTile, type Facing } from '../core/coords';
import type { InteractionDef, MapEvent, PortalDef, SpawnPoint } from '../core/types';
import type { AreaRuntime, World } from '../world';
import { T, isSolidGround } from '../world/tiles';
import { crossingTime, watchCrossingClock } from '../town-train/crossing-clock';
import { CROSSING_PROTOTYPE, canTakeCrossingStep, crossingContains, crossingState, getCrossings, type Crossing } from '../town-train/crossings';

export interface InputState { dir: Facing | null; run: boolean }
export interface PlayerPosition { areaId: string; x: number; y: number; facing: Facing }

export const WALK_SPEED = 72;
export const RUN_SPEED = 128;
export const BIKE_SPEED = 176;
export const BIKE_DASH_SPEED = 240;
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

const inArea = (area: AreaRuntime, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < area.width && ty < area.height;

const coversTile = (rect: { x: number; y: number; w: number; h: number }, tx: number, ty: number): boolean =>
  tx >= rect.x && ty >= rect.y && tx < rect.x + rect.w && ty < rect.y + rect.h;

/** Whether (tx, ty) is solely a solid shop counter (not a wall, portal, or other solid obstacle). */
function isShopCounterTile(area: AreaRuntime, tx: number, ty: number): boolean {
  const index = ty * area.width + tx;
  if (!area.solid[index] || area.portalAt.has(index)) return false;
  // Hand-built AreaRuntime test fixtures may leave ground zeroed as T.VOID.
  if (area.ground[index] !== T.VOID && isSolidGround(area.ground[index])) return false;
  let hasCounter = false;
  for (const object of area.objects) {
    if (!object.solid || !coversTile(object, tx, ty)) continue;
    if (object.kind !== 'counter' && !object.kind.endsWith('-counter')) return false;
    hasCounter = true;
  }
  return hasCounter;
}

export class MapExplorer {
  player: PlayerPosition;
  moving = false;
  walkTime = 0;
  /** On the bicycle. Outdoors only; not saved. */
  riding = false;
  private edgeContact: string | null = null;
  /** Returns false for a door the story has not opened yet; the player stops in front of it. */
  portalGuard?: (portal: PortalDef) => boolean;
  private escape: { crossingId: string; points: { x: number; y: number }[] } | null = null;
  private retreatedThisFrame = false;

  constructor(
    private readonly world: World,
    start: PlayerPosition,
    private readonly emit: (e: MapEvent) => void,
  ) {
    this.player = start;
    watchCrossingClock(this);
  }

  get area(): AreaRuntime { return this.world.areas.get(this.player.areaId)!; }

  /** Stop the walk animation without touching position or edge state (e.g. while a dialog is open). */
  halt(): void { this.moving = this.escape !== null; }

  /** Safety runs before drawing even when a map/dialog has stopped ordinary Game.update. */
  crossingTick(timeSeconds: number, dt: number, input: InputState): void {
    this.retreatedThisFrame = false;
    const crossing = getCrossings(this.area).find(c => crossingContains(c, this.player.x, this.player.y) &&
      crossingState(this.area, c, timeSeconds).blocked);
    if (!crossing) { if (this.escape) this.moving = false; this.escape = null; return; }
    const state = crossingState(this.area, crossing, timeSeconds);
    const length = (points: { x: number; y: number }[]) => {
      let x = this.player.x, y = this.player.y, distance = 0;
      for (const p of points) { distance += Math.abs(p.x - x) + Math.abs(p.y - y); x = p.x; y = p.y; }
      return distance;
    };
    let points = this.escapePoints(crossing), speed = WALK_SPEED;
    if (!points) return; // Every standable authored position has a tested, clear escape route.
    if (input.dir === 'up' || input.dir === 'down') {
      const requested = this.escapePoints(crossing, input.dir === 'up' ? crossing.northWaitY : crossing.southWaitY);
      // Reserve enough time for walking even if the player releases run or changes their mind next frame.
      if (requested && state.nextArrivalIn > length(requested) / WALK_SPEED + CROSSING_PROTOTYPE.escapeMarginSeconds) {
        points = requested; speed = input.run ? RUN_SPEED : WALK_SPEED;
      }
    }
    this.escape = { crossingId: crossing.id, points };
    const distance = length(points);
    // A restored save or a suspended tab can arrive too late for walking. Recover before its first train frame.
    const recover = state.nextArrivalIn <= distance / WALK_SPEED + CROSSING_PROTOTYPE.escapeMarginSeconds;
    let remaining = recover ? distance : dt * speed;
    this.moving = remaining > 0;
    this.retreatedThisFrame = this.moving;
    while (remaining > 1e-9 && points.length) {
      const p = points[0], dx = p.x - this.player.x, dy = p.y - this.player.y;
      const length = Math.abs(dx) + Math.abs(dy), step = Math.min(length, remaining);
      if (length < 1e-9) { points.shift(); continue; }
      this.player.facing = dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.player.x += Math.sign(dx) * step; this.player.y += Math.sign(dy) * step;
      if (!recover) this.walkTime += step / speed;
      remaining -= step;
      if (step >= length) points.shift();
    }
    if (!points.length) { this.escape = null; this.moving = false; }
  }

  /** Straight walking routes to either wait line, validated against the unchanged static hitbox. */
  private escapePoints(c: Crossing, requestedY?: number): { x: number; y: number }[] | null {
    const { x, y } = this.player;
    const candidates: { points: { x: number; y: number }[]; distance: number }[] = [];
    const middleX = Math.max(c.left + HITBOX.halfW, Math.min(c.right - HITBOX.halfW, x));
    for (const targetY of requestedY === undefined ? [c.northWaitY, c.southWaitY] : [requestedY]) for (const targetX of [x, middleX]) {
      const points = [{ x: targetX, y }, { x: targetX, y: targetY }].filter((p, i) =>
        i === 0 ? p.x !== x : p.y !== y);
      let from = { x, y }, distance = 0, valid = true;
      for (const p of points) {
        const length = Math.abs(p.x - from.x) + Math.abs(p.y - from.y), count = Math.ceil(length);
        for (let i = 1; i <= count; i++) if (!canStand(this.area,
          from.x + (p.x - from.x) * i / count, from.y + (p.y - from.y) * i / count)) { valid = false; break; }
        distance += length; from = p;
      }
      const tile = feetTile({ ...this.player, ...from });
      if (valid && !this.area.portalAt.has(tile.ty * this.area.width + tile.tx)) candidates.push({ points, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.points ?? null;
  }

  /** Get on or off the bicycle. Getting on is allowed only outdoors; returns whether the state changed. */
  toggleBicycle(): boolean {
    if (!this.riding && this.area.def.kind !== 'outdoor') return false;
    this.riding = !this.riding;
    return true;
  }

  update(dt: number, input: InputState): void {
    if (this.escape || this.retreatedThisFrame) { this.moving = this.escape !== null; return; }
    this.moving = false;
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (!input.dir) { this.edgeContact = null; return; }
    this.player.facing = input.dir;
    const speed = this.riding ? (input.run ? BIKE_DASH_SPEED : BIKE_SPEED) : input.run ? RUN_SPEED : WALK_SPEED;
    let remaining = dt * speed;
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      const next = this.nextPosition(input.dir, step);
      if (!next) break;
      if (this.blockedPortalAt(next)) break;
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
    const canMove = (x: number, y: number): boolean => {
      if (!canStand(this.area, x, y)) return false;
      const time = crossingTime();
      return time === null || getCrossings(this.area).every(c => canTakeCrossingStep(c, crossingState(this.area, c, time), this.player, { x, y }));
    };
    if (canMove(nx, ny)) return { x: nx, y: ny };
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
        if (!canMove(cx, cy)) break;
        if (canMove(cx + dx * step, cy + dy * step)) return { x: cx + dx * step, y: cy + dy * step };
      }
    }
    return null;
  }

  /** A guarded portal acts as a wall and is reported once per contact, like the map edge. */
  private blockedPortalAt(next: { x: number; y: number }): boolean {
    if (!this.portalGuard) return false;
    const { tx, ty } = feetTile({ ...this.player, ...next });
    const portal = this.area.portalAt.get(ty * this.area.width + tx);
    if (!portal || this.portalGuard(portal)) return false;
    const key = `${this.player.areaId}:portal:${portal.id}`;
    if (key !== this.edgeContact) {
      this.edgeContact = key;
      this.emit({ type: 'portal-blocked', areaId: this.player.areaId, portalId: portal.id });
    }
    return true;
  }

  private enterPortal(): boolean {
    const { tx, ty } = feetTile(this.player);
    const portal = this.area.portalAt.get(ty * this.area.width + tx);
    if (!portal) return false;
    const fromAreaId = this.player.areaId;
    this.player = positionAt({ ...portal.to });
    if (this.area.def.kind !== 'outdoor') this.riding = false;
    this.emit({ type: 'portal', portalId: portal.id, fromAreaId, toAreaId: portal.to.areaId, facilityId: portal.facilityId });
    this.emit({ type: 'area-enter', areaId: this.player.areaId });
    return true;
  }

  facingInteraction(): InteractionDef | undefined {
    const { dx, dy } = DIR[this.player.facing];
    const { tx: fx, ty: fy } = feetTile(this.player);
    const tx = fx + dx, ty = fy + dy;
    if (!inArea(this.area, tx, ty)) return undefined;
    const direct = this.area.interactionAt.get(ty * this.area.width + tx);
    if (direct) return direct;
    if (!isShopCounterTile(this.area, tx, ty)) return undefined;
    const tx2 = tx + dx, ty2 = ty + dy;
    if (!inArea(this.area, tx2, ty2)) return undefined;
    const across = this.area.interactionAt.get(ty2 * this.area.width + tx2);
    return across?.kind === 'npc' ? across : undefined;
  }

  reset(start: PlayerPosition): void {
    this.player = start;
    this.moving = false;
    this.walkTime = 0;
    this.riding = false;
    this.edgeContact = null;
    this.escape = null;
    this.retreatedThisFrame = false;
  }
}
