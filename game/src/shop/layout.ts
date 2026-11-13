/** URL切替は候補比較専用。採用するレイアウトは未決定。 */
export type ShopLayout = 'split' | 'compact' | 'dialog';
export function shopLayout(search: string): ShopLayout {
  const candidate = new URLSearchParams(search).get('shop');
  return candidate === 'compact' || candidate === 'dialog' ? candidate : 'split';
}
