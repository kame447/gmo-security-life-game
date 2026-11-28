/** C案を既定とするタイトル画面。本編を始めるまでセーブを変更しない。 */
import { bagReviewOptions } from '../app/bag-review';
import { LocalSaveStore, saveDateLabel, saveFailureMessage } from '../app/local-save';
import { activeSaveKey } from '../app/save-slot';
import { seedLocalReview } from '../app/local-review-fixtures';
import { requestStart } from '../app/start-mode';
import { PHONE_BUDGET_PROTOTYPE } from '../phone/budget-config';
import { PHONE_INITIAL_OWNED } from '../phone/config';
import { buildWorld } from '../world';
import { DEFAULT_VARIANT } from './core';
import { startOpening, type OpeningHandle } from './opening';

const world = buildWorld();
seedLocalReview(world, location.search);
const store = new LocalSaveStore(activeSaveKey());
const inspectSave = () => store.inspect(world, {
  initialPhoneOwned: PHONE_INITIAL_OWNED, phoneDataConfig: PHONE_BUDGET_PROTOTYPE,
});
const stage = document.getElementById('opening') as HTMLElement;
const params = new URLSearchParams(location.search);

if (params.get('skipOpening') === '1' || bagReviewOptions(location.search).temporary) {
  stage.hidden = true;
  void import('../main');
} else {
  const initialSave = inspectSave();
  const hasSave = initialSave.kind === 'valid';
  const blocked = initialSave.kind === 'blocked';
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
    if (latestSave.kind === 'blocked' || latestSave.kind !== initialSave.kind || latestSave.raw !== initialSave.raw) {
      window.alert('保存データが変更されたか、安全に読み込めません。再読み込みしてください。');
      return;
    }
    if (mode === 'continue' && latestSave.kind !== 'valid') return;
    if (mode === 'new' && latestSave.kind === 'valid') {
      if (!window.confirm('今の保存を復元ポイントに残して、はじめから始めますか？')) return;
      const cleared = store.clearForNew(latestSave.raw);
      if (!cleared.ok) { window.alert(saveFailureMessage(cleared.reason)); return; }
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

  const menu = document.getElementById('opening-menu') as HTMLElement;
  if (initialSave.kind === 'valid') {
    const date = document.createElement('p'); date.id = 'opening-last-save';
    date.textContent = `前回の保存：${saveDateLabel(initialSave.savedAt)}`;
    Object.assign(date.style, { fontSize: '12px', textAlign: 'center', margin: '8px 0' });
    menu.append(date);
  }
  try {
    const history = store.history();
    if (history.length) {
      const details = document.createElement('details'); details.id = 'opening-recovery';
      const summary = document.createElement('summary'); summary.textContent = '過去の記録から戻す'; details.append(summary);
      Object.assign(details.style, { fontSize: '12px', maxHeight: '150px', overflow: 'auto' });
      for (const point of history) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = `${saveDateLabel(point.createdAt)} の記録`;
        Object.assign(button.style, { display: 'block', width: '100%', fontSize: '12px', marginTop: '6px' });
        button.addEventListener('click', () => {
          if (!window.confirm('この記録に戻しますか？ 現在の保存済み記録も復元ポイントに残します。')) return;
          const result = store.restore(point.id, world);
          if (result.ok) location.reload(); else window.alert(saveFailureMessage(result.reason));
        });
        details.append(button);
      }
      menu.append(details);
    }
  } catch { /* An unreadable history is never rewritten by the title screen. */ }

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
