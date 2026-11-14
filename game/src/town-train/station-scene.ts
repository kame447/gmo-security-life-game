import type { Facing } from '../core/coords';
import { TILE } from '../core/coords';
import { getStationFlow, STATION_FLOW_IDS, type StationPlatform } from '../world/station-flow';
import type { RailDirection } from '../world/rail-geometry';
import { TRAIN_LENGTH_PX, trainDoorLocalX } from './car';

export { TRAIN_LENGTH_PX, TRAIN_HEIGHT_PX, trainDoorLocalX } from './car';

/** 駅の構内に描く列車の状態。x は車列の左端（エリアの座標 px）、doorOpen は全ドアの開き具合（0..1）。 */
export interface StationTrainState { direction: RailDirection; x: number; doorOpen: number }
/** 演出中、実際の主人公の代わりに描く人物。y は足元の px。カメラはこの人物に追従する。 */
export interface StationActorState { x: number; y: number; facing: Facing; walking: boolean; visible: boolean }
export interface StationSceneState { trains: readonly StationTrainState[]; actor?: StationActorState }

let scenes = new Map<string, StationSceneState>();
let fadeSuppressed = false;

/** 描画だけが読むモジュール内の状態。ゲーム本体の状態・保存には触れない。エリア ID が一致するときだけ効く。 */
export const stationScene = {
  set(areaId: string, state: StationSceneState | null): void {
    if (!state) scenes.delete(areaId); else scenes.set(areaId, state);
  },
  get(areaId: string): StationSceneState | null { return scenes.get(areaId) ?? null; },
  /** true の間は、エリア切替時の 0.2s の黒フェードを出さない。 */
  setFadeSuppressed(on: boolean): void { fadeSuppressed = on; },
  isFadeSuppressed(): boolean { return fadeSuppressed; },
  reset(): void { scenes = new Map(); fadeSuppressed = false; },
};

/** 停車したとき、ドアがホームの door.x の tile 中心に揃う x。 */
export function trainStopX(p: StationPlatform): number {
  return p.door.x * TILE + TILE / 2 - trainDoorLocalX(p.heading);
}
/** 到着前の画面外の x（arriveFrom 側）。 */
export function trainEntryX(p: StationPlatform, areaWidthPx: number): number {
  return p.heading === 'right' ? -TRAIN_LENGTH_PX - TILE : areaWidthPx + TILE;
}
/** 発車後の画面外の x（heading 側）。 */
export function trainExitX(p: StationPlatform, areaWidthPx: number): number {
  return p.heading === 'right' ? areaWidthPx + TILE : -TRAIN_LENGTH_PX - TILE;
}

/** 構内の areaId と方向から、その線の行（y）と進行方向を返す。駅以外は null。 */
export function stationPlatformRow(areaId: string, direction: RailDirection): { y: number; heading: StationPlatform['heading'] } | null {
  for (const id of STATION_FLOW_IDS) {
    const flow = getStationFlow(id);
    if (flow.gate.areaId !== areaId) continue;
    const p = flow.platforms.find(item => item.direction === direction);
    if (p) return { y: p.track.y, heading: p.heading };
  }
  return null;
}
