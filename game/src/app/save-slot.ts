import { SAVE_KEY } from './local-save';

/** Local review scenes use separate saves and cannot replace the ordinary game. */
export function activeSaveKey(search = typeof location === 'undefined' ? '' : location.search): string {
  const slot = new URLSearchParams(search).get('localReview');
  return slot && /^[a-z0-9-]{1,40}$/.test(slot) ? `${SAVE_KEY}.review.${slot}` : SAVE_KEY;
}
