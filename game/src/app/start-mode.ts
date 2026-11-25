/**
 * タイトル画面で選んだ始め方を本編（main.ts）へ渡す。
 * 「はじめから」は序章（docs/features/story.md）を新しく始める。「つづきから」と `?skipOpening=1` は保存から再開する。
 */
export type StartMode = 'new' | 'continue';

let requested: StartMode | undefined;

/** タイトル画面が本編を読み込む前に呼ぶ。 */
export function requestStart(mode: StartMode): void {
  requested = mode;
}

/** タイトル画面で「はじめから」が選ばれたか。 */
export function newGameRequested(): boolean {
  return requested === 'new';
}
