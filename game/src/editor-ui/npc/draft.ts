import { EditorValidationError, type EditorInteraction } from '../../editor/index.ts';
import type { EditorModel } from '../model.ts';
import { validateNpc } from '../../editor-npc/model.ts';
import { availableNpcSprites } from '../../editor-npc/sprites.ts';

/** Uses the GUI's one draft/selection state and its shared validated undo history. */
export class NpcDraft {
  private readonly model: EditorModel;
  constructor(model: EditorModel) { this.model = model; }

  get value(): EditorInteraction | null {
    const draft = this.model.draft;
    if (!draft || draft.table !== 'interactions') return null;
    try {
      const value: unknown = JSON.parse(draft.text);
      return value && typeof value === 'object' && !Array.isArray(value) && (value as EditorInteraction).kind === 'npc'
        ? value as EditorInteraction : null;
    } catch { return null; }
  }

  begin(): boolean {
    if (!this.model.startAdd('interactions')) return false;
    const draft = this.model.draft!;
    const document = this.model.document;
    const npc: EditorInteraction = { id: '', areaId: this.model.areaId, kind: 'npc', name: '', x: 1, y: 1,
      w: 1, h: 1, solid: true, sprite: availableNpcSprites(document)[0] ?? '', facing: 'down',
      eventKey: document.catalogs.eventKeys[0] ?? '', lines: [] };
    draft.text = JSON.stringify(npc, null, 2);
    draft.x = '1'; draft.y = '1'; draft.positioned = true;
    return true;
  }

  set<K extends keyof EditorInteraction>(key: K, value: EditorInteraction[K]): void {
    const npc = this.value, draft = this.model.draft;
    if (!npc || !draft) return;
    npc[key] = value;
    draft.text = JSON.stringify(npc, null, 2);
  }
  setPosition(x: string, y: string): void {
    if (!this.value || !this.model.draft) return;
    this.model.draft.x = x; this.model.draft.y = y;
  }
  /** A generic new-interaction template is not an ID entered for an NPC. */
  clearGeneratedIdOnConversion(): void {
    const npc = this.value, draft = this.model.draft;
    if (!npc || !draft || draft.id !== null) return;
    try {
      const original = JSON.parse(draft.originalText) as EditorInteraction;
      if (original.kind !== 'npc' && npc.id === original.id) this.set('id', '');
    } catch { /* The generic form reports malformed JSON. */ }
  }
  apply(): boolean {
    const npc = this.value;
    if (!npc) return false;
    try { validateNpc(npc); }
    catch (error) {
      if (!(error instanceof EditorValidationError)) throw error;
      this.model.issues = error.issues;
      this.model.notice = '反映できませんでした。入力と検証結果を確認してください。';
      return false;
    }
    return this.model.applyDraft();
  }
}
