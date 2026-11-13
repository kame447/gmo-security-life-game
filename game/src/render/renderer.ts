import { CHUNK_PX, CHUNK_TILES, TILE, chunkId, feetAtTile, hash2, type Facing } from '../core/coords';
import type { PlayerAppearance } from '../core/appearance';
import type { AreaRuntime } from '../world';
import { T } from '../world/tiles';
import { drawTownTrains } from '../town-train/render';
import { makeCanvas, R, type C2D } from './draw';
import { drawGroundTile } from './ground';
import { characterSprite, objectSprite, playerSprite, type Sprite } from './sprites';

const CACHE_LIMIT = 24;
interface Chunk { canvas: HTMLCanvasElement; water: { x: number; y: number; phase: number }[] }
interface Item { sprite: Sprite; x: number; y: number; depth: number; decal: boolean; character: boolean; seen: number }
interface Marker { x: number; y: number; feetX: number; feetY: number }
interface AreaIndex { buckets: Map<string, Item[]>; markers: Marker[]; characterClip?: Path2D }
/** 描画に必要な読み取り専用の状態。ゲーム本体（session/）には依存しない。 */
export interface RenderView {
  readonly area: AreaRuntime;
  readonly player: { readonly x: number; readonly y: number; readonly facing: Facing };
  readonly appearance: PlayerAppearance;
  readonly moving: boolean;
  readonly walkTime: number;
  /** While a dialog is open, interaction markers are hidden. */
  readonly dialog: object | null;
}
export interface RenderTimings {
  totalMs: number; clearMs: number; groundMs: number; bakeMs: number;
  gatherMs: number; sortMs: number; spritesMs: number; waterMs: number; markersMs: number; fadeMs: number;
}

