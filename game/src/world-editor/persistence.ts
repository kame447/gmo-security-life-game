import { parseDocument, previewChangeSet } from '../editor';
import { assembleEditorWorld } from '../editor/runtime';
import type { World } from '../world/runtime';
import { validateWorld, AREA_FACTORIES } from '../world';
import { areaLayout, staleLayouts } from '../world/layouts';
import { canonicalJSON } from '../editor/schema';
import { documentLayout, worldDocument } from './document';
import { HOME_AREA } from './model';
import { assertHomeWorldEdit as assertInteriorEdit } from './policy';
import { trustedContext } from './trusted-context';

/** Called with a World loaded by the writer, never with a browser-supplied context. */
export function prepareSave(raw: unknown, world: World) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('保存データが不正です');
  const request = raw as { areaId: string; changes: unknown };
  if (Object.keys(request).sort().join() !== 'areaId,changes' || request.areaId !== HOME_AREA) throw new Error('保存できるのは「じぶんのいえ」の配置だけです');
  if (staleLayouts(AREA_FACTORIES.map(create => create())).length) throw new Error('生成元が変わっています。配置ファイルの移行を確認してください');
  const context = trustedContext(world);
  const current = parseDocument(worldDocument(world),context);
  const preview = previewChangeSet(current,request.changes,context);
  assertInteriorEdit(current,preview.document,HOME_AREA);
  const problems = validateWorld(assembleEditorWorld(preview.document));
  if (problems.length) throw new Error(problems.join('\n'));
  const source = areaLayout(HOME_AREA);
  if (!source) throw new Error('配置ファイルの初回移行が必要です');
  const layout = documentLayout(preview.document,source);
  return { areaId: HOME_AREA, relativePath: `data/world/areas/${HOME_AREA}.json`, text: canonicalJSON(layout),
    summary: preview.changes.operations.map(o => ({ type: o.type, table: o.table, id: o.id,
      ...(o.type === 'add' ? {} : { before: o.before }), ...(o.type === 'delete' ? {} : { after: o.after }) })) };
}
