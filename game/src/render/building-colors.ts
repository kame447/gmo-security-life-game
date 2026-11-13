import type { ObjectDef } from '../core/types';

const HOUSE_ROOFS = ['#56718a', '#99705c', '#656d71', '#61796a', '#8d7d91'];

/** The roof, or main upper surface of a flat-roofed building, used by both renderers. */
export function buildingRepresentativeColor(object: Pick<ObjectDef, 'kind' | 'style'>): string | undefined {
  switch (object.kind) {
    case 'house': return HOUSE_ROOFS[(Number(object.style) || 0) % 5];
    case 'apartment': return '#b5bec0';
    case 'shop':
      switch (object.style) {
        case 'bakery': return '#a27855';
        case 'cafe': return '#64776a';
        case 'bookstore': return '#6f7779';
        default: return '#c7c9bd';
      }
    case 'school': return '#c2cbcb';
    case 'gym': return '#6b8c9f';
    case 'station': return '#607f98';
    case 'gazebo': return '#a37a52';
    default: return undefined;
  }
}
