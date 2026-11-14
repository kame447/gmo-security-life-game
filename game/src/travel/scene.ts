import { TILE, feetAtTile } from '../core/coords';
import type { PlayerAppearance } from '../core/appearance';
import { R, type C2D } from '../render/draw';
import { drawGroundTile } from '../render/ground';
import { playerSprite } from '../render/sprites';
import { drawTrainFrame } from '../town-train/render';
import { TOWN_TRAIN_PROTOTYPE } from '../town-train/config';
import { T } from '../world/tiles';
import type { RideSnapshot } from './ride';

/** ホームを横から見た演出用の場面（論理ピクセル）。車両は町を走る列車と同じ描画を使う。 */
export const SCENE_COLS = 20;
export const SCENE_ROWS = 9;
export const SCENE_W = SCENE_COLS * TILE;
export const SCENE_H = SCENE_ROWS * TILE;
const TRACK_TOP = 1, TRACK_ROWS = 2, EDGE_ROW = 3, DOOR_COL = 10, STAND_ROW = 5;
const TRAVEL_DISTANCE = SCENE_W + TOWN_TRAIN_PROTOTYPE.lengthPixels;

const ease = (p: number) => p * p;
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const sign = (heading: 'left' | 'right') => heading === 'right' ? 1 : -1;

export interface SceneState {
  readonly trainOffset: number; readonly door: number;
  readonly player: { readonly y: number; readonly alpha: number; readonly facing: 'up' | 'down'; readonly walking: boolean } | null;
  readonly fade: number;
}

/** スナップショットから、車両・ドア・主人公・暗転の量を決める（描画なし）。 */
export function sceneState(s: RideSnapshot): SceneState {
  const dir = sign(s.heading), p = s.progress;
  const doorY = feetAtTile(DOOR_COL, EDGE_ROW).y, standY = feetAtTile(DOOR_COL, STAND_ROW).y;
  const none = { trainOffset: 0, door: 0, player: null, fade: 0 };
  if (s.failed) return { ...none, fade: s.phase === 'fade-in' ? 1 - p : 0 };
  switch (s.phase) {
    case 'walk-in': {
      const walk = Math.min(1, p / 0.8), sink = Math.max(0, (p - 0.8) / 0.2);
      return { ...none, door: 1, player: { y: standY + (doorY - standY) * walk, alpha: 1 - sink, facing: 'up', walking: p < 0.8 } };
    }
    case 'door-close': return { ...none, door: 1 - p };
    case 'depart': return { ...none, trainOffset: dir * ease(p) * TRAVEL_DISTANCE };
    case 'fade-out': return { ...none, trainOffset: dir * TRAVEL_DISTANCE, fade: p };
    case 'fade-in': return { ...none, trainOffset: -dir * TRAVEL_DISTANCE, fade: 1 - p };
    case 'arrive': return { ...none, trainOffset: -dir * (1 - easeOut(p)) * TRAVEL_DISTANCE };
    case 'door-open': return { ...none, door: p };
    case 'walk-out': return { ...none, door: 1, player: { y: doorY + (standY - doorY) * p, alpha: Math.min(1, p / 0.2), facing: 'down', walking: true } };
    case 'settle': return { ...none, door: 1, player: { y: standY, alpha: 1, facing: 'down', walking: false } };
    default: return none;
  }
}

export function drawRideScene(c: C2D, appearance: PlayerAppearance, snapshot: RideSnapshot, nowMs: number): void {
  const state = sceneState(snapshot);
  c.imageSmoothingEnabled = false;
  R(c, '#000000', 0, 0, SCENE_W, SCENE_H);
  // Row 0 is the fence behind the track; the track occupies rows 1-2 and the platform edge row 3 (see createStation).
  const layout = [T.RAIL_FENCE, T.RAIL, T.RAIL, T.PLATFORM_EDGE, T.PLATFORM, T.PLATFORM, T.PLATFORM, T.PLATFORM, T.VOID];
  for (let y = 0; y < SCENE_ROWS; y++) for (let x = 0; x < SCENE_COLS; x++) {
    drawGroundTile(c, layout[y], x * TILE, y * TILE, x, y + 20, (_dx, dy) => layout[Math.min(SCENE_ROWS - 1, Math.max(0, y + dy))]);
  }
  const { lengthPixels: length, heightPixels } = TOWN_TRAIN_PROTOTYPE;
  const strip = { left: 0, top: TRACK_TOP * TILE, right: SCENE_W, bottom: (TRACK_TOP + TRACK_ROWS) * TILE };
  const doorCenter = DOOR_COL * TILE + TILE / 2;
  const trainX = doorCenter - length / 2 + state.trainOffset;
  const trainY = strip.top + (strip.bottom - strip.top - heightPixels) / 2;
  drawTrainFrame(c, { x: trainX, y: trainY, length, height: heightPixels, strip });
  const gap = Math.round(18 * state.door);
  if (gap > 0) {
    c.save(); c.beginPath(); c.rect(strip.left, strip.top, SCENE_W, strip.bottom - strip.top); c.clip();
    R(c, '#1b2831', Math.round(doorCenter - gap / 2 + state.trainOffset), trainY + 5, gap, heightPixels - 9);
    c.restore();
  }
  if (state.player && state.player.alpha > 0) {
    const frame = state.player.walking ? (Math.floor(nowMs / 130) % 2 + 1) as 1 | 2 : 0;
    const sprite = playerSprite(appearance, state.player.facing, frame);
    c.globalAlpha = Math.min(1, state.player.alpha);
    c.drawImage(sprite.canvas, Math.round(doorCenter + sprite.ox), Math.round(state.player.y + sprite.oy));
    c.globalAlpha = 1;
  }
  if (state.fade > 0) { c.globalAlpha = Math.min(1, state.fade); R(c, '#000000', 0, 0, SCENE_W, SCENE_H); c.globalAlpha = 1; }
}
