import { isSolidGround } from '../../world/tiles.ts';
import { TILE } from '../../core/coords.ts';
import { objectSprite, characterSprite } from '../../render/sprites.ts';
import type { ValidationIssue } from '../../editor/index.ts';
import type { EditorModel, Selection } from '../model.ts';
import { footprint, hitSelection, selectedEntity, type Footprint, type MapScene } from './scene.ts';
import { mapIssues, mapMoveOperations, validateMapOperations } from './operations.ts';
import { MAP_CELL, tileFromClient, zoomScroll, ZOOM_LEVELS } from './viewport.ts';

type InputControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
interface Gesture {
  pointerId: number; clientX: number; clientY: number; scrollX: number; scrollY: number;
  pan: boolean; moved: boolean; selection: Selection | null; tileX: number; tileY: number;
  origin: Footprint | null; target: { x: number; y: number } | null;
  issuesBefore: ValidationIssue[];
}
export class MapView {
  private readonly model: EditorModel;
  private readonly canvas: HTMLCanvasElement;
  private readonly viewport: HTMLElement;
  private readonly notify: () => void;
  private readonly makeReference: () => MapScene;
  private cachedReference: MapScene | null = null;
  private referencing = false;
  private referenceArea = '';
  private referenceSelection: Selection | null = null;
  private zoom = 1;
  private gesture: Gesture | null = null;
  private suppressUntil = 0;
  private lockedControls = new Map<InputControl, boolean>();

