import type { Facing } from '../core/coords';
import { TILE } from '../core/coords';
import { getStationFlow, STATION_FLOW_IDS, type StationPlatform } from '../world/station-flow';
import { headingOf, type RailDirection, type RailHeading } from '../world/rail-geometry';
import { TRAIN_LENGTH_PX, trainDoorLocalX } from './car';

export { TRAIN_LENGTH_PX, TRAIN_HEIGHT_PX, trainDoorLocalX } from './car';

/** 駅の構内に描く列車の状態。heading は進行方向（構内は1線なので、これで向きが決まる。direction は互換で、あれば heading を導く）。x は車列の左端（エリアの座標 px）、doorOpen は全ドアの開き具合（0..1）。 */
export interface StationTrainState { heading?: RailHeading; direction?: RailDirection; x: number; doorOpen: number }
export const trainHeading = (t: Pick<StationTrainState, 'heading' | 'direction'>): RailHeading => t.heading ?? headingOf(t.direction ?? 'down');
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

/** 停車したとき、ドアがホームの door.x の tile 中心に揃う x（車列の左端）。heading を省くと p の向き。 */
export function trainStopX(p: StationPlatform, heading: RailHeading = p.heading): number {
  return p.door.x * TILE + TILE / 2 - trainDoorLocalX(heading);
}
/** 到着前の画面外の x（heading の反対側から入る）。(p, heading, areaWidthPx) または互換の (p, areaWidthPx)。 */
export function trainEntryX(p: StationPlatform, heading: RailHeading, areaWidthPx: number): number;
export function trainEntryX(p: StationPlatform, areaWidthPx: number): number;
export function trainEntryX(p: StationPlatform, a: RailHeading | number, b?: number): number {
  const [heading, width] = typeof a === 'number' ? [p.heading, a] : [a, b ?? 0];
  return heading === 'right' ? -TRAIN_LENGTH_PX - TILE : width + TILE;
}
/** 発車後の画面外の x（heading 側）。(p, heading, areaWidthPx) または互換の (p, areaWidthPx)。 */
export function trainExitX(p: StationPlatform, heading: RailHeading, areaWidthPx: number): number;
export function trainExitX(p: StationPlatform, areaWidthPx: number): number;
export function trainExitX(p: StationPlatform, a: RailHeading | number, b?: number): number {
  const [heading, width] = typeof a === 'number' ? [p.heading, a] : [a, b ?? 0];
  return heading === 'right' ? width + TILE : -TRAIN_LENGTH_PX - TILE;
}

/** 構内の areaId から線路の行（y）を返す（構内は1線）。駅以外は null。 */
export function stationTrackRow(areaId: string): number | null {
  for (const id of STATION_FLOW_IDS) {
    const flow = getStationFlow(id);
    if (flow.gate.areaId === areaId) return flow.platform.track.y;
  }
  return null;
}
