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
  { id: 'apple', name: 'りんご', description: '八百屋に並ぶ、赤くてみずみずしいりんご。', category: 'normal', maxQuantity: 20 },
  { id: 'carrot', name: 'にんじん', description: '料理に使える、鮮やかな色のにんじん。', category: 'normal', maxQuantity: 20 },
  { id: 'paperback-book', name: '文庫本', description: '持ち歩きやすい文庫本。休み時間にも読める。', category: 'normal', maxQuantity: 10 },
  { id: 'juice-drink', name: '果汁ジュース', description: '果物の風味がする、小さなボトルのジュース。', category: 'normal', maxQuantity: 20 },
  { id: 'sandwich-bread', name: 'サンドイッチ', description: 'パン屋で作った、具の入ったサンドイッチ。', category: 'normal', maxQuantity: 20 },
  { id: 'coffee-drink', name: 'コーヒー', description: '持ち帰り用のカップに入ったコーヒー。', category: 'normal', maxQuantity: 20 },
  { id: 'tea-drink', name: '紅茶', description: '香りのよい、持ち帰り用の紅茶。', category: 'normal', maxQuantity: 20 },
  { id: 'bandage', name: '絆創膏', description: '小さなけがのために持ち歩く絆創膏。', category: 'normal', maxQuantity: 20 },
  { id: 'mask', name: 'マスク', description: '個包装の使い捨てマスク。', category: 'normal', maxQuantity: 20 },
];

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_DEFINITIONS.find(item => item.id === id);
}
