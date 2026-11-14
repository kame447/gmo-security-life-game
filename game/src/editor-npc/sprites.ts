import type { EditorDocument } from '../editor/types.ts';

/**
 * NPC appearances explicitly drawn by the current prototype renderer. `cat` has a
 * separate drawing branch; the renderer also has a generic fallback for unknown IDs.
 * This is an editor choice list, not a restriction on valid catalog references.
 */
export const PROTOTYPE_NPC_SPRITES: readonly string[] = [
  'mother', 'grandma', 'friend', 'guard', 'shopkeeper', 'staff', 'teacher', 'classmate', 'clerk', 'cat',
];

/** Only offer renderer choices which this document declares; do not change its catalogs. */
export function availableNpcSprites(document: EditorDocument): string[] {
  const implemented = new Set(PROTOTYPE_NPC_SPRITES);
  return document.catalogs.sprites.filter(sprite => implemented.has(sprite));
}
