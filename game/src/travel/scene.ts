import { TILE } from '../core/coords';
import type { PlayerAppearance } from '../core/appearance';
import { R, type C2D } from '../render/draw';
import { drawGroundTile } from '../render/ground';
import { playerSprite } from '../render/sprites';
import { drawTrainFrame } from '../town-train/render';
import { TOWN_TRAIN_PROTOTYPE } from '../town-train/config';
import { T } from '../world/tiles';
import type { Direction } from './direction';
import type { RideSnapshot } from './ride';

/**
 * 乗車演出の場面。画面いっぱいに島式ホームの断面を描き（黒い余白を作らない）、列車は町を走る列車と同じ描画を使う。
 * 下りの線はホームの北、上りの線はホームの南。出発した列車が画面の外へ出たあと、同じ向きから到着の列車が入ってくる。
 */
export interface SceneGeometry {
  readonly cols: number;
  readonly rows: number;
  readonly layout: readonly number[];
  readonly trackRow: number;
  readonly edgeRow: number;
  readonly doorCol: number;
  readonly standRow: number;
  readonly boardFacing: 'up' | 'down';
  readonly alightFacing: 'up' | 'down';
}

export function geometryOf(direction: Direction, cols = 26, rows = 15): SceneGeometry {
  const down = direction === 'down';
  const trackRow = down ? Math.floor(rows * 0.3) : Math.ceil(rows * 0.7);
  const layout = Array.from({ length: rows }, (_, y) => {
    if (down) return y < trackRow - 1 ? T.WALL : y === trackRow - 1 ? T.RAIL_FENCE : y === trackRow ? T.RAIL : y === trackRow + 1 ? T.PLATFORM_EDGE : T.PLATFORM;
    return y > trackRow + 1 ? T.WALL : y === trackRow + 1 ? T.RAIL_FENCE : y === trackRow ? T.RAIL : T.PLATFORM;
  });
  return { cols, rows, layout, trackRow, edgeRow: down ? trackRow + 1 : trackRow - 1, doorCol: Math.floor(cols / 2),
    standRow: down ? trackRow + 4 : trackRow - 4, boardFacing: down ? 'up' : 'down', alightFacing: down ? 'down' : 'up' };
}

const ease = (p: number) => p * p;
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const sign = (heading: 'left' | 'right') => heading === 'right' ? 1 : -1;
const feetY = (row: number) => row * TILE + 14;

export interface SceneState {
  readonly trainOffset: number; readonly door: number;
  readonly player: { readonly y: number; readonly alpha: number; readonly facing: 'up' | 'down'; readonly walking: boolean } | null;
}

/** スナップショットから、車両・ドア・主人公の位置を決める（描画なし）。画面を暗くする量は無い。 */
export function sceneState(s: RideSnapshot, g: SceneGeometry): SceneState {
  const dir = sign(s.heading), p = s.progress, distance = g.cols * TILE + TOWN_TRAIN_PROTOTYPE.lengthPixels;
  const doorY = feetY(g.edgeRow), standY = feetY(g.standRow), none = { trainOffset: 0, door: 0, player: null };
  const outside = feetY(g.boardFacing === 'up' ? g.rows + 1 : -2);
  switch (s.phase) {
    case 'walk-in': {
      const walk = Math.min(1, p / 0.85), sink = Math.max(0, (p - 0.85) / 0.15);
      return { ...none, door: 1, player: { y: outside + (doorY - outside) * walk, alpha: 1 - sink, facing: g.boardFacing, walking: p < 0.85 } };
    }
    case 'door-close': return { ...none, door: 1 - p };
    case 'depart': return { ...none, trainOffset: dir * ease(p) * distance };
    case 'arrive': return { ...none, trainOffset: -dir * (1 - easeOut(p)) * distance };
    case 'door-open': return { ...none, door: p };
    case 'walk-out': return { ...none, door: 1, player: { y: doorY + (standY - doorY) * p, alpha: Math.min(1, p / 0.2), facing: g.alightFacing, walking: true } };
    case 'settle': return { ...none, door: 1, player: { y: standY, alpha: 1, facing: g.alightFacing, walking: false } };
    default: return none;
  }
}

export function drawRideScene(c: C2D, appearance: PlayerAppearance, snapshot: RideSnapshot, g: SceneGeometry, direction: Direction, nowMs: number): void {
  const state = sceneState(snapshot, g), width = g.cols * TILE;
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
    drawGroundTile(c, g.layout[y], x * TILE, y * TILE, x, y + 20, (_dx, dy) => g.layout[Math.min(g.rows - 1, Math.max(0, y + dy))]);
  }
  const { lengthPixels: length, heightPixels } = TOWN_TRAIN_PROTOTYPE;
  const strip = { left: 0, top: g.trackRow * TILE, right: width, bottom: (g.trackRow + 1) * TILE };
  const doorCenter = g.doorCol * TILE + TILE / 2;
  const height = Math.min(heightPixels, TILE), trainY = strip.top + (TILE - height) / 2;
  const trainX = doorCenter - length / 2 + state.trainOffset;
  drawTrainFrame(c, { x: trainX, y: trainY, length, height, strip, direction, heading: snapshot.heading });
  const gap = Math.round(14 * state.door);
  if (gap > 0) {
    c.save(); c.beginPath(); c.rect(0, strip.top, width, TILE); c.clip();
    R(c, '#1b2831', Math.round(doorCenter - gap / 2 + state.trainOffset), trainY + 3, gap, Math.max(1, height - 6));
    c.restore();
  }
  if (state.player && state.player.alpha > 0) {
    const frame = state.player.walking ? (Math.floor(nowMs / 130) % 2 + 1) as 1 | 2 : 0;
    const sprite = playerSprite(appearance, state.player.facing, frame);
    c.globalAlpha = Math.min(1, state.player.alpha);
    c.drawImage(sprite.canvas, Math.round(doorCenter + sprite.ox), Math.round(state.player.y + sprite.oy));
    c.globalAlpha = 1;
  }
}
