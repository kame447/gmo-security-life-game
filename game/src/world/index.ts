/**
 * ワールドの組み立て口。エリア定義の登録、年代差分の適用、実行時索引への変換を行う。
 * 経路探索・検証・座標の目印は個別モジュールにあり、ここから再公開する。
 */
import type { AreaDef, VariantDef } from '../core/types';
import { createClassroom, createHome, createKonbini } from './interiors';
import { START } from './landmarks';
import { toRuntime, type AreaRuntime, type World } from './runtime';
import { createTown, FACILITIES } from './town';
import { SHOP_AREA_FACTORIES } from './shops';

export { LANDMARKS, START } from './landmarks';
export { districtAt, isSolidTile, type AreaRuntime, type World } from './runtime';
export { findPath } from './path';
export { validateWorld } from './validate';

export const CHILDHOOD_VARIANT: VariantDef = {
  id: 'childhood',
  stage: 'childhood',
  edgeMessage: 'きょうは このあたりを たんけんしよう。',
};

/** 読み込むエリアの一覧。新しいエリアはここに定義関数を追加する。 */
export const AREA_FACTORIES: readonly (() => AreaDef)[] = [createTown, createHome, createClassroom, createKonbini, ...SHOP_AREA_FACTORIES];

/** 年代差分で無効化された出入口・調査対象を除き、追加分を足した定義を返す。 */
function applyVariant(base: AreaDef, variant: VariantDef, isClosed: (facilityId: string) => boolean): AreaDef {
  return {
    ...base,
    portals: base.portals.filter(p => !variant.disabledPortals?.includes(p.id) && (!p.facilityId || !isClosed(p.facilityId))),
    interactions: [...base.interactions, ...(variant.extraInteractions?.[base.id] ?? [])]
      .filter(i => !variant.disabledInteractions?.includes(i.id)),
  };
}

export function buildWorld(variant: VariantDef = CHILDHOOD_VARIANT): World {
  const facilities = new Map(FACILITIES.map(f => [f.id, { ...f, state: variant.facilityStates?.[f.id] ?? f.state }]));
  const isClosed = (id: string) => facilities.get(id)?.state === 'closed';
  const areas = new Map<string, AreaRuntime>();
  for (const create of AREA_FACTORIES) {
    const runtime = toRuntime(applyVariant(create(), variant, isClosed));
    areas.set(runtime.def.id, runtime);
  }
  return { areas, facilities, start: { ...START }, variant };
}
