/** Query selection is only for comparing candidates, not a player progression setting. */
export function bagReviewOptions(search: string): { candidate: 'grid' | 'hotbar'; temporary: boolean } {
  const query = new URLSearchParams(search);
  return { candidate: query.get('bag') === 'hotbar' ? 'hotbar' : 'grid', temporary: query.get('review') === '1' };
}
