/** C案を既定とするタイトル画面。本編を始めるまでセーブを変更しない。 */
import { bagReviewOptions } from '../app/bag-review';
import { loadSave } from '../app/save-store';
import { PHONE_BUDGET_PROTOTYPE } from '../phone/budget-config';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { buildWorld } from '../world';
import { DEFAULT_VARIANT } from './core';
import { startOpening, type OpeningHandle } from './opening';

const SAVE_KEY = 'slg-map-save-v1';
const stage = document.getElementById('opening') as HTMLElement;
const params = new URLSearchParams(location.search);

if (params.get('skipOpening') === '1' || bagReviewOptions(location.search).temporary) {
  stage.hidden = true;
  void import('../main');
} else {
  const hasSave = Boolean(loadSave(buildWorld(), {
    initialPhoneOwned: PHONE_INITIAL_OWNED,
    phoneDataConfig: PHONE_BUDGET_PROTOTYPE,
  }));
  let handle: OpeningHandle | undefined;
  let entering = false;

  async function enterGame(mode: 'new' | 'continue'): Promise<void> {
    if (entering) return;
    if (mode === 'new') {
      if (hasSave && !window.confirm('保存データを削除して、はじめから始めますか？')) return;
      try { localStorage.removeItem(SAVE_KEY); }
      catch {
        if (hasSave) {
          window.alert('保存データを初期化できませんでした。');
          return;
        }
      }
    }
    entering = true;
    handle?.destroy();
    stage.hidden = true;
    try { await import('../main'); }
    catch (error) {
      console.error('ゲームを起動できませんでした', error);
      window.alert('ゲームを起動できませんでした。再読み込みしてください。');
    }
  }

  void startOpening({
    stage,
    canvas: document.getElementById('opening-view') as HTMLCanvasElement,
    skipButton: document.getElementById('opening-skip') as HTMLButtonElement,
    menu: document.getElementById('opening-menu') as HTMLElement,
    variant: DEFAULT_VARIANT,
    hasSave,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onSelect: mode => { void enterGame(mode); },
  }).then(started => { handle = started; })
    .catch(error => {
      console.error('オープニングを読み込めませんでした', error);
      stage.hidden = true;
      void import('../main');
    });
}
