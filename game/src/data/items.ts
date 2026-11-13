export type ItemCategory = 'normal' | 'important';

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  readonly maxQuantity: number;
}

/** Review samples, classifications and limits remain provisional. Clothing is ownership only. */
export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { id: 'notebook', name: 'ノート', description: '書き留めたいことを残せる、無地のノート。', category: 'normal', maxQuantity: 99 },
  { id: 'pencil', name: 'えんぴつ', description: 'よく削られた、木のえんぴつ。', category: 'normal', maxQuantity: 99 },
  { id: 'bottled-water', name: '水', description: '持ち歩ける、ボトル入りの水。', category: 'normal', maxQuantity: 20 },
  { id: 'small-snack', name: 'おかし', description: '小さな袋に入った、ひと口サイズのおかし。', category: 'normal', maxQuantity: 20 },
  { id: 'hand-towel', name: 'ハンカチ', description: 'きれいにたたんだ、やわらかいハンカチ。', category: 'normal', maxQuantity: 20 },
  { id: 'bread', name: 'パン', description: 'こんがり焼けた、小さな丸パン。', category: 'normal', maxQuantity: 20 },
  { id: 'shirt', name: 'シャツ', description: '白い半袖のシャツ。', category: 'normal', maxQuantity: 10 },
  { id: 'umbrella', name: 'かさ', description: '持ち手の曲がった、折りたたみのかさ。', category: 'normal', maxQuantity: 10 },
  { id: 'key', name: '鍵', description: '小さな金属の鍵。', category: 'important', maxQuantity: 1 },
  { id: 'card', name: 'カード', description: '番号が印字されたカード。', category: 'important', maxQuantity: 1 },
];

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_DEFINITIONS.find(item => item.id === id);
}
