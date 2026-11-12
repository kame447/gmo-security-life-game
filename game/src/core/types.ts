/**
 * マップのデータ契約。描画（render/）から独立し、Node 上のテストでも読める。
 * ID は英小文字 kebab-case。表示名（name）とは別に持つ。
 */
import type { Facing } from './coords';
import type { PlayerAppearance } from './appearance';

export type AreaKind = 'outdoor' | 'indoor';

/** 年代区分。今回データを用意したのは childhood のみ。 */
export type AgeStage = 'childhood' | 'student' | 'adult' | 'middle' | 'senior';

export type FacilityInterior = 'full' | 'interaction' | 'background';
export type FacilityState = 'open' | 'closed';

export interface FacilityDef {
  id: string;
  name: string;
  areaId: string;
  interior: FacilityInterior;
  state: FacilityState;
}

/** 街区（エリア内の区画）。HUD の現在地表示と将来のチャンク分割単位に使う。 */
export interface DistrictDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 建物・木・家具などの配置物。x,y,w,h は当たり判定の足元（タイル単位）。見た目は kind/style で決まる。 */
export interface ObjectDef {
  id?: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  style?: string;
  /** decal は地面の直後に描き、前後関係の並べ替えに参加しない。 */
  layer?: 'decal' | 'sorted';
  facilityId?: string;
}

export interface PortalDef {
  id: string;
  /** 判定タイル（w で横幅を広げられる）。 */
  from: { x: number; y: number; w?: number };
  to: { areaId: string; x: number; y: number; facing: Facing };
  facilityId?: string;
}

export type InteractionKind = 'npc' | 'object' | 'sign';

export interface InteractionDef {
  id: string;
  kind: InteractionKind;
  name: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** NPC の見た目。object/sign は配置物側が描くので省略できる。 */
  sprite?: string;
  facing?: Facing;
  solid: boolean;
  /** イベント管理へ渡す識別子。条件評価はここでは行わない。 */
  eventKey: string;
  /** イベント管理が何も返さないときの既定の会話。 */
  lines: string[];
}

export interface AreaDef {
  id: string;
  name: string;
  kind: AreaKind;
  width: number;
  height: number;
  /** 地面タイルID（world/tiles.ts の T）。長さ width*height。 */
  ground: Uint8Array;
  objects: ObjectDef[];
  portals: PortalDef[];
  interactions: InteractionDef[];
  districts?: DistrictDef[];
}

/** 年代差分。基底マップは変えず、施設状態・出入口・NPC の有効／追加だけを差し替える。 */
export interface VariantDef {
  id: string;
  stage: AgeStage;
  facilityStates?: Record<string, FacilityState>;
  disabledPortals?: string[];
  disabledInteractions?: string[];
  extraInteractions?: Record<string, InteractionDef[]>;
}

export interface SpawnPoint {
  areaId: string;
  x: number;
  y: number;
  facing: Facing;
}

/** マップ探索からイベント管理へ渡す通知。 */
export type MapEvent =
  | { type: 'interact'; areaId: string; interactionId: string; eventKey: string }
  | { type: 'portal'; portalId: string; fromAreaId: string; toAreaId: string; facilityId?: string }
  | { type: 'area-enter'; areaId: string }
  | { type: 'edge'; areaId: string; side: Facing };

/** イベント管理側が実装する受け口。会話を差し替えたいときは lines を返す。 */
export interface MapEventSink {
  onMapEvent(e: MapEvent): { speaker?: string; lines: string[] } | void;
}

export interface SaveData {
  v: 1;
  variantId: string;
  areaId: string;
  x: number;
  y: number;
  facing: Facing;
  /** Optional for v1 saves made before appearance customization was added. */
  appearance?: PlayerAppearance;
}
