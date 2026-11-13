/// <reference types="vite/client" />
import source from '../../data/editor-prototype.json?raw';
import { buildWorld } from '../world/index.ts';
import type { EditOperation, EditorEntity, EditorTable } from '../editor/index.ts';
import { createEditorBackend } from './backend.ts';
import { EditorModel, type Selection } from './model.ts';
import { MapView } from './map/view.ts';
import { MapInspector } from './map/inspector.ts';
import { referenceScene } from './map/reference.ts';
import { sceneEntries } from './map/scene.ts';
import { operationsFromDraft } from './map/operations.ts';
import { MAP_CELL, tileFromClient } from './map/viewport.ts';
import { NpcPanel } from './npc/panel.ts';
import { characterSprite } from '../render/sprites.ts';

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
const mapView = new MapView(model, canvas, $<HTMLElement>('#map-viewport'), () => referenceScene(buildWorld()), render);
const mapInspector = new MapInspector(model, $<HTMLElement>('#map-fields'), () => {
  json.value = model.draft?.text ?? ''; renderValidation(); renderControls();
});
const npcPanel = new NpcPanel(model, render, renderControls, renderGrid);

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function areaEntities(): { table: EditorTable; entity: EditorEntity }[] { return sceneEntries(mapView.scene, mapView.areaId); }
function name(entity: EditorEntity): string {
  if ('name' in entity) return entity.name;
  if ('kind' in entity) return entity.kind;
  return entity.id;
}
function select(selection: Selection): void { mapView.select(selection); render(); }

function renderList(): void {
  areaSelect.replaceChildren(...mapView.scene.areas.map(area => {
    const option = node('option', `${area.name} (${area.id})`); option.value = area.id; return option;
  }));
  areaSelect.value = mapView.areaId;
  const filter = $<HTMLSelectElement>('#entity-filter').value;
  const query = $<HTMLInputElement>('#entity-search').value.trim().toLocaleLowerCase();
  const entries = areaEntities().filter(({ table, entity }) => {
    const npc = table === 'interactions' && 'kind' in entity && entity.kind === 'npc';
    if (filter === 'npc' ? !npc : filter !== 'all' && (filter !== table || filter === 'interactions' && npc)) return false;
    return !query || (name(entity) + ' ' + entity.id).toLocaleLowerCase().includes(query);
  });
  $('#entity-count').textContent = `${entries.length} 件`;
  list.replaceChildren(...entries.map(({ table, entity }) => {
    const button = node('button'); button.type = 'button'; button.className = 'entity';
    button.dataset.table = table; button.dataset.id = entity.id;
    button.setAttribute('aria-pressed', String(mapView.selection?.table === table && mapView.selection.id === entity.id));
    const info = node('span');
    info.className = 'entity-info';
    info.append(node('span', labels[table] + ' · ' + name(entity)), node('small', entity.id));
    if (table === 'interactions' && 'kind' in entity && entity.kind === 'npc' && 'sprite' in entity && typeof entity.sprite === 'string') {
      const avatar = node('canvas'); avatar.width = 42; avatar.height = 46; avatar.className = 'entity-avatar';
      const context = avatar.getContext('2d');
      if (context) {
        const sprite = characterSprite(entity.sprite, 'down', 0);
        context.imageSmoothingEnabled = false;
        context.drawImage(sprite.canvas, 6, 2, 30, 42);
      }
      button.append(avatar);
    }
    button.append(info);
    button.addEventListener('click', () => select({ table, id: entity.id }));
    return button;
  }));
}

function renderGrid(): void {
  mapView.draw();
  const preview = npcPanel.placementPreview;
  if (mapView.readOnly || preview?.areaId !== mapView.areaId) return;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.save(); c.setLineDash([6, 4]); c.lineWidth = 3; c.strokeStyle = '#7042a0';
  c.strokeRect(preview.x * MAP_CELL + 2, preview.y * MAP_CELL + 2, preview.w * MAP_CELL - 4, preview.h * MAP_CELL - 4);
  c.restore();
}

