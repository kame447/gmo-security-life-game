/** Query flag for an isolated review session without reading or writing saves. */
export function bagReviewOptions(search: string): { temporary: boolean } {
  return { temporary: new URLSearchParams(search).get('review') === '1' };
}
