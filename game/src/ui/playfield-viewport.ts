const HUD_GAP = 8;

export function playfieldSize(width: number, height: number, indoor: boolean, hotbarTop: number) {
  const fullHeight = Math.max(1, Math.round(height));
  return {
    width: Math.max(1, Math.round(width)),
    height: indoor ? Math.min(fullHeight, Math.max(1, Math.floor(hotbarTop - HUD_GAP))) : fullHeight,
  };
}

/** 屋内の出口を持ち物欄の上に描く。幅を保つため、キャラクターの大きさは変わらない。 */
export class PlayfieldViewport {
  private dirty = true;
  private indoor?: boolean;
  private density = 0;
  private size = '';

  constructor(private readonly stage: HTMLElement, private readonly hotbar: HTMLElement,
    private readonly resize: (width: number, height: number, density: number) => void) {
    const invalidate = () => { this.dirty = true; };
    window.addEventListener('resize', invalidate);
    new ResizeObserver(invalidate).observe(hotbar);
    new MutationObserver(invalidate).observe(hotbar, { childList: true, subtree: true });
    const touch = stage.querySelector('#touch');
    if (touch) new MutationObserver(invalidate).observe(touch, { attributes: true, attributeFilter: ['class'] });
    document.fonts.ready.then(invalidate);
  }

  update(indoor: boolean): void {
    const density = window.devicePixelRatio || 1;
    if (this.indoor !== indoor || this.density !== density) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.indoor = indoor;
    this.density = density;
    this.stage.classList.toggle('indoor-playfield', indoor);
    const size = playfieldSize(window.innerWidth, window.innerHeight, indoor,
      indoor ? this.hotbarTop() : window.innerHeight);
    const key = JSON.stringify([size, density]);
    if (key === this.size) return;
    this.size = key;
    this.resize(size.width, size.height, density);
  }

  private hotbarTop(): number {
    // 会話・バッグで隠れている間も同じ寸法を確保し、開閉でカメラを動かさない。
    const sample = this.hotbar.cloneNode(true) as HTMLElement;
    sample.hidden = false;
    sample.style.visibility = 'hidden';
    sample.style.pointerEvents = 'none';
    const label = sample.querySelector<HTMLElement>('.bag-hud-label');
    if (label) {
      label.hidden = false;
      if (!label.textContent) label.textContent = '\u00a0';
    }
    this.stage.append(sample);
    try { return sample.getBoundingClientRect().top - this.stage.getBoundingClientRect().top; }
    finally { sample.remove(); }
  }
}
