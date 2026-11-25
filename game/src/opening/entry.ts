/** C案を既定とするタイトル画面。本編を始めるまでセーブを変更しない。 */
import { bagReviewOptions } from '../app/bag-review';
import { loadSave } from '../app/save-store';
import { requestStart } from '../app/start-mode';
import { PHONE_BUDGET_PROTOTYPE } from '../phone/budget-config';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { buildWorld } from '../world';
import { DEFAULT_VARIANT } from './core';
import { startOpening, type OpeningHandle } from './opening';

const SAVE_KEY = 'slg-map-save-v1';
type SaveState = { kind: 'empty' | 'valid' | 'unsafe'; raw?: string };

function inspectSave(): SaveState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return { kind: 'empty' };
    const valid = loadSave(buildWorld(), {
      initialPhoneOwned: PHONE_INITIAL_OWNED,
      phoneDataConfig: PHONE_BUDGET_PROTOTYPE,
    });
    return valid ? { kind: 'valid', raw } : { kind: 'unsafe', raw };
  } catch {
    return { kind: 'unsafe' };
  }
}
const stage = document.getElementById('opening') as HTMLElement;
const params = new URLSearchParams(location.search);

if (params.get('skipOpening') === '1' || bagReviewOptions(location.search).temporary) {
  stage.hidden = true;
  void import('../main');
} else {
  const initialSave = inspectSave();
  const hasSave = initialSave.kind === 'valid';
  const blocked = initialSave.kind === 'unsafe';
  const errorBox = document.getElementById('opening-error') as HTMLElement;
  if (blocked) {
    errorBox.textContent = '保存データを安全に読み込めないため、開始できません。保存内容は変更していません。';
    errorBox.hidden = false;
  }
  let handle: OpeningHandle | undefined;
  let entering = false;

  async function enterGame(mode: 'new' | 'continue'): Promise<void> {
    if (entering || blocked) return;
    const latestSave = inspectSave();
    if (latestSave.kind === 'unsafe' || latestSave.kind !== initialSave.kind || latestSave.raw !== initialSave.raw) {
      window.alert('保存データが変更されたか、安全に読み込めません。再読み込みしてください。');
      return;
    }
    if (mode === 'continue' && latestSave.kind !== 'valid') return;
    if (mode === 'new' && latestSave.kind === 'valid') {
      if (!window.confirm('保存データを削除して、はじめから始めますか？')) return;
      try {
        localStorage.removeItem(SAVE_KEY);
        if (localStorage.getItem(SAVE_KEY) !== null) throw new Error('Save remains');
      } catch {
        window.alert('保存データを初期化できませんでした。');
        return;
      }
    }
    entering = true;
    requestStart(mode);
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
    blockStart: blocked,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onSelect: mode => { void enterGame(mode); },
  }).then(started => { handle = started; })
    .catch(error => {
      console.error('オープニングを読み込めませんでした', error);
      const menu = document.getElementById('opening-menu') as HTMLElement;
      menu.hidden = false;
      const warning = document.getElementById('opening-error') as HTMLElement;
      warning.textContent = 'オープニングを読み込めませんでした。再読み込みしてください。';
      warning.hidden = false;
      (document.getElementById('opening-skip') as HTMLElement).hidden = true;
    });
}
