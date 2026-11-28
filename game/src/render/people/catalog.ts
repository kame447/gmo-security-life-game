/** Existing game sprites; the short Japanese labels are provisional editor labels. */
export interface PersonEntry { id: string; name: string }

export const PEOPLE: readonly PersonEntry[] = Object.freeze(([
  { id: 'cat', name: 'ねこ' },
  { id: 'classmate', name: 'クラスメイト' },
  { id: 'clerk', name: '店員' },
  { id: 'friend', name: '友だち' },
  { id: 'friend-seated', name: '席に座る友達' },
  { id: 'grandma', name: 'おばあさん' },
  { id: 'grandma-reading-seated', name: '席で読書する客' },
  { id: 'guard', name: '見守りの人' },
  { id: 'mother', name: 'おかあさん' },
  { id: 'shopkeeper', name: '店主' },
  { id: 'staff', name: '駅員' },
  { id: 'teacher', name: '先生' },
  // characterSprite('player', ...) uses the existing default player appearance.
  { id: 'player', name: '主人公' },
] satisfies PersonEntry[]).map(entry => Object.freeze(entry)));

const ids = new Set(PEOPLE.map(entry => entry.id));

/** Unknown names that the renderer draws with its generic fallback are not catalog entries. */
export function isPersonId(id: string): boolean { return ids.has(id); }
