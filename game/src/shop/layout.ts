/** URL切替は候補比較専用。採用するレイアウトは未決定。 */
export type ShopLayout = 'split' | 'compact';
export function shopLayout(search: string): ShopLayout {
  return new URLSearchParams(search).get('shop') === 'compact' ? 'compact' : 'split';
}
