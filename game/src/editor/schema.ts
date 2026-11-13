import { T, isSolidGround } from '../world/tiles.ts';
import { assembleEditorWorld } from './runtime.ts';
import { EDITOR_TABLES, EditorValidationError, type EditorDocument, type EditorEntity, type EditorTable, type ValidationIssue } from './types.ts';

type Check = (value: unknown, path: string, issues: ValidationIssue[]) => void;
type Fields = Record<string, Check>;
const issue = (issues: ValidationIssue[], path: string, code: string, message: string) => { issues.push({ path, code, message }); };
export const fail = (path: string, code: string, message: string): never => { throw new EditorValidationError([{ path, code, message }]); };
const pattern = (regex: RegExp, description: string): Check => (v, p, e) => {
  if (typeof v !== 'string' || !regex.test(v)) issue(e, p, 'format', description);
};
export const idCheck = pattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Expected a stable lowercase kebab-case ID');
const eventKey = pattern(/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/, 'Expected a lowercase event key (dot/kebab segments)');
const text: Check = (v, p, e) => { if (typeof v !== 'string' || !v.trim()) issue(e, p, 'type', 'Expected non-empty text'); };
const boolean: Check = (v, p, e) => { if (typeof v !== 'boolean') issue(e, p, 'type', 'Expected boolean'); };
const integer = (min: number, max = 65536): Check => (v, p, e) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) issue(e, p, 'range', `Expected integer ${min}..${max}`);
};
const literal = (...values: unknown[]): Check => (v, p, e) => { if (!values.includes(v)) issue(e, p, 'value', `Expected ${values.join(' | ')}`); };
const optional = (check: Check): Check => (v, p, e) => { if (v !== undefined) check(v, p, e); };
const array = (check: Check, max = 10000): Check => (v, p, e) => {
  if (!Array.isArray(v) || v.length > max) { issue(e, p, 'type', `Expected array of at most ${max} items`); return; }
  for (let n = 0; n < v.length; n++) check(v[n], `${p}[${n}]`, e);
};
export const shape = (fields: Fields): Check => (v, p, e) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) {
    issue(e, p, 'type', 'Expected plain JSON object'); return;
  }
  const object = v as Record<string, unknown>;
  for (const key of Object.keys(object)) if (!Object.hasOwn(fields, key)) issue(e, `${p}.${key}`, 'unknown-field', 'Unknown field');
  for (const [key, check] of Object.entries(fields)) check(Object.hasOwn(object, key) ? object[key] : undefined, `${p}.${key}`, e);
};
const position = { x: integer(0), y: integer(0) };
const facing = literal('up', 'down', 'left', 'right');
const facilityId = optional(idCheck);
const entityChecks: Record<EditorTable, Check> = {
  areas: shape({ id: idCheck, name: text, kind: literal('outdoor', 'indoor'), width: integer(1, 256), height: integer(1, 256), ground: array(literal(...Object.values(T)), 65536) }),
  facilities: shape({ id: idCheck, name: text, areaId: idCheck, interior: literal('full', 'interaction', 'background'), state: literal('open', 'closed') }),
  objects: shape({ id: idCheck, areaId: idCheck, kind: idCheck, ...position, w: integer(1, 256), h: integer(1, 256), solid: boolean,
    style: optional(idCheck), layer: optional(literal('decal', 'sorted')), facilityId }),
  interactions: shape({ id: idCheck, areaId: idCheck, kind: literal('npc', 'object', 'sign'), name: text, ...position,
    w: optional(integer(1, 256)), h: optional(integer(1, 256)), solid: boolean, sprite: optional(idCheck), facing: optional(facing),
    eventKey, lines: array(text, 100), objectId: optional(idCheck) }),
  portals: shape({ id: idCheck, areaId: idCheck, from: shape({ ...position, w: optional(integer(1, 256)) }),
    to: shape({ areaId: idCheck, ...position, facing }), facilityId, returnPortalId: optional(idCheck) }),
};
const documentCheck = shape({ schemaVersion: literal(1), id: idCheck, tileSize: literal(16),
  start: shape({ areaId: idCheck, ...position, facing }),
  catalogs: shape({ sprites: array(idCheck), eventKeys: array(eventKey) }),
  ...Object.fromEntries(EDITOR_TABLES.map(table => [table, array(entityChecks[table], table === 'areas' ? 64 : 10000)])),
});

export function checkEntity(table: EditorTable, value: unknown, path: string, issues: ValidationIssue[]): void {
  entityChecks[table](value, path, issues);
}

