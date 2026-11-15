import type { StoreContact } from '../data/stores';
import type { World } from '../world/runtime';

export type StoreProblemCode =
  | 'duplicate-store' | 'duplicate-clerk-contact'
  | 'missing-interior' | 'not-indoor'
  | 'missing-entrance' | 'ambiguous-entrance' | 'invalid-entrance'
  | 'missing-return' | 'missing-clerk' | 'ambiguous-clerk' | 'not-npc';

export interface StoreProblem {
  readonly storeId: string;
  readonly code: StoreProblemCode;
}

/**
 * 接続レコードと、その年代差分を適用済みのWorldを読み取り検証する純粋関数。
 * 地形・座標・到達性の一般検証はvalidateWorld、商品の解決はカタログ側の責務。
 */
export function validateStoreContacts(world: World, stores: readonly StoreContact[]): StoreProblem[] {
  const problems: StoreProblem[] = [];
  const ids = new Set<string>();
  const clerkContacts = new Set<string>();
  const portals = [...world.areas.values()].flatMap(area => area.def.portals.map(portal => ({ area, portal })));

  for (const store of stores) {
    const report = (code: StoreProblemCode) => { problems.push({ storeId: store.storeId, code }); };
    if (ids.has(store.storeId)) report('duplicate-store');
    ids.add(store.storeId);
    const contact = JSON.stringify([store.interiorAreaId, store.clerkEventKey]);
    if (clerkContacts.has(contact)) report('duplicate-clerk-contact');
    clerkContacts.add(contact);

    const indoor = world.areas.get(store.interiorAreaId);
    if (!indoor) report('missing-interior');
    else {
      if (indoor.def.kind !== 'indoor') report('not-indoor');
      const clerks = indoor.interactions.filter(item => item.eventKey === store.clerkEventKey);
      if (clerks.length === 0) report('missing-clerk');
      else if (clerks.length > 1) report('ambiguous-clerk');
      else if (clerks[0].kind !== 'npc') report('not-npc');
    }

    const entrances = portals.filter(({ portal }) => portal.id === store.entrancePortalId);
    if (entrances.length === 0) report('missing-entrance');
    else if (entrances.length > 1) report('ambiguous-entrance');
    else {
      const { area: outdoor, portal } = entrances[0];
      if (outdoor.def.kind !== 'outdoor' || portal.to.areaId !== store.interiorAreaId) report('invalid-entrance');
      // 別の屋外へ出るだけでは往復契約を満たさない。入口側の屋外へ戻れること。
      if (indoor && outdoor.def.kind === 'outdoor' &&
          !indoor.def.portals.some(exit => exit.to.areaId === outdoor.def.id)) report('missing-return');
    }
  }
  return problems;
}
