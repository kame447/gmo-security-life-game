/// <reference types="vite/client" />
import source from '../../data/editor-prototype.json?raw';
import { isSolidGround } from '../world/tiles.ts';
import type { EditOperation, EditorArea, EditorEntity, EditorTable } from '../editor/index.ts';
import { createEditorBackend } from './backend.ts';
import { EditorModel, type Selection } from './model.ts';
import { NpcPanel } from './npc/panel.ts';

const model = new EditorModel(createEditorBackend(JSON.parse(source)));
const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor element: ${selector}`);
  return element;
};
const areaSelect = $<HTMLSelectElement>('#area-select');
const list = $<HTMLDivElement>('#entity-list');
const canvas = $<HTMLCanvasElement>('#grid');
const form = $<HTMLFormElement>('#entity-form');
const json = $<HTMLTextAreaElement>('#entity-json');
const xInput = $<HTMLInputElement>('#position-x');
const yInput = $<HTMLInputElement>('#position-y');
const validation = $<HTMLDivElement>('#validation');
const undo = $<HTMLButtonElement>('#undo');
const redo = $<HTMLButtonElement>('#redo');
const download = $<HTMLButtonElement>('#download');
const labels: Record<EditorTable, string> = { areas: 'エリア', facilities: '施設', objects: '配置物', interactions: '調査対象', portals: '出入口' };
const npcPanel = new NpcPanel(model, () => render(), () => renderControls(), () => renderGrid());

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function areaEntities(): { table: EditorTable; entity: EditorEntity }[] {
  const d = model.document;
  const area = d.areas.find(item => item.id === model.areaId);
  if (!area) return [];
  return [
    { table: 'areas', entity: area },
    ...d.facilities.filter(item => item.areaId === area.id).map(entity => ({ table: 'facilities' as const, entity })),
    ...d.objects.filter(item => item.areaId === area.id).map(entity => ({ table: 'objects' as const, entity })),
    ...d.interactions.filter(item => item.areaId === area.id).map(entity => ({ table: 'interactions' as const, entity })),
    ...d.portals.filter(item => item.areaId === area.id).map(entity => ({ table: 'portals' as const, entity })),
  ];
}
function name(entity: EditorEntity): string {
  if ('name' in entity) return entity.name;
  if ('kind' in entity) return entity.kind;
  return entity.id;
}
function select(selection: Selection): void { model.select(selection); render(); }

function renderList(): void {
  areaSelect.replaceChildren(...model.document.areas.map(area => {
    const option = node('option', `${area.name} (${area.id})`); option.value = area.id; return option;
  }));
  areaSelect.value = model.areaId;
  const entries = areaEntities();
  $('#entity-count').textContent = `${entries.length} 件`;
  list.replaceChildren(...entries.map(({ table, entity }) => {
    const button = node('button'); button.type = 'button'; button.className = 'entity';
    button.dataset.table = table; button.dataset.id = entity.id;
    button.setAttribute('aria-pressed', String(model.selection?.table === table && model.selection.id === entity.id));
    button.append(node('span', `${labels[table]} · ${name(entity)}`), node('small', entity.id));
    button.addEventListener('click', () => select({ table, id: entity.id }));
    return button;
  }));
}

const cell = 38;
function renderGrid(): void {
  const area = model.document.areas.find(item => item.id === model.areaId);
  if (!area) return;
  $('#area-size').textContent = `${area.width} × ${area.height}`;
  canvas.width = area.width * cell; canvas.height = area.height * cell;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas 2D is unavailable');
  for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
    c.fillStyle = isSolidGround(area.ground[y * area.width + x]) ? '#83958a' : area.kind === 'indoor' ? '#eee5cd' : '#d8ead1';
    c.fillRect(x * cell, y * cell, cell, cell);
    c.strokeStyle = '#ffffff80'; c.strokeRect(x * cell + .5, y * cell + .5, cell, cell);
  }
  const d = model.document;
  const draw = (table: EditorTable, id: string, x: number, y: number, w: number, h: number, color: string, symbol: string) => {
    c.fillStyle = color; c.fillRect(x * cell + 3, y * cell + 3, w * cell - 6, h * cell - 6);
    c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(symbol, (x + w / 2) * cell, (y + h / 2) * cell);
    if (model.selection?.table === table && model.selection.id === id) {
      c.strokeStyle = '#f7c45a'; c.lineWidth = 3; c.strokeRect(x * cell + 2, y * cell + 2, w * cell - 4, h * cell - 4); c.lineWidth = 1;
    }
  };
  d.objects.filter(item => item.areaId === area.id).forEach(o => draw('objects', o.id, o.x, o.y, o.w, o.h, '#5f9271', '物'));
  d.interactions.filter(item => item.areaId === area.id).forEach(i => draw('interactions', i.id, i.x, i.y, i.w ?? 1, i.h ?? 1, '#c58d48', '話'));
  d.portals.filter(item => item.areaId === area.id).forEach(p => draw('portals', p.id, p.from.x, p.from.y, p.from.w ?? 1, 1, '#6e91bd', '↗'));
  const preview = npcPanel.placementPreview;
  if (preview?.areaId === area.id) {
    c.save(); c.setLineDash([6, 4]); c.lineWidth = 3; c.strokeStyle = '#7042a0';
    c.strokeRect(preview.x * cell + 2, preview.y * cell + 2, preview.w * cell - 4, preview.h * cell - 4); c.restore();
  }
}

function renderInspector(): void {
  const draft = model.draft;
  const npcActive = npcPanel.render();
  form.hidden = !draft || npcActive; $('#empty-inspector').toggleAttribute('hidden', !!draft);
  $('#draft-kind').textContent = draft ? labels[draft.table] : '';
  $('#selected-caption').textContent = draft ? `${draft.id === null ? '新規' : '選択中'}：${labels[draft.table]} / ${draft.id ?? '未保存'}` : '一覧またはグリッドから対象を選択してください。';
  if (!draft || npcActive) return;
  $('#draft-description').textContent = draft.id === null ? '新規データを入力して反映してください。' : `ID: ${draft.id}`;
  json.value = draft.text; xInput.value = draft.x; yInput.value = draft.y;
  $('#coordinates').toggleAttribute('hidden', !draft.positioned);
  $('#position-help').toggleAttribute('hidden', !draft.positioned);
  $<HTMLButtonElement>('#delete').hidden = draft.id === null;
}

function renderValidation(): void {
  validation.classList.toggle('has-errors', model.issues.length > 0);
  validation.replaceChildren(node('h3', '検証'));
  if (model.issues.length) {
    const ul = node('ul');
    for (const issue of model.issues) ul.append(node('li', `${issue.path} [${issue.code}]: ${issue.message}`));
    validation.append(ul);
  } else validation.append(node('p', '検証エラーはありません。'));
  $('#status').textContent = model.notice;
}
function renderChanges(): void {
  const operations = model.changes.operations;
  $('#change-count').textContent = `${operations.length} 件`;
  const target = $('#change-list');
  if (!operations.length) { target.replaceChildren(node('p', '変更はまだありません。')); return; }
  target.replaceChildren(...operations.map((op: EditOperation) => {
    const details = node('details'); details.className = 'change'; details.dataset.operation = op.type;
    details.append(node('summary', `${{ add: '追加', delete: '削除', move: '移動', update: '更新' }[op.type]} · ${labels[op.table]} / ${op.id}`));
    const columns = node('div'); columns.className = 'diff-columns';
    for (const [heading, value] of [['変更前', 'before' in op ? op.before : null], ['変更後', 'after' in op ? op.after : null]] as const) {
      const column = node('div'); column.append(node('strong', heading), node('pre', value ? JSON.stringify(value, null, 2) : '（なし）')); columns.append(column);
    }
    details.append(columns); return details;
  }));
}
function renderControls(): void {
  undo.disabled = !model.backend.canUndo || model.pending;
  redo.disabled = !model.backend.canRedo || model.pending;
  download.disabled = !model.canExport;
  $<HTMLButtonElement>('#apply').disabled = !model.pending;
  $<HTMLButtonElement>('#cancel-draft').disabled = !model.pending && model.issues.length === 0;
  $<HTMLButtonElement>('#delete').disabled = model.pending;
  npcPanel.updateControls();
  $('#export-hint').textContent = model.pending ? '未反映の入力を反映または取り消してください。' : model.issues.length ? '検証エラーを解消してください。' : model.changes.operations.length ? '検証済みの差分を書き出せます。' : '変更を反映すると書き出せます。';
}
function render(): void { renderList(); renderGrid(); renderInspector(); renderValidation(); renderChanges(); renderControls(); }

function hit(area: EditorArea, x: number, y: number): Selection | null {
  const d = model.document;
  const within = (r: { x: number; y: number; w?: number; h?: number }) => x >= r.x && x < r.x + (r.w ?? 1) && y >= r.y && y < r.y + (r.h ?? 1);
  const portal = d.portals.find(p => p.areaId === area.id && within(p.from));
  if (portal) return { table: 'portals', id: portal.id };
  const interaction = d.interactions.find(i => i.areaId === area.id && within(i));
  if (interaction) return { table: 'interactions', id: interaction.id };
  const object = d.objects.find(o => o.areaId === area.id && within(o));
  return object ? { table: 'objects', id: object.id } : null;
}

areaSelect.addEventListener('change', () => { model.selectArea(areaSelect.value); render(); });
$('#add').addEventListener('click', () => { model.startAdd($<HTMLSelectElement>('#add-type').value as Exclude<EditorTable, 'areas'>); render(); });
for (const [element, key] of [[json, 'text'], [xInput, 'x'], [yInput, 'y']] as const) element.addEventListener('input', () => {
  if (model.draft) model.draft[key] = element.value;
  renderControls();
});
form.addEventListener('submit', event => { event.preventDefault(); npcPanel.applyCurrentDraft(); render(); });
$('#cancel-draft').addEventListener('click', () => { model.cancelDraft(); render(); });
$('#delete').addEventListener('click', () => { model.deleteSelection(); render(); });
undo.addEventListener('click', () => { model.history('undo'); render(); });
redo.addEventListener('click', () => { model.history('redo'); render(); });
canvas.addEventListener('click', event => {
  const area = model.document.areas.find(item => item.id === model.areaId);
  if (!area) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width / cell);
  const y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height / cell);
  if (npcPanel.placeAt(x, y)) return;
  if (canvas.dataset.mapReadOnly === 'true') return;
  const selection = hit(area, x, y);
  if (selection) select(selection);
});
download.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([model.exportText()], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'editor-changes.json'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  const key = event.key.toLowerCase();
  const direction = key === 'z' ? event.shiftKey ? 'redo' : 'undo' : key === 'y' && !event.metaKey ? 'redo' : null;
  if (!direction) return;
  event.preventDefault(); model.history(direction); render();
});
window.addEventListener('beforeunload', event => {
  if (model.pending || model.changes.operations.length) {
    event.preventDefault();
    event.returnValue = '';
  }
});
render();
