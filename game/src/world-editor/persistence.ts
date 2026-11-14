import { parseDocument, previewChangeSet } from '../editor';
import { withDerived } from '../editor/changes';
import { assembleEditorWorld } from '../editor/runtime';
import type { World } from '../world/runtime';
import { validateWorld, AREA_FACTORIES } from '../world';
import { areaLayout, staleLayouts } from '../world/layouts';
import { canonicalJSON } from '../editor/schema';
import type { EditorValidationContext } from '../editor/types';
import { initialLayout } from '../world/layouts/codec';
import { documentLayout, worldDocument } from './document';
import { HOME_AREA } from './model';
import { AREA_EDIT_POLICIES, assertWorldEdit, changedAreaIds, type AreaEditPolicies } from './world-policy';
import { trustedContext } from './trusted-context';

/** Called with a World loaded by the writer, never with a browser-supplied context. */
export function prepareSave(raw: unknown, world: World, policies: AreaEditPolicies = AREA_EDIT_POLICIES) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('保存データが不正です');
  const request = raw as { areaId?: string; changes: unknown };
  const keys = Object.keys(request).sort().join();
  // Existing phase-one clients may send their home hint. It never selects save targets.
  if (keys !== 'changes' && (keys !== 'areaId,changes' || request.areaId !== HOME_AREA)) throw new Error('保存データの欄が不正です');
  if (staleLayouts(AREA_FACTORIES.map(create => create())).length) throw new Error('生成元が変わっています。配置ファイルの移行を確認してください');
  const context = trustedContext(world);
  const current = parseDocument(withDerived(worldDocument(world),context),context);
  const preview = previewChangeSet(current,request.changes,context);
  assertWorldEdit(current,preview.document,context,policies);
  // The current main has the one-argument validator. The station integration adds
  // support for these trusted options; passing the empty links now is compatible.
  const validateWithLinks: (world: World, options?: Pick<EditorValidationContext,'railLinks'>) => string[] = validateWorld;
  const problems = validateWithLinks(assembleEditorWorld(preview.document), { railLinks: context.railLinks });
  if (problems.length) throw new Error(problems.join('\n'));
  const generated = new Map(AREA_FACTORIES.map(create => { const area = create(); return [area.id,area] as const; }));
  const files = changedAreaIds(current,preview.document).map(areaId => {
    const base = generated.get(areaId);
    if (!base) throw new Error(`配置の生成元が見つかりません: ${areaId}`);
    const existing = areaLayout(areaId), source = existing ?? initialLayout(base,'AreaFactory');
    const layout = documentLayout(preview.document,source);
    // Preserve authored order, including equal-depth sprites. New IDs append in
    // deterministic document order; changing one object does not reorder a town.
    for (const table of ['objects','interactions','portals'] as const) {
      const list = layout[table], order = new Map(source[table].map((item,index) => [item.id,index]));
      list.sort((a,b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    return { areaId, relativePath: `data/world/areas/${areaId}.json`, text: canonicalJSON(layout), created: !existing };
  });
  // Single-file aliases keep phase-one tools/tests compatible. Multi-file callers
  // use files; an empty text alias cannot silently stand for only part of a save.
  const single = files.length === 1 ? files[0] : undefined;
  return { files, areaId: single?.areaId ?? '', relativePath: single?.relativePath ?? '', text: single?.text ?? '',
    summary: preview.changes.operations.map(o => ({ type: o.type, table: o.table, id: o.id,
      ...(o.type === 'add' ? {} : { before: o.before }), ...(o.type === 'delete' ? {} : { after: o.after }) })) };
}
