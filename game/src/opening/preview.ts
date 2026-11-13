/** オープニング候補 3 案の比較用ページ。上の切り替え欄は確認専用で、採用後のゲーム画面には含めない。 */
import { parseVariant, VARIANT_IDS, type VariantId } from './core';
import { startOpening, type OpeningHandle } from './opening';

/** 本編の保存キー（game/src/app/save-store.ts）。有無を読むだけで、書き換えない。 */
const SAVE_KEY = 'slg-map-save-v1';
const NAMES: Record<VariantId, string> = { a: '案A 落とし穴に落ちる', b: '案B 跳び越える', c: '案C 穴の底から' };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
let variant = parseVariant(params.get('v'));
let handle: OpeningHandle | undefined;
const explicit = { save: params.has('save'), motion: params.has('motion') };

function storedSave(): boolean {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

const saveToggle = $<HTMLInputElement>('pv-save'), motionToggle = $<HTMLInputElement>('pv-motion');
const status = $('pv-status'), tabs = $('pv-tabs');
saveToggle.checked = params.has('save') ? params.get('save') === '1' : storedSave();
motionToggle.checked = params.has('motion')
  ? params.get('motion') === 'reduce'
  : matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const id of VARIANT_IDS) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = NAMES[id]; b.dataset.v = id;
  b.addEventListener('click', () => { variant = id; void start(); });
  tabs.append(b);
}

let generation = 0;
async function start(): Promise<void> {
  // 画像の読み込み待ち中に切り替えられても、古い再生を残さない。
  const mine = ++generation;
  handle?.destroy();
  handle = undefined;
  for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === variant));
  // 明示された設定だけを URL に残す。自動で書くと、次に開いたとき端末の設定より優先されてしまう。
  const next = new URLSearchParams({ v: variant });
  if (explicit.save) next.set('save', saveToggle.checked ? '1' : '0');
  if (explicit.motion) next.set('motion', motionToggle.checked ? 'reduce' : 'full');
  history.replaceState(null, '', `?${next}`);
  status.textContent = '';
  const started = await startOpening({
    stage: $('opening'), canvas: $<HTMLCanvasElement>('opening-view'),
    skipButton: $<HTMLButtonElement>('opening-skip'), menu: $('opening-menu'),
    variant, hasSave: saveToggle.checked, reducedMotion: motionToggle.checked,
    onSelect: (id) => {
      status.textContent = `「${id === 'new' ? 'はじめから' : 'つづきから'}」を選択（プレビューでは本編を開始しません）`;
    },
  });
  if (mine !== generation) { started.destroy(); return; }
  handle = started;
  // 画像が届いていない素材は仮の絵で動く。どちらで描いているかを確認できるようにする。
  const ids = ['a-street', 'a-pit', 'a-wings', 'b-sky', 'b-far', 'b-near', 'b-ground', 'b-pit', 'c-pitwall', 'c-sky', 'c-town', 'dust'] as const;
  const code = ids.filter((id) => id.startsWith(variant) || id === 'dust').filter((id) => handle!.art.source(id) === 'code');
  $('pv-art').textContent = code.length ? `仮の絵：${code.join('、')}` : '';
}

$('pv-replay').addEventListener('click', () => handle?.replay());
saveToggle.addEventListener('change', () => { explicit.save = true; void start(); });
motionToggle.addEventListener('change', () => { explicit.motion = true; void start(); });
void start();
