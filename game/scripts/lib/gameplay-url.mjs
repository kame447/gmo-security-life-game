/** 通常ゲームの検査ではタイトルのみ省略する。タイトルは専用E2Eで確認する。 */
export function gameplayUrl(raw) {
  const url = new URL(raw);
  url.searchParams.set('skipOpening', '1');
  return url.href;
}
