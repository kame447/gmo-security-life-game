import type { ObjectDef } from '../../core/types';

/** Existing artwork and default footprints, not permission to edit a particular object. */
export interface OutdoorEntry {
  id: string;
  name: string;
  kind: string;
  style?: string;
  w: number;
  h: number;
  solid: boolean;
  layer: 'sorted' | 'decal';
  category: 'prop' | 'building';
}

const props: OutdoorEntry[] = [
  { id: 'tree-green', name: '木', kind: 'tree', style: 'green', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'tree-dark', name: '濃い木', kind: 'tree', style: 'dark', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'tree-cherry', name: '桜', kind: 'tree', style: 'cherry', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  ...['白', '青', '赤', '緑'].map((color, index): OutdoorEntry => ({
    id: `car-${index}`, name: `車（${color}）`, kind: 'car', style: String(index), w: 2, h: 1,
    solid: true, layer: 'sorted', category: 'prop',
  })),
  { id: 'bench', name: 'ベンチ', kind: 'bench', w: 2, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'lamp', name: '街灯', kind: 'lamp', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  // Both styles occur in the generator, even though the existing lamp painter ignores style.
  { id: 'lamp-cherry', name: '街灯', kind: 'lamp', style: 'cherry', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'goal', name: 'ゴール', kind: 'goal', w: 1, h: 2, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'swing', name: 'ぶらんこ', kind: 'swing', w: 3, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'flowerbed', name: '花だん', kind: 'flowerbed', w: 2, h: 1, solid: false, layer: 'decal', category: 'prop' },
  { id: 'vending', name: '自動販売機', kind: 'vending', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'postbox', name: 'ポスト', kind: 'postbox', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'board', name: '掲示板', kind: 'board', w: 2, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'busstop', name: 'バス停', kind: 'busstop', w: 1, h: 1, solid: true, layer: 'sorted', category: 'prop' },
  { id: 'slide', name: 'すべり台', kind: 'slide', w: 2, h: 2, solid: true, layer: 'sorted', category: 'prop' },
];

const buildings: OutdoorEntry[] = [
  ...['青屋根', '茶屋根', '灰屋根', '緑屋根', '紫屋根'].map((color, index): OutdoorEntry => ({
    id: `house-${index}`, name: `家（${color}）`, kind: 'house', style: String(index), w: 5, h: 4,
    solid: true, layer: 'sorted', category: 'building',
  })),
  ...['黄', '桃', '灰', '茶'].map((color, index): OutdoorEntry => ({
    id: `apartment-${index}`, name: `アパート（${color}）`, kind: 'apartment', style: String(index), w: 7, h: 6,
    solid: true, layer: 'sorted', category: 'building',
  })),
  ...[
    ['greengrocer', 'やおや'], ['bookstore', 'ほんや'], ['candy', 'だがしや'],
    ['konbini', 'コンビニ'], ['bakery', 'パンや'], ['cafe', 'きっさてん'], ['pharmacy', 'くすりや'],
  ].map(([style, name]): OutdoorEntry => ({
    id: `shop-${style}`, name, kind: 'shop', style, w: 6, h: 6,
    solid: true, layer: 'sorted', category: 'building',
  })),
  { id: 'school', name: '学校', kind: 'school', w: 20, h: 7, solid: true, layer: 'sorted', category: 'building' },
  { id: 'gym', name: '体育館', kind: 'gym', w: 6, h: 7, solid: true, layer: 'sorted', category: 'building' },
  { id: 'gazebo', name: 'あずまや', kind: 'gazebo', w: 4, h: 3, solid: true, layer: 'sorted', category: 'building' },
];

/** Labels are provisional. No catalogId is attached: outdoor objects retain their legacy painter. */
export const OUTDOOR: readonly OutdoorEntry[] = Object.freeze([...props, ...buildings].map(entry => Object.freeze(entry)));
const byId = new Map(OUTDOOR.map(entry => [entry.id, entry]));
const objectKey = (kind: string, style?: string) => JSON.stringify([kind, style ?? null]);
const byObject = new Map(OUTDOOR.map(entry => [objectKey(entry.kind, entry.style), entry]));

export function outdoorById(id: string): OutdoorEntry | undefined { return byId.get(id); }

/** Matches kind/style only; existing object dimensions and facility/link metadata are untouched. */
export function outdoorForObject(object: Pick<ObjectDef, 'kind' | 'style'>): OutdoorEntry | undefined {
  return byObject.get(objectKey(object.kind, object.style));
}

export const OUTDOOR_READ_ONLY: readonly { kind: string; reason: string }[] = Object.freeze([
  Object.freeze({ kind: 'station', reason: '駅は線路とホームに合わせているため動かせません' }),
  Object.freeze({ kind: 'train', reason: '電車は線路に合わせているため動かせません' }),
  Object.freeze({ kind: 'track', reason: '校庭のトラックは地面に合わせているため動かせません' }),
]);
const readOnly = new Map(OUTDOOR_READ_ONLY.map(entry => [entry.kind, entry.reason]));

/** The UI/policy can share this kind-level restriction; facility and interaction links need their own context. */
export function outdoorReadOnlyReason(kind: string): string | undefined { return readOnly.get(kind); }
