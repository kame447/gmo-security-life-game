import { describe, expect, it } from 'vitest';
import { layoutFacilityIcons, layoutFacilityLabels, type FacilityLabel, type LabelBox } from '../src/minimap/markers';
import { buildAreaMap, fitProjection, localProjection, projectPoint, type FacilityMarker, type MapPoint } from '../src/minimap/model';
import { buildWorld, LANDMARKS } from '../src/world';

const overlaps = (a: LabelBox, b: LabelBox, gap = 0) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

// Independent edge-intersection check, including the painted leader's stroke.
const touchesLine = (a: MapPoint, b: MapPoint, raw: LabelBox, margin = 2) => {
  const box = { x: raw.x - margin, y: raw.y - margin, width: raw.width + 2 * margin, height: raw.height + 2 * margin };
  const inside = (p: MapPoint) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
  if (inside(a) || inside(b)) return true;
  const corners = [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }];
  const orient = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return corners.some((c, i) => {
    const d = corners[(i + 1) % corners.length];
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) &&
      orient(a, b, c) * orient(a, b, d) <= 0 && orient(c, d, a) * orient(c, d, b) <= 0;
  });
};

const properlyCross = (a: FacilityLabel, b: FacilityLabel) => {
  const orient = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return orient(a.anchor, a.end, b.anchor) * orient(a.anchor, a.end, b.end) < 0 &&
    orient(b.anchor, b.end, a.anchor) * orient(b.anchor, b.end, a.end) < 0;
};

