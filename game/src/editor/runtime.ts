import type { AreaDef } from '../core/types.ts';
import type { AreaRuntime, World } from '../world/index.ts';
import { isSolidGround } from '../world/tiles.ts';
import type { EditorDocument } from './types.ts';

/** Internal: callers use buildEditorWorld() so untrusted input is validated first. */
export function assembleEditorWorld(document: EditorDocument): World {
  const areas = new Map<string, AreaRuntime>();
  for (const area of document.areas) {
    const def: AreaDef = {
      ...area, ...(area.districts ? { districts: area.districts.map(district => ({ ...district })) } : {}),
      ground: Uint8Array.from(area.ground),
      objects: document.objects.filter(o => o.areaId === area.id).map(({ areaId: _, ...o }) => ({ ...o })),
      interactions: document.interactions.filter(i => i.areaId === area.id).map(({ areaId: _, objectId: __, ...i }) => ({ ...i, lines: [...i.lines] })),
      portals: document.portals.filter(p => p.areaId === area.id).map(({ areaId: _, returnPortalId: __, ...p }) => ({ ...p, from: { ...p.from }, to: { ...p.to } })),
    };
    const runtime: AreaRuntime = { def, width: def.width, height: def.height, ground: def.ground,
      solid: Uint8Array.from(def.ground, t => isSolidGround(t) ? 1 : 0),
      objects: def.objects, interactions: def.interactions, portalAt: new Map(), interactionAt: new Map() };
    const occupy = (r: { x: number; y: number; w?: number; h?: number }, fn: (index: number) => void) => {
      for (let y = r.y; y < r.y + (r.h ?? 1); y++) for (let x = r.x; x < r.x + (r.w ?? 1); x++) fn(y * def.width + x);
    };
    for (const o of def.objects) if (o.solid) occupy(o, index => { runtime.solid[index] = 1; });
    for (const i of def.interactions) occupy(i, index => {
      runtime.interactionAt.set(index, i);
      if (i.solid) runtime.solid[index] = 1;
    });
    // Match the current exploration engine: active doors carve their source footprints last.
    for (const p of def.portals) occupy(p.from, index => { runtime.portalAt.set(index, p); runtime.solid[index] = 0; });
    areas.set(area.id, runtime);
  }
  return { areas, facilities: new Map(document.facilities.map(f => [f.id, { ...f }])),
    start: { ...document.start }, variant: document.variant ? structuredClone(document.variant) : { id: document.id, stage: 'childhood' } };
}
