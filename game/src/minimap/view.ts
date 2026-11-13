import type { Facing } from '../core/coords';
import type { Game } from '../session/game';
import type { AreaRuntime } from '../world';
import { AreaMapCache, fitProjection, localProjection, playerMapPoint, projectPoint, type AreaMap, type MapProjection } from './model';
import './minimap.css';

const COLORS: readonly (readonly [number, number, number])[] = [
  [35, 46, 49], [130, 170, 111], [132, 141, 139], [213, 202, 172], [80, 145, 166],
  [208, 180, 140], [69, 97, 79], [152, 103, 83], [248, 214, 110],
];
const ANGLES: Record<Facing, number> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

/** The canvases display only data from the current runtime area; no separate map is stored. */
export class Minimap {
  readonly button: HTMLButtonElement;
  private readonly stage = document.querySelector<HTMLElement>('#stage')!;
  private readonly overlay: HTMLElement;
  private readonly mini: HTMLCanvasElement;
  private readonly full: HTMLCanvasElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly cache = new AreaMapCache();
  private readonly images = new WeakMap<AreaRuntime, HTMLCanvasElement>();
  private currentArea?: AreaRuntime;
  private map?: AreaMap;
  private image?: HTMLCanvasElement;
  private lastFrame = '';
  private opened = false;

  constructor(
    private readonly game: Game,
    private readonly canOpen: () => boolean,
    private readonly onOpen: () => void,
    private readonly onClose: () => void,
  ) {
    this.button = document.createElement('button');
    this.button.id = 'minimap-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '周辺地図を開く');
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.mini = document.createElement('canvas');
    this.mini.width = 192;
    this.mini.height = 128;
    this.mini.setAttribute('aria-hidden', 'true');
    this.button.append(this.mini);
    this.button.addEventListener('click', () => this.open());
    this.stage.append(this.button);

    this.overlay = document.createElement('div');
    this.overlay.id = 'full-map-overlay';
    this.overlay.hidden = true;
    this.overlay.innerHTML = `<section class="full-map-panel" role="dialog" aria-modal="true" aria-labelledby="full-map-title">
      <header><h2 id="full-map-title"></h2><button id="full-map-close" type="button" aria-label="全体地図を閉じる">×</button></header>
      <canvas id="full-map-canvas" width="960" height="600" role="img"></canvas>
    </section>`;
    this.stage.append(this.overlay);
    this.full = this.overlay.querySelector<HTMLCanvasElement>('#full-map-canvas')!;
    this.closeButton = this.overlay.querySelector<HTMLButtonElement>('#full-map-close')!;
    this.closeButton.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay) this.close(); });
  }

  get isOpen(): boolean { return this.opened; }

  open(): void {
    if (this.opened || !this.canOpen()) return;
    this.opened = true;
    this.onOpen();
    this.overlay.hidden = false;
    this.stage.classList.add('map-open');
    this.button.setAttribute('aria-expanded', 'true');
    this.lastFrame = '';
    this.update();
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.overlay.hidden = true;
    this.stage.classList.remove('map-open');
    this.button.setAttribute('aria-expanded', 'false');
    this.lastFrame = '';
    this.onClose();
    this.update();
  }

  handleKey(event: KeyboardEvent): void {
    if (!this.opened) return;
    if (event.code === 'Escape') { event.preventDefault(); this.close(); }
    else if (event.code === 'Tab') { event.preventDefault(); this.closeButton.focus(); }
    else if (!['Enter', 'Space'].includes(event.code) || event.target !== this.closeButton) event.preventDefault();
  }

  update(): void {
    const area = this.game.area;
    if (area !== this.currentArea) {
      this.currentArea = area;
      this.map = this.cache.get(area);
      this.image = this.raster(area, this.map);
      this.button.dataset.areaId = this.map.areaId;
      this.full.dataset.areaId = this.map.areaId;
      this.button.setAttribute('aria-label', `${area.def.name}の周辺地図を開く`);
      this.full.setAttribute('aria-label', `${area.def.name}の全体地図と現在地`);
      this.overlay.querySelector<HTMLElement>('#full-map-title')!.textContent = area.def.name;
      this.lastFrame = '';
    }
    this.button.disabled = this.opened || !this.canOpen();
    const player = this.game.player;
    const frame = `${player.areaId}:${player.x}:${player.y}:${player.facing}:${this.opened}`;
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const position = playerMapPoint(player);
    const canvas = this.opened ? this.full : this.mini;
    const projection = this.opened
      ? fitProjection(this.map!.width, this.map!.height, canvas.width, canvas.height, 18)
      : localProjection(this.map!.width, this.map!.height, canvas.width, canvas.height, position);
    this.draw(canvas, projection, position.x, position.y, player.facing);
  }

  private raster(area: AreaRuntime, map: AreaMap): HTMLCanvasElement {
    const existing = this.images.get(area);
    if (existing) return existing;
    const image = document.createElement('canvas');
    image.width = map.width;
    image.height = map.height;
    const context = image.getContext('2d')!;
    const pixels = context.createImageData(map.width, map.height);
    for (let i = 0; i < map.cells.length; i++) {
      const [r, g, b] = COLORS[map.cells[i]];
      const offset = i * 4;
      pixels.data[offset] = r; pixels.data[offset + 1] = g; pixels.data[offset + 2] = b; pixels.data[offset + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    this.images.set(area, image);
    return image;
  }

  private draw(canvas: HTMLCanvasElement, projection: MapProjection, x: number, y: number, facing: Facing): void {
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#243034';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.image!, projection.left, projection.top,
      this.map!.width * projection.scale, this.map!.height * projection.scale);
    const point = projectPoint(projection, { x, y });
    const radius = this.opened ? 15 : 8;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(ANGLES[facing]);
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(radius * .75, radius * .75);
    context.lineTo(0, radius * .42);
    context.lineTo(-radius * .75, radius * .75);
    context.closePath();
    context.fillStyle = '#fff4ba';
    context.strokeStyle = '#243034';
    context.lineWidth = this.opened ? 4 : 3;
    context.lineJoin = 'round';
    context.fill();
    context.stroke();
    context.restore();
  }
}
