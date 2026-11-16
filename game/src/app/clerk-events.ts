/** MapEventSinkと共通モーダルの接続。NPC定義とマップは変更しない。 */
import type { MapEventSink } from '../core/types';
import type { Game } from '../session/game';
import { clerkVisit, type ClerkContext } from '../shop/clerk-visit';
import type { ModalPanelHost } from '../ui/modal-panels';

export function clerkEvents(game: Game, host: Pick<ModalPanelHost, 'openPanel'>, open: (context: ClerkContext) => void): MapEventSink {
  return { onMapEvent(event) {
    if (event.type !== 'interact' || event.areaId !== game.area.def.id) return;
    const target = game.facingInteraction();
    if (target?.id !== event.interactionId || target?.eventKey !== event.eventKey) return;
    const context = clerkVisit(game.area.def, target);
    if (context && host.openPanel('shop', () => open(context))) return { lines: [] };
  } };
}
