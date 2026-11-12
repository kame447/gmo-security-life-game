/** Prototype appearance choices. These affect rendering only. */
export interface PlayerAppearance {
  silhouette: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  outfitColor: string;
}

export type AppearanceField = keyof PlayerAppearance;

export const APPEARANCE_FIELDS: readonly AppearanceField[] = [
  'silhouette', 'hairStyle', 'hairColor', 'outfit', 'outfitColor',
];

export const APPEARANCE_OPTIONS: Record<AppearanceField, readonly { id: string; name: string }[]> = {
  silhouette: [{ id: 'type-a', name: 'タイプA' }, { id: 'type-b', name: 'タイプB' }],
  hairStyle: [{ id: 'short', name: 'みじかめ' }, { id: 'bob', name: 'おかっぱ' }, { id: 'tied', name: 'ひとつむすび' }],
  hairColor: [
    { id: 'brown', name: 'ちゃいろ' }, { id: 'black', name: 'くろ' },
    { id: 'dark-brown', name: 'こげちゃ' }, { id: 'gold', name: 'きんいろ' },
    { id: 'auburn', name: 'あかちゃ' },
  ],
  outfit: [{ id: 'jacket', name: 'うわぎ' }, { id: 'shirt', name: 'シャツ' }, { id: 'overalls', name: 'つなぎ' }],
  outfitColor: [
    { id: 'blue', name: 'あお' }, { id: 'red', name: 'あか' },
    { id: 'green', name: 'みどり' }, { id: 'yellow', name: 'きいろ' },
    { id: 'purple', name: 'むらさき' },
  ],
};

export const DEFAULT_APPEARANCE: PlayerAppearance = {
  silhouette: 'type-a', hairStyle: 'short', hairColor: 'brown', outfit: 'jacket', outfitColor: 'blue',
};

/** Keep valid fields from older/partially damaged saves, replacing only invalid choices. */
export function normalizeAppearance(raw: unknown): PlayerAppearance {
  const result = { ...DEFAULT_APPEARANCE };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const source = raw as Record<string, unknown>;
  for (const field of APPEARANCE_FIELDS) {
    const value = source[field];
    if (typeof value === 'string' && APPEARANCE_OPTIONS[field].some(option => option.id === value)) {
      result[field] = value;
    }
  }
  return result;
}

/** Fixed field order makes equivalent inputs share a bounded sprite cache entry. */
export function appearanceKey(a: PlayerAppearance): string {
  const normalized = normalizeAppearance(a);
  return APPEARANCE_FIELDS.map(field => normalized[field]).join(':');
}
