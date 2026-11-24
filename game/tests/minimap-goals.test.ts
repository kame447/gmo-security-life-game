import { describe, expect, it } from 'vitest';
import { layoutGoalMarks } from '../src/minimap/goals';
import type { FacilityMarker } from '../src/minimap/model';

const markers: FacilityMarker[] = [
  { id: 'school', name: 'がっこう', kind: 'school', x: 10, y: 10 },
  { id: 'park', name: 'こうえん', kind: 'park', x: 100, y: 10 },
  { id: 'station', name: 'えき', kind: 'station', x: 20, y: 20 },
  { id: 'shop-cafe', name: 'きっさてん', kind: 'cafe', x: 30, y: 30 },
];
const projection = { scale: 2, left: 0, top: 0 };

describe('minimap goal marks', () => {
  it('shows nothing without goals', () => {
    expect(layoutGoalMarks(markers, undefined, projection, 100, 100, 10)).toEqual([]);
  });

  it('marks pending and done facilities and ignores the rest', () => {
    const marks = layoutGoalMarks(markers, { pending: ['school'], done: ['station'] }, projection, 100, 100, 10);
    expect(marks).toEqual([
      { id: 'school', state: 'pending', x: 20, y: 20, clamped: false },
      { id: 'station', state: 'done', x: 40, y: 40, clamped: false },
    ]);
  });

  it('pins an off-screen pending goal to the edge and hides an off-screen done goal', () => {
    const marks = layoutGoalMarks(markers, { pending: ['park'], done: ['school', 'shop-cafe'] }, { scale: 2, left: -30, top: 0 }, 100, 100, 10);
    expect(marks.find(m => m.id === 'park')).toEqual({ id: 'park', state: 'pending', x: 90, y: 20, clamped: true });
    expect(marks.find(m => m.id === 'school')).toBeUndefined();
    expect(marks.find(m => m.id === 'shop-cafe')).toMatchObject({ state: 'done', x: 30, y: 60 });
  });

  it('prefers pending when a facility is listed in both', () => {
    const marks = layoutGoalMarks(markers, { pending: ['school'], done: ['school'] }, projection, 100, 100, 10);
    expect(marks).toEqual([{ id: 'school', state: 'pending', x: 20, y: 20, clamped: false }]);
  });
});