/** Static terrain is baked lazily; only the visible sprite buckets are visited each frame. */
export class Renderer {
  private readonly c: C2D;
  private readonly chunks = new Map<string, Chunk>();
  private readonly indices = new WeakMap<AreaRuntime, AreaIndex>();
  private activeArea?: AreaRuntime;
  private fadeStartedAt: number | null = null;
  private tick = 0;
  private zoom = 1;
  private viewW = 1;
  private viewH = 1;
  private readonly decals: Item[] = [];
  private readonly sorted: Item[] = [];
  private readonly visibleChunks: Chunk[] = [];
  /** Opt in only while profiling; ordinary draws never call performance.now(). */
  measureTimings = false;
  private readonly timings: RenderTimings = { totalMs: 0, clearMs: 0, groundMs: 0, bakeMs: 0, gatherMs: 0, sortMs: 0, spritesMs: 0, waterMs: 0, markersMs: 0, fadeMs: 0 };
  readonly stats = { chunksCached: 0, chunksDrawn: 0, spritesDrawn: 0, zoom: 1, viewW: 1, viewH: 1, indoor: false, fading: false, camX: 0, camY: 0, chunksBakedThisFrame: 0, timings: null as RenderTimings | null };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D is unavailable');
    this.c = c;
    this.resize(canvas.clientWidth || 640, canvas.clientHeight || 480, 1);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW));
    const h = Math.max(1, Math.round(cssH));
    const density = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    this.canvas.width = Math.max(1, Math.round(w * density));
    this.canvas.height = Math.max(1, Math.round(h * density));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.imageRendering = 'pixelated';
    // Aim for 26 tiles across, keeping the scale an integer in physical pixels.
    this.zoom = Math.max(1, Math.round(this.canvas.width / (26 * TILE)));
    // Cover the partial logical pixel at the right/bottom without introducing a
    // fractional camera coordinate or rescaling the backing canvas in CSS.
    this.viewW = Math.ceil(this.canvas.width / this.zoom);
    this.viewH = Math.ceil(this.canvas.height / this.zoom);
    this.c.imageSmoothingEnabled = false;
    Object.assign(this.stats, { zoom: this.zoom, viewW: this.viewW, viewH: this.viewH });
  }

  private ground(area: AreaRuntime, cx: number, cy: number): Chunk {
    const key = chunkId(area.def.id, cx, cy);
    const hit = this.chunks.get(key);
    if (hit) {
      this.chunks.delete(key);
      this.chunks.set(key, hit);
      return hit;
    }
    const bakeStart = this.measureTimings ? performance.now() : 0;
    this.stats.chunksBakedThisFrame++;
    const [canvas, c] = makeCanvas(CHUNK_PX, CHUNK_PX);
    const water: Chunk['water'] = [];
    const get = (tx: number, ty: number) => tx < 0 || ty < 0 || tx >= area.width || ty >= area.height ? T.VOID : area.ground[ty * area.width + tx];
    for (let ly = 0; ly < CHUNK_TILES; ly++) for (let lx = 0; lx < CHUNK_TILES; lx++) {
      const tx = cx * CHUNK_TILES + lx, ty = cy * CHUNK_TILES + ly;
      if (tx >= area.width || ty >= area.height) continue;
      const tile = get(tx, ty);
      if (area.def.kind === 'indoor' && tile === T.VOID) R(c, '#000000', lx * TILE, ly * TILE, TILE, TILE);
      else drawGroundTile(c, tile, lx * TILE, ly * TILE, tx, ty, (dx, dy) => get(tx + dx, ty + dy));
      if (tile === T.WATER && hash2(tx, ty, 140) > 0.66) water.push({ x: tx * TILE + 3 + Math.floor(hash2(tx, ty, 141) * 9), y: ty * TILE + 4 + Math.floor(hash2(tx, ty, 142) * 8), phase: hash2(tx, ty, 143) * Math.PI * 2 });
    }
    const chunk = { canvas, water };
    this.chunks.set(key, chunk);
    if (this.chunks.size > CACHE_LIMIT) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    if (this.measureTimings) this.timings.bakeMs += performance.now() - bakeStart;
    return chunk;
  }

  private index(area: AreaRuntime): AreaIndex {
    const existing = this.indices.get(area);
    if (existing) return existing;
    const buckets = new Map<string, Item[]>();
    const insert = (sprite: Sprite, x: number, y: number, depth: number, decal: boolean, character = false) => {
      const item: Item = { sprite, x: x + sprite.ox, y: y + sprite.oy, depth, decal, character, seen: -1 };
      // Bucket by the rendered bounds, including a tree crown / roof above its footprint.
      const left = Math.floor(item.x / CHUNK_PX), right = Math.floor((item.x + sprite.canvas.width - 1) / CHUNK_PX);
      const top = Math.floor(item.y / CHUNK_PX), bottom = Math.floor((item.y + sprite.canvas.height - 1) / CHUNK_PX);
      for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) {
        const key = `${cx},${cy}`;
        let list = buckets.get(key);
        if (!list) { list = []; buckets.set(key, list); }
        list.push(item);
      }
    };
    for (const o of area.objects) insert(objectSprite(o), o.x * TILE, o.y * TILE, (o.y + o.h) * TILE, o.layer === 'decal');
    for (const npc of area.interactions) {
      if (npc.kind !== 'npc') continue;
      const feet = feetAtTile(npc.x, npc.y);
      insert(characterSprite(npc.sprite ?? 'friend', npc.facing ?? 'down', 0), feet.x, feet.y, feet.y, false, true);
    }
    const markers = area.interactions.map(interaction => {
      const feet = feetAtTile(interaction.x, interaction.y);
      const x = interaction.x * TILE + (interaction.w ?? 1) * TILE / 2;
      let y = interaction.y * TILE - 8;
      if (interaction.kind === 'npc') y = feet.y + characterSprite(interaction.sprite ?? 'friend', interaction.facing ?? 'down', 0).oy - 9;
      else {
        const object = area.objects.find(o => interaction.x >= o.x && interaction.x < o.x + o.w && interaction.y >= o.y && interaction.y < o.y + o.h);
        if (object) y = object.y * TILE + objectSprite(object).oy - 9;
      }
      return { x, y, feetX: x, feetY: (interaction.y + (interaction.h ?? 1)) * TILE - 2 };
    });
    let characterClip: Path2D | undefined;
    if (area.def.kind === 'indoor') {
      characterClip = new Path2D();
      const floor = (x: number, y: number) => {
        const t = area.ground[y * area.width + x];
        return t !== T.WALL && t !== T.WALL_TOP && t !== T.VOID;
      };
      // Cache floor runs once: character heads cannot paint over walls or void,
      // while wall-mounted windows and blackboards keep their own artwork.
      for (let y = 0; y < area.height; y++) {
        let x = 0;
        while (x < area.width) {
          if (!floor(x, y)) { x++; continue; }
          const start = x;
          while (x < area.width && floor(x, y)) x++;
          characterClip.rect(start * TILE, y * TILE, (x - start) * TILE, TILE);
        }
      }
    }
    const index = { buckets, markers, characterClip };
    this.indices.set(area, index);
    return index;
  }

  draw(game: RenderView, timeSec: number): void {
    const profiling = this.measureTimings;
    let mark = profiling ? performance.now() : 0;
    const started = mark, timing = this.timings;
    this.stats.timings = profiling ? timing : null;
    if (profiling) {
      timing.bakeMs = 0;
      timing.spritesMs = 0;
    }
    const area = game.area;
    // Runtime ground is immutable. A different runtime with the same area id must not reuse its bake.
    if (this.activeArea !== area) {
      this.fadeStartedAt = this.activeArea ? timeSec : null;
      this.chunks.clear();
      this.activeArea = area;
    }
    const indoor = area.def.kind === 'indoor';
    this.stats.indoor = indoor;
    this.stats.chunksBakedThisFrame = 0;
    const mapW = area.width * TILE, mapH = area.height * TILE;
    // Share the player's rounding before subtracting an integer viewport anchor.
    // Rounding (p - view/2) separately makes odd viewport sizes wobble by 1px.
    const camera = (p: number, size: number, view: number) => size < view ? Math.round((size - view) / 2) : Math.max(0, Math.min(size - view, Math.round(p) - Math.floor(view / 2)));
    const camX = camera(game.player.x, mapW, this.viewW), camY = camera(game.player.y - 8, mapH, this.viewH);
    this.stats.camX = camX;
    this.stats.camY = camY;
    const right = camX + this.viewW, bottom = camY + this.viewH;
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    R(c, indoor ? '#000000' : '#1b1922', 0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.zoom, 0, 0, this.zoom, -camX * this.zoom, -camY * this.zoom);
    c.imageSmoothingEnabled = false;
    c.save();
    if (indoor) { c.beginPath(); c.rect(0, 0, mapW, mapH); c.clip(); }
    if (profiling) { const now = performance.now(); timing.clearMs = now - mark; mark = now; }
    const minCX = Math.floor(camX / CHUNK_PX), maxCX = Math.floor((right - 1) / CHUNK_PX);
    const minCY = Math.floor(camY / CHUNK_PX), maxCY = Math.floor((bottom - 1) / CHUNK_PX);
    this.stats.chunksDrawn = 0;
    this.stats.spritesDrawn = 0;
    this.visibleChunks.length = 0;
    for (let cy = Math.max(0, minCY); cy <= Math.min(Math.ceil(area.height / CHUNK_TILES) - 1, maxCY); cy++) {
      for (let cx = Math.max(0, minCX); cx <= Math.min(Math.ceil(area.width / CHUNK_TILES) - 1, maxCX); cx++) {
        const chunk = this.ground(area, cx, cy);
        c.drawImage(chunk.canvas, cx * CHUNK_PX, cy * CHUNK_PX);
        this.visibleChunks.push(chunk);
        this.stats.chunksDrawn++;
      }
    }
    drawTownTrains(c, area, timeSec);
    this.stats.chunksCached = this.chunks.size;
    if (profiling) { const now = performance.now(); timing.groundMs = Math.max(0, now - mark - timing.bakeMs); mark = now; }
    const index = this.index(area);
    this.tick++;
    this.decals.length = 0;
    this.sorted.length = 0;
    for (let cy = minCY; cy <= maxCY; cy++) for (let cx = minCX; cx <= maxCX; cx++) {
      const list = index.buckets.get(`${cx},${cy}`);
      if (!list) continue;
      for (const item of list) {
        if (item.seen === this.tick) continue;
        item.seen = this.tick;
        if (item.x >= right || item.y >= bottom || item.x + item.sprite.canvas.width <= camX || item.y + item.sprite.canvas.height <= camY) continue;
        (item.decal ? this.decals : this.sorted).push(item);
      }
    }
    if (profiling) { const now = performance.now(); timing.gatherMs = now - mark; mark = now; }
    const drawItem = (item: Item) => {
      if (item.character && index.characterClip) { c.save(); c.clip(index.characterClip); }
      c.drawImage(item.sprite.canvas, item.x, item.y);
      if (item.character && index.characterClip) c.restore();
      this.stats.spritesDrawn++;
    };
    for (const item of this.decals) drawItem(item);
    if (profiling) { const now = performance.now(); timing.spritesMs = now - mark; mark = now; }
    for (const chunk of this.visibleChunks) for (const point of chunk.water) {
      if (point.x < camX || point.x > right || point.y < camY || point.y > bottom) continue;
      const wave = Math.sin(timeSec * 2.1 + point.phase);
      if (wave < 0.2) continue;
      R(c, wave > 0.8 ? '#def3de' : '#9ad7df', point.x, point.y, wave > 0.8 ? 4 : 2, 1);
      if (wave > 0.92) R(c, '#def3de', point.x + 1, point.y - 1, 1, 3);
    }
    if (profiling) { const now = performance.now(); timing.waterMs = now - mark; mark = now; }
    this.sorted.sort((a, b) => a.depth - b.depth || a.x - b.x);
    if (profiling) { const now = performance.now(); timing.sortMs = now - mark; mark = now; }
    const frame = game.moving ? (Math.floor(game.walkTime / 0.15) % 2 + 1) as 1 | 2 : 0;
    const player = playerSprite(game.appearance, game.player.facing, frame);
    let playerDrawn = false;
    const drawPlayer = () => {
      if (index.characterClip) { c.save(); c.clip(index.characterClip); }
      c.drawImage(player.canvas, Math.round(game.player.x) + player.ox, Math.round(game.player.y) + player.oy);
      if (index.characterClip) c.restore();
      this.stats.spritesDrawn++;
      playerDrawn = true;
    };
    for (const item of this.sorted) {
      if (!playerDrawn && game.player.y < item.depth) drawPlayer();
      drawItem(item);
    }
    if (!playerDrawn) drawPlayer();
    if (profiling) { const now = performance.now(); timing.spritesMs += now - mark; mark = now; }
    for (const portal of area.def.portals) {
      const x = portal.from.x * TILE + (portal.from.w ?? 1) * TILE / 2;
      const y = indoor ? portal.from.y * TILE + 10 : (portal.from.y + 1) * TILE + 3;
      if (x < camX - 8 || x > right + 8 || y < camY - 8 || y > bottom + 8) continue;
      // A tiny outlined upward arrow: entrance affordance also works without color.
      c.save(); c.translate(x, y); if (indoor) c.scale(1, -1);
      R(c, '#526d6a', -1, -1, 3, 2);
      R(c, '#526d6a', -3, 1, 7, 2);
      R(c, '#526d6a', -2, 3, 5, 3);
      R(c, '#fff1bf', 0, 0, 1, 2);
      R(c, '#fff1bf', -2, 2, 5, 1);
      R(c, '#fff1bf', -1, 3, 3, 2);
      c.restore();
    }
    if (!game.dialog) for (const marker of index.markers) {
      if (Math.hypot(marker.feetX - game.player.x, marker.feetY - game.player.y) > 3 * TILE) continue;
      if (marker.x < camX - 6 || marker.x > right + 6 || marker.y < camY - 10 || marker.y > bottom) continue;
      R(c, '#526d6a', marker.x - 5, marker.y, 10, 7);
      R(c, '#fff1db', marker.x - 4, marker.y + 1, 8, 5);
      R(c, '#526d6a', marker.x - 2, marker.y + 7, 3, 2);
      R(c, '#fff1db', marker.x - 1, marker.y + 6, 1, 2);
      for (const dx of [-2, 0, 2]) R(c, '#526d6a', marker.x + dx, marker.y + 3, 1, 1);
    }
    if (profiling) { const now = performance.now(); timing.markersMs = now - mark; mark = now; }
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    const fade = this.fadeStartedAt === null ? 0 : Math.max(0, Math.min(1, 1 - (timeSec - this.fadeStartedAt) / 0.2));
    this.stats.fading = fade > 0;
    if (fade > 0) R(c, `rgba(0,0,0,${fade})`, 0, 0, this.canvas.width, this.canvas.height);
    else this.fadeStartedAt = null;
    if (profiling) { const now = performance.now(); timing.fadeMs = now - mark; timing.totalMs = now - started; }
  }
}
