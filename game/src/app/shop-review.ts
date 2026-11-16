import { DIR, feetAtTile, type Facing } from '../core/coords';
import { applyBagReviewFixture } from '../data/bag-review-fixture';
import { STORE_CONTACTS } from '../data/stores';
import { canStand } from '../map/explorer';
import type { Game } from '../session/game';
import { findPath } from '../world';

/** URL review=1だけの一時fixture。既存の室内/店員を読み取り、配置は変更しない。 */
export function prepareShopReview(game: Game): boolean {
  const store = STORE_CONTACTS[0], area = game.world.areas.get(store.interiorAreaId);
  const clerk = area?.interactions.find(item => item.kind === 'npc' && item.eventKey === store.clerkEventKey);
  const entrance = [...game.world.areas.values()].flatMap(a => a.def.portals).find(portal => portal.id === store.entrancePortalId);
  if (!area || !clerk || !entrance) return false;
  for (const facing of ['up', 'right', 'down', 'left'] as Facing[]) {
    const { dx, dy } = DIR[facing], tile = { x: clerk.x - dx, y: clerk.y - dy };
    const position = feetAtTile(tile.x, tile.y);
    if (!canStand(area, position.x, position.y) || area.portalAt.has(tile.y * area.width + tile.x) || !findPath(area, entrance.to, tile)) continue;
    if (!applyBagReviewFixture(game.assets).ok) return false;
    game.player = { areaId: area.def.id, ...position, facing };
    return true;
  }
  return false;
}