/** Canonical keys; array order is preserved (ground cells and dialogue lines are ordered). */
export function canonicalJSON(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sort(item)]));
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}
function normalize(document: EditorDocument): EditorDocument {
  const copy: EditorDocument = JSON.parse(canonicalJSON(document));
  for (const table of EDITOR_TABLES) copy[table].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  copy.catalogs.sprites.sort(); copy.catalogs.eventKeys.sort();
  return copy;
}
export function parseDocument(raw: unknown): EditorDocument {
  const issues = validateDocument(raw);
  if (issues.length) throw new EditorValidationError(issues);
  return normalize(raw as EditorDocument);
}
export const serializeDocument = (raw: unknown): string => canonicalJSON(parseDocument(raw));
export function loadDocument(json: string): EditorDocument {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return fail('$', 'json', 'Invalid JSON document'); }
  return parseDocument(raw);
}

export function validateDocument(raw: unknown): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  documentCheck(raw, '$', errors);
  if (errors.length) return errors;
  const d = raw as EditorDocument;
  const error = (path: string, code: string, message: string) => issue(errors, path, code, message);
  const ids = new Set<string>();
  for (const table of EDITOR_TABLES) for (const entity of d[table]) {
    if (ids.has(entity.id)) error(`${table}.${entity.id}`, 'duplicate-id', `Duplicate ID ${entity.id}`);
    ids.add(entity.id);
  }
  for (const [name, values] of Object.entries(d.catalogs)) if (new Set(values).size !== values.length) error(`catalogs.${name}`, 'duplicate-id', 'Duplicate catalog entry');
  const areas = new Map(d.areas.map(a => [a.id, a]));
  const facilities = new Map(d.facilities.map(f => [f.id, f]));
  let totalTiles = 0;
  for (const a of d.areas) {
    totalTiles += a.width * a.height;
    if (a.ground.length !== a.width * a.height) error(`areas.${a.id}.ground`, 'layer-size', 'Ground length must equal width * height');
  }
  if (totalTiles > 262144) error('areas', 'range', 'Prototype document limit is 262144 total tiles');
  const rect = (areaId: string, r: { x: number; y: number; w?: number; h?: number }, path: string) => {
    const a = areas.get(areaId);
    if (!a) error(path, 'reference', `Unknown area ${areaId}`);
    else if (r.x + (r.w ?? 1) > a.width || r.y + (r.h ?? 1) > a.height) error(path, 'bounds', 'Footprint is outside area');
  };
  for (const f of d.facilities) if (!areas.has(f.areaId)) error(`facilities.${f.id}.areaId`, 'reference', `Unknown area ${f.areaId}`);
  for (const table of ['objects', 'interactions'] as const) for (const entity of d[table]) rect(entity.areaId, entity, `${table}.${entity.id}`);
  for (const o of d.objects) if (o.facilityId) {
    if (facilities.get(o.facilityId)?.areaId !== o.areaId) error(`objects.${o.id}.facilityId`, 'reference', 'Facility must exist in the same area');
  }
  for (const i of d.interactions) {
    if (!d.catalogs.eventKeys.includes(i.eventKey)) error(`interactions.${i.id}.eventKey`, 'reference', `Unknown event key ${i.eventKey}`);
    if ((i.kind === 'npc' && !i.sprite) || (i.sprite && !d.catalogs.sprites.includes(i.sprite))) error(`interactions.${i.id}.sprite`, 'reference', 'NPC sprite must be declared in catalogs.sprites');
    if (i.kind === 'npc' && i.objectId) error(`interactions.${i.id}.objectId`, 'reference', 'NPC cannot share an object footprint');
    if (i.objectId) {
      const o = d.objects.find(o => o.id === i.objectId);
      if (!o || o.areaId !== i.areaId || o.x !== i.x || o.y !== i.y || o.w !== (i.w ?? 1) || o.h !== (i.h ?? 1)) error(`interactions.${i.id}.objectId`, 'reference', 'Linked object must match area and footprint');
    }
  }
  for (const p of d.portals) {
    rect(p.areaId, p.from, `portals.${p.id}.from`);
    rect(p.to.areaId, p.to, `portals.${p.id}.to`);
    if (p.facilityId) {
      const f = facilities.get(p.facilityId);
      if (!f || (f.areaId !== p.areaId && f.areaId !== p.to.areaId)) error(`portals.${p.id}.facilityId`, 'reference', 'Facility must belong to a connected area');
      else if (f.state === 'closed') error(`portals.${p.id}.facilityId`, 'reference', 'Closed facility cannot have an active portal');
    }
    if (p.returnPortalId) {
      const back = d.portals.find(q => q.id === p.returnPortalId);
      if (!back || back.id === p.id || back.areaId !== p.to.areaId || back.to.areaId !== p.areaId || back.returnPortalId !== p.id || back.facilityId !== p.facilityId) error(`portals.${p.id}.returnPortalId`, 'portal-pair', 'Reciprocal portal area/facility references do not match');
    }
  }
  rect(d.start.areaId, d.start, 'start');
  if (errors.length) return errors;

  type Footprint = { x: number; y: number; w?: number; h?: number };
  const cells = (r: Footprint, width: number): number[] => {
    const indices: number[] = [];
    for (let y = r.y; y < r.y + (r.h ?? 1); y++) for (let x = r.x; x < r.x + (r.w ?? 1); x++) indices.push(y * width + x);
    return indices;
  };
  for (const a of d.areas) {
    const solids = new Map<number, string>(), interactions = new Set<number>(), portals = new Set<number>();
    for (const o of d.objects.filter(o => o.areaId === a.id && o.solid)) for (const index of cells(o, a.width)) {
      if (solids.has(index) || isSolidGround(a.ground[index])) error(`objects.${o.id}`, 'overlap', 'Solid object overlaps terrain or another solid object');
      solids.set(index, o.id);
    }
    for (const i of d.interactions.filter(i => i.areaId === a.id)) for (const index of cells(i, a.width)) {
      if (interactions.has(index) || isSolidGround(a.ground[index]) || (solids.has(index) && solids.get(index) !== i.objectId)) error(`interactions.${i.id}`, 'overlap', 'Interaction overlaps terrain, a solid object, or another interaction');
      interactions.add(index);
    }
    for (const p of d.portals.filter(p => p.areaId === a.id)) for (const index of cells(p.from, a.width)) {
      if (portals.has(index) || interactions.has(index)) error(`portals.${p.id}`, 'overlap', 'Portal overlaps another portal or an interaction');
      portals.add(index);
    }
  }
  if (errors.length) return errors;
  const world = assembleEditorWorld(d);
  const walkable = (areaId: string, x: number, y: number) => {
    const a = world.areas.get(areaId)!;
    return x >= 0 && y >= 0 && x < a.width && y < a.height && a.solid[y * a.width + x] === 0;
  };
  const safeArrival = (areaId: string, x: number, y: number, path: string) => {
    const a = world.areas.get(areaId)!;
    if (!walkable(areaId, x, y) || a.portalAt.has(y * a.width + x)) error(path, 'arrival', 'Arrival must be walkable and outside portal triggers');
  };
  safeArrival(d.start.areaId, d.start.x, d.start.y, 'start');
  for (const p of d.portals) safeArrival(p.to.areaId, p.to.x, p.to.y, `portals.${p.id}.to`);
  if (errors.length) return errors;
  const reached = new Map(d.areas.map(a => [a.id, new Set<number>()]));
  const queue: { areaId: string; x: number; y: number }[] = [];
  const visit = (areaId: string, x: number, y: number) => {
    const a = world.areas.get(areaId)!;
    if (!walkable(areaId, x, y)) return;
    const index = y * a.width + x, seen = reached.get(areaId)!;
    if (!seen.has(index)) { seen.add(index); queue.push({ areaId, x, y }); }
  };
  visit(d.start.areaId, d.start.x, d.start.y);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], a = world.areas.get(p.areaId)!;
    visit(p.areaId, p.x - 1, p.y); visit(p.areaId, p.x + 1, p.y); visit(p.areaId, p.x, p.y - 1); visit(p.areaId, p.x, p.y + 1);
    const door = a.portalAt.get(p.y * a.width + p.x);
    if (door) visit(door.to.areaId, door.to.x, door.to.y);
  }
  for (const a of d.areas) if (!reached.get(a.id)!.size) error(`areas.${a.id}`, 'unreachable', 'Area is unreachable from start');
  for (const p of d.portals) if (!cells(p.from, areas.get(p.areaId)!.width).some(index => reached.get(p.areaId)!.has(index))) error(`portals.${p.id}`, 'unreachable', 'Portal is unreachable from start');
  for (const i of d.interactions) {
    const a = areas.get(i.areaId)!;
    const accessible = cells(i, a.width).some(index => {
      const x = index % a.width, y = Math.floor(index / a.width);
      return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => nx >= 0 && nx < a.width && ny >= 0 && ny < a.height && reached.get(a.id)!.has(ny * a.width + nx));
    });
    if (!accessible) error(`interactions.${i.id}`, 'unreachable', 'Interaction cannot be approached from start');
  }
  return errors;
}

export function locationless(entity: EditorEntity, table: EditorTable): unknown {
  if (table === 'objects' || table === 'interactions') {
    const { areaId: _, x: __, y: ___, ...rest } = entity as EditorDocument['objects'][number];
    return rest;
  }
  if (table === 'portals') {
    const { areaId: _, from, ...rest } = entity as EditorDocument['portals'][number];
    const { x: __, y: ___, ...size } = from;
    return { ...rest, from: size };
  }
  return entity;
}
