/** 店内の店員のみに会話を接続する。棚・屋外・未登録のキーは通常会話のまま。 */
import type { AreaDef, InteractionDef } from '../core/types';
import { SHOP_CATALOGS, type ShopCatalog } from '../data/shop-catalogs';
import { STORE_CONTACTS, type StoreContact } from '../data/stores';
import type { ClerkGreeting } from './clerk-flow';

export interface ClerkContext { store: StoreContact; catalog: ShopCatalog; greeting: ClerkGreeting }
export function clerkVisit(area: Pick<AreaDef, 'id' | 'kind'>, target: InteractionDef | undefined,
  stores: readonly StoreContact[] = STORE_CONTACTS, catalogs: readonly ShopCatalog[] = SHOP_CATALOGS): ClerkContext | undefined {
  if (area.kind !== 'indoor' || target?.kind !== 'npc') return;
  const store = stores.find(store => store.interiorAreaId === area.id && store.clerkEventKey === target.eventKey);
  const catalog = store && catalogs.find(catalog => catalog.id === store.catalogId);
  if (store && catalog) return { store, catalog, greeting: { speaker: target.name, lines: target.lines } };
}
