import type { TownRailLayout } from './rail-layout';
import { isSolidGround, T } from './tiles';

/** 仮値。車体の張り出しと人物の高さを含む保護帯。踏切の開口幅は変えない。 */
export const RAIL_BUFFER_TILES = 2;

/** Static ground owns both the fenced verge artwork and collision/BFS. Preserve water, banks and the rail rows. */
export function applyRailProtection(ground: Uint8Array, width: number, height: number, layout: TownRailLayout): void {
  for (let x = 0; x < width; x++) {
    if (ground[layout.northRow * width + x] === T.CROSSING && ground[layout.southRow * width + x] === T.CROSSING) continue;
    for (let d = 1; d <= RAIL_BUFFER_TILES; d++) for (const y of [layout.northRow - d, layout.southRow + d]) {
      if (y < 0 || y >= height) continue;
      const index = y * width + x;
      if (!isSolidGround(ground[index])) ground[index] = T.RAIL_GUARD;
    }
  }
}
