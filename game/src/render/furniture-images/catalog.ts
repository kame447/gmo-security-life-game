/// <reference types="vite/client" />
import type { ObjectDef } from '../../core/types';
import { TILE } from '../../core/coords';

export interface FurnitureAsset {
  readonly id: string;
  /** Relative to assets/images/objects/props/interiors/. */
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

/** Only supplied PNG assets are bound. The rebuilt konbini uses procedural, rotated store furnishings. */
export const FURNITURE_ASSETS: readonly FurnitureAsset[] = [
  { id: 'school-student-desk', file: 'school/student-desk.png', width: 16, height: 16 },
  { id: 'school-teacher-desk', file: 'school/teacher-desk.png', width: 32, height: 16 },
  { id: 'school-shelf', file: 'school/classroom-shelf.png', width: 32, height: 16 },
  { id: 'school-blackboard', file: 'school/blackboard.png', width: 128, height: 16 },
  { id: 'school-window', file: 'school/window.png', width: 32, height: 16 },
];

const school = 'school-classroom-interior';
export const FURNITURE_BINDINGS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries([
  ...[2, 5, 8, 11, 14].flatMap(x => [4, 6, 8].map(y => [`${school}-sdesk-${x}-${y}`, 'school-student-desk'])),
  [`${school}-tdesk-8-2`, 'school-teacher-desk'],
  ...[1, 14].map(x => [`${school}-shelf-${x}-10`, 'school-shelf']),
  [`${school}-blackboard-5-0`, 'school-blackboard'],
  ...[2, 14].map(x => [`${school}-window-${x}-0`, 'school-window']),
]));

// Four levels up from this module reaches the repository, not Vite's game/ root.
// A literal relative glob may import outside root; absent files produce an empty map.
const prefix = '../../../../assets/images/objects/props/interiors/';
export const FURNITURE_URLS: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  Object.entries(import.meta.glob<string>('../../../../assets/images/objects/props/interiors/**/*.png', {
    query: '?url&no-inline', import: 'default', eager: true,
  })).map(([file, url]) => [file.slice(prefix.length), url]),
));

export function furnitureAsset(object: Pick<ObjectDef, 'id' | 'w' | 'h'>): FurnitureAsset | undefined {
  if (!object.id) return undefined;
  const asset = FURNITURE_ASSETS.find(a => a.id === FURNITURE_BINDINGS[object.id!]);
  // Never stretch artwork or let a stale binding change its rendered bounds.
  return asset?.width === object.w * TILE && asset.height === object.h * TILE ? asset : undefined;
}