function renderInspector(): void {
  mapInspector.render();
  const draft = model.draft;
  const npcActive = npcPanel.render();
  $<HTMLFormElement>('#npc-form').hidden = mapView.readOnly || !npcActive;
  form.hidden = mapView.readOnly || !draft || npcActive; $('#empty-inspector').toggleAttribute('hidden', !!draft);
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
  undo.disabled = mapView.readOnly || !model.backend.canUndo || model.pending;
  redo.disabled = mapView.readOnly || !model.backend.canRedo || model.pending;
  download.disabled = mapView.readOnly || !model.canExport;
  $<HTMLButtonElement>('#add').disabled = mapView.readOnly;
  $<HTMLButtonElement>('#apply').disabled = mapView.readOnly || !model.pending;
  $<HTMLButtonElement>('#cancel-draft').disabled = !model.pending && model.issues.length === 0;
  $<HTMLButtonElement>('#delete').disabled = mapView.readOnly || model.pending;
  npcPanel.updateControls();
  $('#export-hint').textContent = model.pending ? '未反映の入力を反映または取り消してください。' : model.issues.length ? '検証エラーを解消してください。' : model.changes.operations.length ? '検証済みの差分を書き出せます。' : '変更を反映すると書き出せます。';
}
function render(): void { renderList(); renderGrid(); renderInspector(); renderValidation(); renderChanges(); renderControls(); mapView.afterRender(); }

areaSelect.addEventListener('change', () => { mapView.selectArea(areaSelect.value); render(); });
$('#entity-filter').addEventListener('change', renderList);
$('#entity-search').addEventListener('input', renderList);
$('#add').addEventListener('click', () => { if (mapView.readOnly) return; model.startAdd($<HTMLSelectElement>('#add-type').value as Exclude<EditorTable, 'areas'>); render(); });
for (const [element, key] of [[json, 'text'], [xInput, 'x'], [yInput, 'y']] as const) element.addEventListener('input', () => {
  if (model.draft) model.draft[key] = element.value;
  mapInspector.preview(); renderValidation(); renderControls();
});
json.addEventListener('change', () => { mapInspector.render(); mapInspector.preview(); renderValidation(); renderControls(); });
form.addEventListener('submit', event => {
  event.preventDefault(); if (mapView.readOnly) return;
  const draft = model.draft;
  if (draft && ['objects', 'facilities', 'portals'].includes(draft.table)) model.applyDraft(() => operationsFromDraft(model.document, draft));
  else npcPanel.applyCurrentDraft();
  render();
});
$('#cancel-draft').addEventListener('click', () => { if (mapView.readOnly) return; model.cancelDraft(); render(); });
$('#delete').addEventListener('click', () => { if (mapView.readOnly) return; model.deleteSelection(); render(); });
undo.addEventListener('click', () => { if (mapView.readOnly) return; model.history('undo'); render(); });
redo.addEventListener('click', () => { if (mapView.readOnly) return; model.history('redo'); render(); });
canvas.addEventListener('click', event => {
  const tile = tileFromClient(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas);
  // A reference click belongs to MapView. It never changes the retained sample NPC draft.
  if (mapView.readOnly || canvas.dataset.mapReadOnly === 'true') {
    npcPanel.placeAt(tile.x, tile.y); // The NPC guard cancels any previously armed placement.
    if (mapView.readOnly) mapView.click(event); else render();
    return;
  }
  // NPC placement owns this click; MapView must not select or drag another entity afterward.
  if (npcPanel.placeAt(tile.x, tile.y)) return;
  if (canvas.dataset.npcPlacement === 'true') return;
  mapView.click(event);
});
download.addEventListener('click', () => {
  if (mapView.readOnly) return;
  const url = URL.createObjectURL(new Blob([model.exportText()], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'editor-changes.json'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('keydown', event => {
  if (mapView.readOnly) return;
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
$<HTMLButtonElement>('#map-fit').click();
