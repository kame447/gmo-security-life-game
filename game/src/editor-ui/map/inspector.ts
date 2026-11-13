import type { EditorModel } from '../model.ts';
import { footprint } from './scene.ts';
import { mapIssues, operationsFromDraft, validateMapOperations } from './operations.ts';

export class MapInspector {
  private readonly model: EditorModel;
  private readonly container: HTMLElement;
  private readonly onInput: () => void;
  constructor(model: EditorModel, container: HTMLElement, onInput: () => void) {
    this.model = model; this.container = container; this.onInput = onInput;
  }
  preview(): void {
    const draft = this.model.draft;
    if (!draft || !['objects', 'facilities', 'portals'].includes(draft.table)) return;
    try { this.model.issues = validateMapOperations(this.model.document, operationsFromDraft(this.model.document, draft)); }
    catch (error) { this.model.issues = mapIssues(error); }
    this.model.notice = this.model.issues.length ? '入力に検証エラーがあります。反映するか、入力を取り消してください。' : this.model.pending ? '未反映の入力があります。内容を確認して反映してください。' : '';
  }
  render(): void {
    const draft = this.model.draft;
    this.container.replaceChildren();
    this.container.hidden = !draft || !['objects', 'facilities', 'portals'].includes(draft.table);
    if (this.container.hidden || !draft) return;
    let value: Record<string, unknown>;
    try { value = JSON.parse(draft.text); if (!value || typeof value !== 'object' || Array.isArray(value)) return; }
    catch { return; }
    const title = document.createElement('h3'); title.textContent = '配置のプロパティ'; this.container.append(title);
    const fields = document.createElement('div'); fields.className = 'map-property-grid'; this.container.append(fields);
    const get = (path: string) => path.split('.').reduce<unknown>((object, key) => object && typeof object === 'object' ? (object as Record<string, unknown>)[key] : undefined, value);
    const field = (label: string, path: string, type: 'text' | 'number' | 'checkbox' | readonly string[], optional = false, readOnly = false) => {
      const element = Array.isArray(type) ? document.createElement('select') : document.createElement('input');
      element.id = `map-property-${path.replaceAll('.', '-')}`;
      const wrapper = document.createElement('label'); wrapper.htmlFor = element.id; wrapper.textContent = label;
      if (element instanceof HTMLSelectElement) {
        for (const optionValue of [...(optional ? [''] : []), ...type]) {
          const option = document.createElement('option'); option.value = optionValue; option.textContent = optionValue || 'なし'; element.append(option);
        }
        element.value = String(get(path) ?? '');
      } else {
        element.type = type as string;
        if (type === 'number') { element.min = '0'; element.step = '1'; }
        if (type === 'checkbox') { element.checked = get(path) === true; wrapper.className = 'map-check'; }
        else element.value = String(get(path) ?? '');
        element.readOnly = readOnly;
      }
      element.addEventListener('input', () => {
        try {
          const raw = JSON.parse(draft.text) as Record<string, unknown>;
          const keys = path.split('.'), last = keys.pop()!;
          let object = raw;
          for (const key of keys) {
            if (!object[key] || typeof object[key] !== 'object') object[key] = {};
            object = object[key] as Record<string, unknown>;
          }
          if (optional && element.value === '' && type !== 'checkbox') delete object[last];
          else object[last] = type === 'checkbox' ? (element as HTMLInputElement).checked : type === 'number' ? element.value === '' ? null : Number(element.value) : element.value;
          draft.text = JSON.stringify(raw, null, 2);
          this.preview(); this.onInput();
        } catch (error) { this.model.issues = mapIssues(error); this.onInput(); }
      });
      wrapper.append(element); fields.append(wrapper);
    };
    field('ID', 'id', 'text', false, draft.id !== null);
    const data = this.model.document;
    if (draft.table === 'objects') {
      field('種別', 'kind', 'text'); field('所属エリア', 'areaId', data.areas.map(a => a.id));
      field('幅（タイル）', 'w', 'number'); field('高さ（タイル）', 'h', 'number');
      field('通行をふさぐ', 'solid', 'checkbox'); field('スタイル', 'style', 'text', true);
      field('レイヤー', 'layer', ['sorted', 'decal'], true); field('施設', 'facilityId', data.facilities.map(f => f.id), true);
    } else if (draft.table === 'portals') {
      field('所属エリア', 'areaId', data.areas.map(a => a.id)); field('入口の幅', 'from.w', 'number', true);
      field('到着エリア', 'to.areaId', data.areas.map(a => a.id));
      field('到着 X', 'to.x', 'number'); field('到着 Y', 'to.y', 'number');
      field('到着時の向き', 'to.facing', ['up', 'down', 'left', 'right']);
      field('施設', 'facilityId', data.facilities.map(f => f.id), true);
      field('往復する出入口', 'returnPortalId', data.portals.filter(p => p.id !== draft.id).map(p => p.id), true);
    } else {
      field('表示名', 'name', 'text'); field('内部区分', 'interior', ['full', 'interaction', 'background']);
      field('状態', 'state', ['open', 'closed']); field('所属エリア', 'areaId', 'text', false, true);
      const rect = draft.id ? footprint(data, { table: 'facilities', id: draft.id }) : null;
      if (rect) {
        if (draft.originalX === '' && draft.originalY === '') {
          draft.x = draft.originalX = String(rect.x); draft.y = draft.originalY = String(rect.y);
        }
        for (const key of ['x', 'y'] as const) {
          const input = window.document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.id = `map-facility-${key}`; input.value = draft[key];
          const label = window.document.createElement('label'); label.htmlFor = input.id; label.textContent = `施設一式の ${key.toUpperCase()}`;
          input.addEventListener('input', () => { draft[key] = input.value; this.preview(); this.onInput(); });
          label.append(input); fields.append(label);
        }
      }
    }
  }
}
