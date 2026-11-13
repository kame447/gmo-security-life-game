/**
 * オープニングの再生とタイトルメニュー。Canvas に演出を描き、スキップとメニューは通常のボタンで出す。
 * 本編には未接続。選ばれた項目は onSelect で呼び出し側へ渡すだけで、保存データには触れない。
 */
import { loadArt, type Art } from './art';
import {
  createMenu, keyAction, moveMenu, selectedItem, viewSize,
  type MenuItemId, type MenuState, type Phase, type VariantId,
} from './core';
import { makeLogo } from './glyphs';
import { fade, type Scene, type SceneEnv } from './scene';
import { sceneA } from './scene-a';
import { sceneB } from './scene-b';
import { sceneC } from './scene-c';

export const SCENES: Record<VariantId, Scene> = { a: sceneA, b: sceneB, c: sceneC };

export interface OpeningOptions {
  /** canvas・スキップ・メニューを含む枠。 */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  skipButton: HTMLButtonElement;
  menu: HTMLElement;
  variant: VariantId;
  hasSave: boolean;
  /** 動きを減らす。演出を再生せず、最後の画面を短い明転で出す。 */
  reducedMotion: boolean;
  onSelect(id: MenuItemId): void;
  onPhase?(phase: Phase): void;
}
export interface OpeningHandle { skip(): void; replay(): void; destroy(): void; art: Art }

let artPromise: Promise<Art> | undefined;

export async function startOpening(o: OpeningOptions): Promise<OpeningHandle> {
  const art = await (artPromise ??= loadArt());
  const scene = SCENES[o.variant];
  const c = o.canvas.getContext('2d')!;
  const env: SceneEnv = { c, w: 0, h: 0, art, logo: makeLogo(1), small: makeLogo(0.7) };
  let menu: MenuState = createMenu(o.hasSave);
  let phase: Phase = 'playing', t = 0, reveal = 0, last = 0, raf = 0, alive = true;

  const buttons = menu.items.map((item, index) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = item.label; b.disabled = !item.enabled; b.dataset.id = item.id;
    b.addEventListener('click', () => { menu = { ...menu, index }; mark(); o.onSelect(item.id); });
    b.addEventListener('pointerenter', () => { if (item.enabled) { menu = { ...menu, index }; mark(); } });
    b.addEventListener('focus', () => { menu = { ...menu, index }; mark(); });
    return b;
  });
  const list = o.menu.querySelector('[data-items]') ?? o.menu;
  list.replaceChildren(...buttons);

  function mark(): void {
    buttons.forEach((b, i) => b.classList.toggle('selected', i === menu.index));
  }
  function setPhase(next: Phase): void {
    phase = next;
    o.skipButton.hidden = next !== 'playing';
    o.menu.hidden = next !== 'menu';
    if (next === 'menu') { mark(); buttons[menu.index]?.focus({ preventScroll: true }); }
    o.onPhase?.(next);
  }
  function resize(): void {
    const view = viewSize(o.stage.clientWidth, o.stage.clientHeight, window.devicePixelRatio);
    if (o.canvas.width !== view.w || o.canvas.height !== view.h) { o.canvas.width = view.w; o.canvas.height = view.h; }
    env.w = view.w; env.h = view.h;
    const cssW = view.w * view.scale, cssH = view.h * view.scale;
    Object.assign(o.canvas.style, {
      width: `${cssW}px`, height: `${cssH}px`,
      left: `${Math.round((o.stage.clientWidth - cssW) / 2)}px`, top: `${Math.round((o.stage.clientHeight - cssH) / 2)}px`,
    });
    // メニューと文字の大きさを絵の拡大率に合わせる。
    o.stage.style.setProperty('--px', String(view.scale));
    c.imageSmoothingEnabled = false;
  }
  function frame(now: number): void {
    if (!alive) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    if (o.reducedMotion) reveal = Math.min(1, reveal + dt / 0.4);
    else t += dt;
    resize();
    c.clearRect(0, 0, env.w, env.h);
    scene.draw(env, o.reducedMotion ? scene.duration : t);
    if (o.reducedMotion) fade(env, 1 - reveal);
    if (phase === 'playing' && (o.reducedMotion || t >= scene.duration)) setPhase('menu');
    raf = requestAnimationFrame(frame);
  }
  function skip(): void {
    if (phase !== 'playing') return;
    t = scene.duration;
    setPhase('menu');
  }
  function replay(): void {
    t = 0; reveal = 0;
    setPhase('playing');
  }
  function onKey(e: KeyboardEvent): void {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    // 枠の外の操作部品（プレビュー用の切り替えなど）のキー操作は奪わない。
    if (target && target !== document.body && !o.stage.contains(target)) return;
    const action = keyAction(e.code);
    if (!action) return;
    const onButton = target instanceof HTMLButtonElement, native = e.code === 'Enter' || e.code === 'Space';
    if (phase === 'playing') {
      if (action !== 'confirm' && action !== 'cancel') return;
      // ボタン上の Enter / Space はボタン自身のクリックに任せる。
      if (!(onButton && native)) { e.preventDefault(); skip(); }
      return;
    }
    if (action === 'up' || action === 'down') {
      e.preventDefault();
      menu = moveMenu(menu, action === 'up' ? -1 : 1);
      mark(); buttons[menu.index]?.focus({ preventScroll: true });
    } else if (action === 'confirm' && !(onButton && native)) {
      e.preventDefault();
      const id = selectedItem(menu);
      if (id) o.onSelect(id);
    }
  }
  const onSkipClick = (): void => skip();
  window.addEventListener('keydown', onKey);
  o.skipButton.addEventListener('click', onSkipClick);

  setPhase('playing');
  raf = requestAnimationFrame(frame);
  return {
    skip, replay, art,
    destroy(): void {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      o.skipButton.removeEventListener('click', onSkipClick);
    },
  };
}
