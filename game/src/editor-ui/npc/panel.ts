import type { Facing } from '../../core/coords.ts';
import type { EditorInteraction } from '../../editor/index.ts';
import { availableNpcSprites } from '../../editor-npc/sprites.ts';
import { characterSprite } from '../../render/sprites.ts';
import type { Draft, EditorModel } from '../model.ts';
import { NpcDraft } from './draft.ts';
import './panel.css';

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing NPC editor element: ${selector}`);
  return element;
};

/** The surrounding editor owns selection, rendering and unsaved-draft protection. */
export class NpcPanel {
  private readonly form = $<HTMLFormElement>('#npc-form');
  private readonly id = $<HTMLInputElement>('#npc-id');
  private readonly name = $<HTMLInputElement>('#npc-name');
  private readonly sprite = $<HTMLSelectElement>('#npc-sprite');
  private readonly facing = $<HTMLSelectElement>('#npc-facing');
  private readonly eventKey = $<HTMLSelectElement>('#npc-event');
  private readonly x = $<HTMLInputElement>('#npc-x');
  private readonly y = $<HTMLInputElement>('#npc-y');
  private readonly w = $<HTMLInputElement>('#npc-w');
  private readonly h = $<HTMLInputElement>('#npc-h');
  private readonly solid = $<HTMLInputElement>('#npc-solid');
  private readonly lines = $<HTMLTextAreaElement>('#npc-lines');
  private readonly preview = $<HTMLCanvasElement>('#npc-preview');
  private readonly grid = $<HTMLCanvasElement>('#grid');
  private readonly placeButton = $<HTMLButtonElement>('#npc-place');
  private readonly draft: NpcDraft;
  private activeDraft: Draft | null = null;
  private placing = false;

  constructor(private readonly model: EditorModel, private readonly renderAll: () => void,
    private readonly renderControls: () => void, private readonly renderGrid: () => void) {
    this.draft = new NpcDraft(model);
    $('#npc-add').addEventListener('click', () => { this.draft.begin(); this.renderAll(); });
    for (const [element, key] of [[this.id, 'id'], [this.name, 'name']] as const) {
      element.addEventListener('input', () => { this.draft.set(key, element.value); this.renderControls(); });
    }
    this.sprite.addEventListener('change', () => { this.draft.set('sprite', this.sprite.value); this.drawPreview(); this.renderControls(); });
    this.facing.addEventListener('change', () => { this.draft.set('facing', this.facing.value as Facing); this.drawPreview(); this.renderControls(); });
    this.eventKey.addEventListener('change', () => { this.draft.set('eventKey', this.eventKey.value); this.renderControls(); });
    for (const input of [this.x, this.y]) input.addEventListener('input', () => {
      this.draft.setPosition(this.x.value, this.y.value); this.renderControls(); this.renderGrid();
    });
    for (const [input, key] of [[this.w, 'w'], [this.h, 'h']] as const) input.addEventListener('input', () => {
      const value = /^\d+$/.test(input.value) && Number.isSafeInteger(Number(input.value)) ? Number(input.value) : input.value;
      this.draft.set(key, value as number); this.renderControls(); this.renderGrid();
    });
    this.solid.addEventListener('change', () => { this.draft.set('solid', this.solid.checked); this.renderControls(); });
    this.lines.addEventListener('input', () => { this.draft.set('lines', this.lines.value === '' ? [] : this.lines.value.split('\n')); this.renderControls(); });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.draft.apply(); this.renderAll(); });
    $('#npc-cancel').addEventListener('click', () => { this.model.cancelDraft(); this.placing = false; this.renderAll(); });
    $('#npc-delete').addEventListener('click', () => { this.model.deleteSelection(); this.placing = false; this.renderAll(); });
    this.placeButton.addEventListener('click', () => {
      if (this.grid.dataset.mapReadOnly === 'true') { this.placing = false; this.updateControls(); return; }
      this.placing = !this.placing; this.updateControls();
    });
  }

  /** Called before ordinary grid hit-testing; a placement remains a draft until confirmed. */
  placeAt(x: number, y: number): boolean {
    if (this.grid.dataset.mapReadOnly === 'true') {
      this.placing = false; this.grid.dataset.npcPlacement = 'false'; this.updateControls(); return false;
    }
    if (!this.placing || !this.draft.value) return false;
    this.draft.setPosition(String(x), String(y));
    this.placing = false;
    this.renderAll();
    return true;
  }

  /** The generic JSON form may change a different interaction into an NPC. */
  applyCurrentDraft(): void {
    if (this.draft.value) { this.draft.clearGeneratedIdOnConversion(); this.draft.apply(); }
    else this.model.applyDraft();
  }

  get placementPreview(): { areaId: string; x: number; y: number; w: number; h: number } | null {
    const npc = this.draft.value, draft = this.model.draft;
    if (!npc || !draft || this.grid.dataset.mapReadOnly === 'true' || !this.model.pending || !/^\d+$/.test(draft.x) || !/^\d+$/.test(draft.y)) return null;
    const x = Number(draft.x), y = Number(draft.y), w = npc.w ?? 1, h = npc.h ?? 1;
    if (![x, y, w, h].every(Number.isSafeInteger) || w < 1 || h < 1 || w > 256 || h > 256) return null;
    return { areaId: npc.areaId, x, y, w, h };
  }

  render(): boolean {
    const npc = this.draft.value, draft = this.model.draft;
    if (draft !== this.activeDraft) { this.placing = false; this.activeDraft = draft; }
    if (this.grid.dataset.mapReadOnly === 'true') this.placing = false;
    this.grid.dataset.npcPlacement = String(this.placing && !!npc);
    this.form.hidden = !npc;
    if (!npc || !draft) return false;
    this.id.value = npc.id; this.id.disabled = draft.id !== null;
    this.name.value = npc.name;
    this.x.value = draft.x; this.y.value = draft.y;
    this.w.value = String(npc.w ?? 1); this.h.value = String(npc.h ?? 1);
    this.solid.checked = npc.solid;
    this.lines.value = Array.isArray(npc.lines) ? npc.lines.join('\n') : '';
    this.facing.value = npc.facing ?? 'down';
    const sprites = availableNpcSprites(this.model.document);
    if (npc.sprite && !sprites.includes(npc.sprite)) sprites.push(npc.sprite);
    this.options(this.sprite, sprites, npc.sprite ?? '', '選択できるスプライトがありません');
    this.options(this.eventKey, this.model.document.catalogs.eventKeys, npc.eventKey, 'イベント参照がありません');
    this.drawPreview(); this.updateControls();
    return true;
  }
  updateControls(): void {
    if (!this.draft.value || !this.model.draft) return;
    $<HTMLButtonElement>('#npc-apply').disabled = !this.model.pending;
    $<HTMLButtonElement>('#npc-cancel').disabled = !this.model.pending && !this.model.issues.length;
    const remove = $<HTMLButtonElement>('#npc-delete');
    remove.hidden = this.model.draft.id === null;
    remove.disabled = this.model.pending;
    this.placeButton.disabled = this.grid.dataset.mapReadOnly === 'true';
    this.placeButton.setAttribute('aria-pressed', String(this.placing));
    this.grid.dataset.npcPlacement = String(this.placing);
    $('#npc-place-help').textContent = this.placing ? 'グリッドをクリックして位置を指定してください。' : 'ボタンの後にグリッドをクリックして位置を指定できます。';
  }
  private options(select: HTMLSelectElement, values: readonly string[], current: string, empty: string): void {
    select.replaceChildren();
    if (!values.length) { const option = document.createElement('option'); option.value = ''; option.textContent = empty; select.append(option); }
    for (const value of values) { const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option); }
    select.value = current;
  }
  private drawPreview(): void {
    const npc: EditorInteraction | null = this.draft.value;
    const context = this.preview.getContext('2d');
    if (!npc || !context) return;
    context.clearRect(0, 0, this.preview.width, this.preview.height);
    if (!npc.sprite) return;
    const facing = (['up', 'down', 'left', 'right'].includes(npc.facing ?? '') ? npc.facing : 'down') as Facing;
    const sprite = characterSprite(npc.sprite, facing, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(sprite.canvas, 0, 0, this.preview.width, this.preview.height);
  }
}
