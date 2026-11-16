import type { AreaDef } from '../../core/types';
import { canonicalJSON, checkEntity, furnitureDefinitionIssue } from '../../editor/schema';
import { EditorValidationError, type EditorInteraction, type EditorObject, type ValidationIssue } from '../../editor/types';
import { fingerprint } from './hash';

export interface AreaLayout {
  schemaVersion: 1;
  areaId: string;
  source: { generator: string; fingerprint: string };
  area: { name: string; kind: 'indoor' | 'outdoor'; width: number; height: number; ground: number[];
    surfaces?: { palette: string[]; cells: number[] } };
  objects: Omit<EditorObject, 'areaId'>[];
  interactions: Omit<EditorInteraction, 'areaId'>[];
  portals: AreaDef['portals'];
}
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i] === undefined ? null : a[i], b[i] === undefined ? null : b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const pa = Object.getPrototypeOf(a), pb = Object.getPrototypeOf(b);
  if ((pa !== Object.prototype && pa !== null) || (pb !== Object.prototype && pb !== null)) {
    return canonicalJSON(a) === canonicalJSON(b);
  }
  const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>;
  let countA = 0, countB = 0;
  for (const k of Object.keys(ob)) if (ob[k] !== undefined) countB++;
  for (const k of Object.keys(oa)) {
    if (oa[k] === undefined) continue;
    countA++;
    if (!Object.hasOwn(ob, k) || ob[k] === undefined || !deepEqual(oa[k], ob[k])) return false;
  }
  return countA === countB;
}
export const equal = (a: unknown, b: unknown) => deepEqual(a, b);
export function plainArea(def: AreaDef): unknown {
  return { ...def, ground: Array.from(def.ground), ...(def.surfaces ? {
    surfaces: { palette: [...def.surfaces.palette], cells: Array.from(def.surfaces.cells) } } : {}) };
}
export const areaFingerprint = (def: AreaDef) => fingerprint(plainArea(def));

/** First import only: bind exact source footprints, never display-only reference IDs. */
export function initialLayout(def: AreaDef, generator: string): AreaLayout {
  const interactions = def.interactions.map(i => {
    const matches = i.kind !== 'npc' ? def.objects.filter(o => o.id && o.x === i.x && o.y === i.y && o.w === (i.w ?? 1) && o.h === (i.h ?? 1)) : [];
    if (matches.length > 1) throw new Error(`Ambiguous linked object: ${i.id}`);
    return { ...structuredClone(i), ...(matches.length ? { objectId: matches[0].id } : {}) };
  });
  return { schemaVersion: 1, areaId: def.id, source: { generator, fingerprint: areaFingerprint(def) },
    area: { name: def.name, kind: def.kind, width: def.width, height: def.height, ground: Array.from(def.ground),
      ...(def.surfaces ? { surfaces: { palette: [...def.surfaces.palette], cells: Array.from(def.surfaces.cells) } } : {}) },
    objects: structuredClone(def.objects) as AreaLayout['objects'], interactions, portals: structuredClone(def.portals) };
}
export function parseAreaLayout(raw: unknown, generated: AreaDef): AreaLayout {
  const errors: ValidationIssue[] = [];
  const fail = (path: string, message: string) => errors.push({ path, code: 'layout', message });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid area layout');
  const l = raw as AreaLayout;
  if (Object.keys(l).sort().join() !== ['schemaVersion','areaId','source','area','objects','interactions','portals'].sort().join()) fail('$','Unknown layout field');
  if (l.schemaVersion !== 1 || l.areaId !== generated.id || !l.source ||
      typeof l.source.generator !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(l.source.fingerprint)) fail('$','Invalid layout identity or source');
  if (!l.area || l.area.width !== generated.width || l.area.height !== generated.height ||
      l.area.kind !== generated.kind || l.area.name !== generated.name) fail('area','Area identity and dimensions are fixed');
  if (errors.length) throw new EditorValidationError(errors);
  checkEntity('areas', { ...l.area, id: l.areaId }, 'area', errors);
  for (const table of ['objects','interactions','portals'] as const) {
    if (!Array.isArray(l[table]) || l[table].length > 10000) { fail(table,'Expected an array'); continue; }
    for (const item of l[table]) checkEntity(table, { ...item, areaId: l.areaId }, table, errors);
  }
  if (errors.length) throw new EditorValidationError(errors);
  if (l.area.ground.length !== l.area.width*l.area.height) fail('area.ground','Ground length must match area dimensions');
  if (l.area.surfaces && (l.area.surfaces.cells.length !== l.area.width*l.area.height || l.area.surfaces.cells.some(n=>n>l.area.surfaces!.palette.length))) fail('area.surfaces','Invalid surface layer dimensions or palette index');
  for (const o of l.objects) {
    const problem=furnitureDefinitionIssue(o);if(problem)fail(`objects.${o.id}`,problem);
    if (o.x+o.w>l.area.width || o.y+o.h>l.area.height) fail(`objects.${o.id}`,'Furniture footprint is outside the area');
  }
  if (errors.length) throw new EditorValidationError(errors);
  return structuredClone(l);
}
export function layoutArea(layout: AreaLayout, generated: AreaDef): AreaDef {
  const l = parseAreaLayout(layout, generated);
  const { surfaces, ...area } = l.area, { surfaces: _, ...base } = generated;
  return { ...base, ...area, ground: Uint8Array.from(l.area.ground),
    ...(surfaces ? { surfaces: { palette: [...surfaces.palette], cells: Uint8Array.from(surfaces.cells) } } : {}),
    objects: structuredClone(l.objects),
    interactions: l.interactions.map(({ objectId: _, ...i }) => structuredClone(i)), portals: structuredClone(l.portals) };
}
