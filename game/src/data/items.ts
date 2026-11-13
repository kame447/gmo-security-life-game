export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly maxQuantity: number;
}

/** Prototype content and quantity limits; these are not final game-balance decisions. */
export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  { id: 'notebook', name: 'ノート', description: 'べんきょうや メモに つかう ノート。', category: 'stationery', maxQuantity: 99 },
  { id: 'pencil', name: 'えんぴつ', description: 'かいたり えをかいたり できる えんぴつ。', category: 'stationery', maxQuantity: 99 },
  { id: 'bottled-water', name: 'みず', description: 'もちあるける ペットボトルの みず。', category: 'drink', maxQuantity: 20 },
];

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_DEFINITIONS.find(item => item.id === id);
}