describe('provisional facility display priority', () => {
  const projection = { left: 0, top: 0, scale: 1 };
  const markers: FacilityMarker[] = [
    { id: 'near-left', name: '左', kind: 'bookstore', x: 80, y: 50 },
    { id: 'near-right', name: '右', kind: 'bakery', x: 88, y: 50 },
    { id: 'separate', name: '別', kind: 'park', x: 140, y: 90 },
    { id: 'offscreen', name: '外', kind: 'home', x: -4, y: 30 },
  ];

  it('gives the current location and then closer facilities priority without moving their anchors', () => {
    const leftPlayer = { x: 20, y: 50 }, rightPlayer = { x: 180, y: 50 };
    const left = layoutFacilityIcons(markers, projection, 200, 128, leftPlayer, 2, 8);
    const right = layoutFacilityIcons(markers, projection, 200, 128, rightPlayer, 2, 8);
    expect(left.map(icon => icon.marker.id)).toContain('near-left');
    expect(left.map(icon => icon.marker.id)).not.toContain('near-right');
    expect(right.map(icon => icon.marker.id)).toContain('near-right');
    expect(right.map(icon => icon.marker.id)).not.toContain('near-left');
    expect(left.map(icon => icon.marker.id)).not.toContain('offscreen');
    expect(left.find(icon => icon.marker.id === 'near-left')!.anchor).toEqual({ x: 80, y: 50 });
    expect(layoutFacilityIcons([...markers].reverse(), projection, 200, 128, leftPlayer, 2, 8)).toEqual(left);
    for (const icon of left) {
      expect(icon.x).toBeGreaterThanOrEqual(0); expect(icon.y).toBeGreaterThanOrEqual(0);
      expect(icon.x + icon.width).toBeLessThanOrEqual(200); expect(icon.y + icon.height).toBeLessThanOrEqual(128);
      expect(overlaps(icon, { x: leftPlayer.x - 10, y: leftPlayer.y - 10, width: 20, height: 20 })).toBe(false);
      for (const other of left) if (icon !== other) expect(overlaps(icon, other, 3)).toBe(false);
    }
  });

  it('breaks equal-distance ties by stable ID and leaves the player marker unobstructed', () => {
    const tied: FacilityMarker[] = [
      { id: 'b', name: 'B', kind: 'cafe', x: 90, y: 50 },
      { id: 'a', name: 'A', kind: 'cafe', x: 110, y: 50 },
      { id: 'player', name: 'P', kind: 'home', x: 100, y: 10 },
    ];
    const result = layoutFacilityIcons(tied, projection, 200, 128, { x: 100, y: 10 }, 2, 8);
    expect(result.map(icon => icon.marker.id)).toEqual(['a']);
  });

  it.each([[900, 562, 12], [340, 470, 9], [794, 260, 10]])('keeps names and their leaders clear at every landmark on %i×%i', (width, height, expectedMinimum) => {
    const world = buildWorld(), area = world.areas.get('town-main')!;
    const map = buildAreaMap(area, world.facilities.values());
    const projection = fitProjection(map.width, map.height, width, height, 18);
    let minimum = Infinity;
    for (const landmark of Object.values(LANDMARKS)) {
      const player = projectPoint(projection, { x: landmark.x + .5, y: landmark.y + .5 });
      const iconPixel = projection.scale >= 4 ? 2 : 1, playerRadius = width >= 600 ? 15 : 8;
      const icons = layoutFacilityIcons(map.markers, projection, width, height, player, iconPixel, playerRadius);
      const labels = layoutFacilityLabels(map.markers, projection, width, height, text => text.length * 13, player,
        { mapWidth: map.width, mapHeight: map.height, iconPixel, playerRadius, icons });
      minimum = Math.min(minimum, labels.length);
      const playerBox = { x: player.x - playerRadius - 2, y: player.y - playerRadius - 2, width: 2 * playerRadius + 4, height: 2 * playerRadius + 4 };
      expect(labels.length).toBeGreaterThan(0);
      expect(new Set(labels.map(label => label.marker.id)).size).toBe(labels.length);
      for (const label of labels) {
        expect(label.x).toBeGreaterThanOrEqual(0); expect(label.y).toBeGreaterThanOrEqual(0);
        expect(label.x + label.width).toBeLessThanOrEqual(width); expect(label.y + label.height).toBeLessThanOrEqual(height);
        expect(label.anchor).toEqual(projectPoint(projection, label.marker));
        expect(touchesLine(label.anchor, label.end, playerBox)).toBe(false);
        for (const icon of icons) {
          expect(overlaps(label, icon, 3)).toBe(false);
          if (icon.marker.id !== label.marker.id) expect(touchesLine(label.anchor, label.end, icon)).toBe(false);
        }
        for (const other of labels) if (label !== other) {
          expect(overlaps(label, other, 3)).toBe(false);
          expect(touchesLine(label.anchor, label.end, other)).toBe(false);
          expect(properlyCross(label, other)).toBe(false);
        }
      }
    }
    expect(minimum).toBe(expectedMinimum);
  });

  it.each([
    [900, 562, []],
    [340, 470, ['school-gym', 'shop-candy']],
    [794, 260, ['shop-candy', 'shop-konbini']],
  ])('documents the exact labels omitted at the shopping street on %i×%i', (width, height, omitted) => {
    const world = buildWorld(), map = buildAreaMap(world.areas.get('town-main')!, world.facilities.values());
    const projection = fitProjection(map.width, map.height, width, height, 18);
    const player = projectPoint(projection, { x: LANDMARKS.shoppingStreet.x + .5, y: LANDMARKS.shoppingStreet.y + .625 });
    const iconPixel = projection.scale >= 4 ? 2 : 1, playerRadius = width >= 600 ? 15 : 8;
    const icons = layoutFacilityIcons(map.markers, projection, width, height, player, iconPixel, playerRadius);
    const labels = layoutFacilityLabels(map.markers, projection, width, height, text => text.length * 13, player,
      { mapWidth: map.width, mapHeight: map.height, iconPixel, playerRadius, icons });
    expect(map.markers.filter(marker => !labels.some(label => label.marker.id === marker.id)).map(marker => marker.id).sort()).toEqual(omitted);
  });

  it('omits a name when its true anchor is covered by the player, instead of drawing a misleading leader', () => {
    const crowded: FacilityMarker[] = [
      { id: 'covered', name: '隠れた店', kind: 'cafe', x: 100, y: 50 },
      { id: 'visible', name: '見える店', kind: 'bakery', x: 160, y: 50 },
    ];
    const labels = layoutFacilityLabels(crowded, projection, 240, 140, () => 52, { x: 100, y: 50 },
      { mapWidth: 240, mapHeight: 140, iconPixel: 2, playerRadius: 15 });
    expect(labels.map(label => label.marker.id)).toEqual(['visible']);
  });

  it('uses the full-map margin on portrait screens and omits lower-priority names only if no space remains', () => {
    const world = buildWorld(), area = world.areas.get('town-main')!;
    const map = buildAreaMap(area, world.facilities.values());
    const projection = fitProjection(map.width, map.height, 338, 470, 18);
    const player = projectPoint(projection, LANDMARKS.shoppingStreet);
    const labels = layoutFacilityLabels(map.markers, projection, 338, 470, text => text.length * 13, player,
      { mapWidth: map.width, mapHeight: map.height, iconPixel: 1, playerRadius: 8 });
    const mapRect = { x: projection.left, y: projection.top, width: map.width * projection.scale, height: map.height * projection.scale };
    expect(labels.filter(label => !overlaps(label, mapRect)).length).toBeGreaterThanOrEqual(6);
    const dense: FacilityMarker[] = Array.from({ length: 8 }, (_, i) => ({ id: `facility-${i}`, name: '施設', kind: 'facility', x: 20 + i * 4, y: 20 }));
    const small = layoutFacilityLabels(dense, projection, 100, 60, () => 26, { x: 50, y: 30 });
    expect(small.length).toBeLessThan(dense.length);
    expect(layoutFacilityLabels([...dense].reverse(), projection, 100, 60, () => 26, { x: 50, y: 30 })).toEqual(small);
  });

  it('keeps the nearer name when the canvas has room for only one', () => {
    const crowded: FacilityMarker[] = [
      { id: 'far', name: '遠い', kind: 'cafe', x: 75, y: -100 },
      { id: 'near', name: '近い', kind: 'bakery', x: 25, y: -100 },
    ];
    const labels = layoutFacilityLabels(crowded, projection, 110, 40, () => 58, { x: 0, y: -150 });
    expect(labels.map(label => label.marker.id)).toEqual(['near']);
    expect(layoutFacilityLabels([...crowded].reverse(), projection, 110, 40, () => 58, { x: 0, y: -150 })).toEqual(labels);
  });

  it('uses the same spacing policy for the local projection without inventing markers', () => {
    const world = buildWorld(), area = world.areas.get('town-main')!;
    const map = buildAreaMap(area, world.facilities.values()), player = { x: 47.5, y: 53.5 };
    const projection = localProjection(map.width, map.height, 192, 128, player);
    const icons = layoutFacilityIcons(map.markers, projection, 192, 128, projectPoint(projection, player), 2, 8);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every(icon => map.markers.some(marker => marker.id === icon.marker.id))).toBe(true);
    for (const icon of icons) for (const other of icons) if (icon !== other) expect(overlaps(icon, other, 3)).toBe(false);
  });
});