  constructor(model: EditorModel, canvas: HTMLCanvasElement, viewport: HTMLElement, makeReference: () => MapScene, notify: () => void) {
    this.model = model; this.canvas = canvas; this.viewport = viewport; this.makeReference = makeReference; this.notify = notify;
    document.querySelector<HTMLSelectElement>('#map-source')!.addEventListener('change', event => this.setReference((event.target as HTMLSelectElement).value === 'reference'));
    document.querySelector<HTMLSelectElement>('#map-zoom')!.addEventListener('change', event => this.setZoom(Number((event.target as HTMLSelectElement).value)));
    for (const id of ['map-grid', 'map-collision']) document.getElementById(id)!.addEventListener('change', () => this.draw());
    document.getElementById('map-fit')!.addEventListener('click', () => {
      const area = this.scene.areas.find(a => a.id === this.areaId)!;
      const scale = Math.min((viewport.clientWidth - 48) / (area.width * MAP_CELL), (viewport.clientHeight - 48) / (area.height * MAP_CELL));
      this.setZoom(Math.max(.1, Math.min(3, scale))); viewport.scrollTo(0, 0);
    });
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = event.deltaY < 0 ? ZOOM_LEVELS.find(z => z > this.zoom) : [...ZOOM_LEVELS].reverse().find(z => z < this.zoom);
      if (next) this.setZoom(next, event.clientX - viewport.getBoundingClientRect().left, event.clientY - viewport.getBoundingClientRect().top);
    }, { passive: false });
    canvas.addEventListener('pointerdown', event => this.start(event));
    canvas.addEventListener('pointermove', event => this.move(event));
    canvas.addEventListener('pointerup', event => this.finish(event));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => this.cancel());
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.gesture) { event.preventDefault(); this.cancel(); } });
  }
  get readOnly(): boolean { return this.referencing; }
  get scene(): MapScene { return this.referencing ? this.cachedReference! : this.model.document; }
  get areaId(): string { return this.referencing ? this.referenceArea : this.model.areaId; }
  get selection(): Selection | null { return this.referencing ? this.referenceSelection : this.model.selection; }
  select(selection: Selection): boolean {
    if (this.referencing) { this.referenceSelection = selection; return true; }
    return this.model.select(selection);
  }
  selectArea(id: string): void {
    if (this.referencing) { if (this.scene.areas.some(a => a.id === id)) { this.referenceArea = id; this.referenceSelection = null; } }
    else this.model.selectArea(id);
    this.viewport.scrollTo(0, 0);
  }
  private setReference(value: boolean): void {
    if (this.model.pending) {
      this.model.notice = '未反映の入力を反映または取り消してから、表示を切り替えてください。'; this.notify(); return;
    }
    this.cancel(false);
    if (value && !this.cachedReference) {
      this.cachedReference = this.makeReference();
      this.referenceArea = this.cachedReference.areas.find(a => a.id === 'town-main')?.id ?? this.cachedReference.areas[0].id;
    }
    if (!value) {
      for (const [control, disabled] of this.lockedControls) if (control.isConnected) control.disabled = disabled;
      this.lockedControls.clear();
    }
    this.referencing = value;
    this.canvas.dataset.mapReadOnly = String(value);
    this.viewport.scrollTo(0, 0); this.notify();
  }
  private setZoom(next: number, anchorX = this.viewport.clientWidth / 2, anchorY = this.viewport.clientHeight / 2): void {
    const x = zoomScroll(this.viewport.scrollLeft, anchorX, this.zoom, next), y = zoomScroll(this.viewport.scrollTop, anchorY, this.zoom, next);
    this.zoom = next; this.draw(); this.viewport.scrollTo(x, y);
    const select = document.querySelector<HTMLSelectElement>('#map-zoom')!;
    select.querySelector('[data-fit]')?.remove();
    if (![...select.options].some(option => Number(option.value) === next)) {
      const option = document.createElement('option'); option.dataset.fit = 'true'; option.value = String(next); option.textContent = `${Math.round(next * 100)}%（全体）`; select.append(option);
    }
    select.value = String(next);
    document.getElementById('map-scale')!.textContent = `${Math.round(next * 100)}%`;
  }
  click(event: MouseEvent): void {
    if (this.canvas.dataset.npcPlacement === 'true' || performance.now() < this.suppressUntil) return;
    const tile = this.tile(event), selection = hitSelection(this.scene, this.areaId, tile.x, tile.y, this.selection);
    if (selection) this.select(selection);
    this.notify();
  }
  private tile(event: { clientX: number; clientY: number }) { return tileFromClient(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.canvas); }
  private start(event: PointerEvent): void {
    if (this.canvas.dataset.npcPlacement === 'true' || ![0, 1].includes(event.button)) return;
    const pan = event.button === 1 || event.shiftKey || document.querySelector<HTMLSelectElement>('#map-tool')!.value === 'pan';
    if (this.readOnly && !pan) return;
    const tile = this.tile(event), selection = pan ? null : hitSelection(this.scene, this.areaId, tile.x, tile.y, this.selection);
    if (!pan && (!selection || !['objects', 'facilities', 'portals'].includes(selection.table) || !this.select(selection))) return;
    const origin = selection ? footprint(this.scene, selection) : null;
    this.gesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      scrollX: this.viewport.scrollLeft, scrollY: this.viewport.scrollTop, pan, moved: false, selection,
      tileX: tile.x, tileY: tile.y, origin, target: null, issuesBefore: [...this.model.issues] };
    this.canvas.setPointerCapture(event.pointerId);
    if (pan) event.preventDefault();
    this.notify();
  }
  private move(event: PointerEvent): void {
    const tile = this.tile(event), coordinate = document.getElementById('map-coordinate')!;
    coordinate.textContent = `X ${tile.x} / Y ${tile.y}`;
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    if (this.canvas.dataset.npcPlacement === 'true') { this.cancel(); return; }
    if (Math.hypot(event.clientX - g.clientX, event.clientY - g.clientY) < 4 && !g.moved) return;
    g.moved = true; event.preventDefault();
    if (g.pan) { this.viewport.scrollTo(g.scrollX - event.clientX + g.clientX, g.scrollY - event.clientY + g.clientY); return; }
    if (!g.origin || !g.selection) return;
    const target = { x: g.origin.x + tile.x - g.tileX, y: g.origin.y + tile.y - g.tileY };
    if (g.target?.x === target.x && g.target.y === target.y) return;
    g.target = target;
    try { this.model.issues = validateMapOperations(this.model.document, mapMoveOperations(this.model.document, g.selection, target.x, target.y)); }
    catch (error) { this.model.issues = mapIssues(error); }
    this.model.notice = this.model.issues.length ? 'この位置へは移動できません。離すと変更せず、Escで取り消せます。' : `X ${target.x} / Y ${target.y} へ移動します。離して確定、Escで取消。`;
    this.notify();
  }
  private finish(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (g.moved) this.suppressUntil = performance.now() + 150;
    if (g.moved && !g.pan && g.selection && g.target) {
      try { this.model.commit(mapMoveOperations(this.model.document, g.selection, g.target.x, g.target.y)); }
      catch (error) { this.model.issues = mapIssues(error); }
    }
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.notify();
  }
  private cancel(notify = true): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null; this.model.issues = g.issuesBefore; this.model.notice = 'ドラッグを取り消しました。';
    if (this.canvas.hasPointerCapture(g.pointerId)) this.canvas.releasePointerCapture(g.pointerId);
    if (notify) this.notify();
  }
  afterRender(): void {
    const select = document.querySelector<HTMLSelectElement>('#map-source')!;
    select.value = this.referencing ? 'reference' : 'sample';
    this.canvas.dataset.mapReadOnly = String(this.referencing);
    document.getElementById('map-source-note')!.textContent = this.referencing ? '実マップの参照表示です。編集するにはサンプルへ戻ってください。' : 'サンプルを編集しています。施設の移動は関連する入口と復帰位置も一緒に動かします。';
    document.getElementById('map-scale')!.textContent = `${Math.round(this.zoom * 100)}%`;
    const panel = document.getElementById('reference-properties')!;
    panel.hidden = !this.referencing;
    if (this.referencing) {
      const entity = selectedEntity(this.scene, this.selection);
      panel.querySelector('pre')!.textContent = entity ? JSON.stringify(entity, null, 2) : '一覧やグリッドから参照する対象を選択してください。';
      document.querySelector<HTMLElement>('.inspector')!.inert = true;
      for (const control of document.querySelectorAll<InputControl>('.inspector input, .inspector select, .inspector textarea, .inspector button, .sidebar .add-box button, .sidebar .add-box input, .sidebar .add-box select, #npc-add')) {
        if (!this.lockedControls.has(control)) this.lockedControls.set(control, control.disabled);
        control.disabled = true;
      }
      document.getElementById('selected-caption')!.textContent = entity ? `参照中：${this.selection!.table} / ${entity.id}` : '実マップは読み取り専用です。';
    } else document.querySelector<HTMLElement>('.inspector')!.inert = false;
  }
  draw(): void {
    const scene = this.scene, area = scene.areas.find(a => a.id === this.areaId);
    if (!area) return;
    const canvas = this.canvas, cell = MAP_CELL;
    canvas.width = area.width * cell; canvas.height = area.height * cell;
    canvas.style.width = `${canvas.width * this.zoom}px`; canvas.style.height = `${canvas.height * this.zoom}px`;
    document.getElementById('area-size')!.textContent = `${area.width} × ${area.height}`;
    const c = canvas.getContext('2d')!;
    const showGrid = document.querySelector<HTMLInputElement>('#map-grid')!.checked;
    const collision = document.querySelector<HTMLInputElement>('#map-collision')!.checked;
    for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
      const solid = isSolidGround(area.ground[y * area.width + x]);
      c.fillStyle = solid ? '#83958a' : area.kind === 'indoor' ? '#eee5cd' : '#d8ead1';
      c.fillRect(x * cell, y * cell, cell, cell);
      if (collision && solid) { c.fillStyle = '#9e353522'; c.fillRect(x * cell, y * cell, cell, cell); }
      if (showGrid) { c.strokeStyle = '#ffffff99'; c.strokeRect(x * cell + .5, y * cell + .5, cell, cell); }
    }
    const draw = (table: Selection['table'], id: string, x: number, y: number, w: number, h: number, color: string, symbol: string, solid: boolean) => {
      c.fillStyle = color; c.fillRect(x * cell + 3, y * cell + 3, w * cell - 6, h * cell - 6);
      if (collision && solid) { c.strokeStyle = '#934f48'; c.strokeRect(x * cell + 3, y * cell + 3, w * cell - 6, h * cell - 6); }
      c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(symbol, (x + w / 2) * cell, (y + h / 2) * cell);
      if (this.selection?.table === table && this.selection.id === id) this.outline(c, { x, y, w, h }, '#f7c45a');
    };
    for (const o of scene.objects) if (o.areaId === area.id) {
      const sprite = objectSprite(o);
      const scale = cell / TILE;
      c.imageSmoothingEnabled = false;
      c.drawImage(sprite.canvas, (o.x * cell) + sprite.ox * scale, (o.y * cell) + sprite.oy * scale, sprite.canvas.width * scale, sprite.canvas.height * scale);
      if (this.selection?.table === 'objects' && this.selection.id === o.id) this.outline(c, { x: o.x, y: o.y, w: o.w, h: o.h }, '#f7c45a');
    }
    for (const i of scene.interactions) if (i.areaId === area.id) {
      if (i.kind === 'npc' && i.sprite) {
        const sprite = characterSprite(i.sprite, i.facing ?? 'down', 0);
        const scale = Math.min(((i.w ?? 1) * cell - 5) / sprite.canvas.width, ((i.h ?? 1) * cell - 4) / sprite.canvas.height);
        c.imageSmoothingEnabled = false;
        c.drawImage(sprite.canvas, (i.x + (i.w ?? 1) / 2) * cell - sprite.canvas.width * scale / 2, (i.y + (i.h ?? 1)) * cell - sprite.canvas.height * scale - 2, sprite.canvas.width * scale, sprite.canvas.height * scale);
        if (this.selection?.table === 'interactions' && this.selection.id === i.id) this.outline(c, { x: i.x, y: i.y, w: i.w ?? 1, h: i.h ?? 1 }, '#f7c45a');
      } else draw('interactions', i.id, i.x, i.y, i.w ?? 1, i.h ?? 1, '#c58d48', '話', i.solid);
    }
    for (const p of scene.portals) if (p.areaId === area.id) draw('portals', p.id, p.from.x, p.from.y, p.from.w ?? 1, 1, '#6e91bd', '↗', false);
    if (this.selection?.table === 'facilities') {
      const rect = footprint(scene, this.selection); if (rect) this.outline(c, rect, '#f7c45a');
    }
    if (showGrid) {
      c.font = '10px system-ui'; c.fillStyle = '#203f36'; c.textAlign = 'left'; c.textBaseline = 'top';
      for (let x = 0; x < area.width; x++) c.fillText(String(x), x * cell + 3, 3);
      for (let y = 1; y < area.height; y++) c.fillText(String(y), 3, y * cell + 3);
    }
    const g = this.gesture;
    if (g?.target && g.origin) { c.setLineDash([5, 3]); this.outline(c, { ...g.origin, ...g.target }, this.model.issues.length ? '#b83c35' : '#174e3b'); c.setLineDash([]); }
  }
  private outline(c: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string): void {
    c.strokeStyle = color; c.lineWidth = 3;
    c.strokeRect(r.x * MAP_CELL + 2, r.y * MAP_CELL + 2, r.w * MAP_CELL - 4, r.h * MAP_CELL - 4); c.lineWidth = 1;
  }
}
