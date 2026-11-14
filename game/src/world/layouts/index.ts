import type { AreaDef } from '../../core/types';
import { areaFingerprint, layoutArea, type AreaLayout } from './codec';

export const AREA_LAYOUTS = Object.values(import.meta.glob('../../../data/world/areas/*.json',
  { eager: true, import: 'default' })) as AreaLayout[];
export const areaLayout = (id: string) => AREA_LAYOUTS.find(l => l.areaId === id);
export function applyAreaLayout(generated: AreaDef): AreaDef {
  const layout = areaLayout(generated.id);
  return layout ? layoutArea(layout, generated) : generated;
}
export function staleLayouts(generated: readonly AreaDef[]): string[] {
  return AREA_LAYOUTS.filter(layout => {
    const source = generated.find(area => area.id === layout.areaId);
    return !source || areaFingerprint(source) !== layout.source.fingerprint;
  }).map(layout => layout.areaId);
}
