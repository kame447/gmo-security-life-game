import type { FacilityMarker, MapPoint, MapProjection } from './model';
import { projectPoint } from './model';

/** Original 9×9 pictograms: house, school, train, tree and each shop's goods. */
const ICONS: Record<FacilityMarker['kind'], readonly string[]> = {
  home: ['000010000', '000111000', '001111100', '011111110', '110000011', '010000010', '010110010', '010110010', '011111110'],
  school: ['000010000', '000011100', '000010000', '011111110', '010010010', '011111110', '010010010', '010111010', '011111110'],
  gym: ['000000000', '010000010', '110000011', '110000011', '111111111', '110000011', '110000011', '010000010', '000000000'],
  station: ['001111100', '010000010', '011111110', '010010010', '011111110', '010000010', '011111110', '001000100', '010000010'],
  park: ['000010000', '000111000', '001111100', '000111000', '001111100', '011111110', '000010000', '000010000', '000111000'],
  greengrocer: ['000001100', '000011000', '001010100', '011111110', '111111111', '111111111', '011111110', '011111110', '001101100'],
  bookstore: ['011000110', '100101001', '100010001', '100010001', '100010001', '100010001', '100010001', '111010111', '000111000'],
  candy: ['000000000', '100000001', '110111011', '111111111', '111111111', '110111011', '100000001', '000000000', '000000000'],
  konbini: ['111111111', '100000001', '111111111', '101010101', '000000000', '011111110', '010110010', '010110010', '011111110'],
  bakery: ['001111100', '011010110', '110101011', '100000001', '100000001', '010000010', '010000010', '010000010', '011111110'],
  cafe: ['000000000', '111111100', '100000111', '100000101', '100000111', '100000100', '011111000', '000000000', '111111110'],
  pharmacy: ['000111000', '000111000', '000111000', '111111111', '111111111', '111111111', '000111000', '000111000', '000111000'],
  facility: ['000010000', '000111000', '001101100', '011000110', '110010011', '011000110', '001101100', '000111000', '000010000'],
};

export function drawFacilityIcon(context: CanvasRenderingContext2D, marker: FacilityMarker, point: MapPoint, pixel: number): void {
  const size = 9 * pixel;
  const x = Math.round(point.x - size / 2), y = Math.round(point.y - size / 2);
  context.fillStyle = '#fff9e9';
  context.fillRect(x - 2, y - 2, size + 4, size + 4);
  context.strokeStyle = '#243034'; context.lineWidth = 1;
  context.strokeRect(x - 2.5, y - 2.5, size + 5, size + 5);
  context.fillStyle = '#243034';
  ICONS[marker.kind].forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) if (row[xx] === '1') context.fillRect(x + xx * pixel, y + yy * pixel, pixel, pixel);
  });
}

export interface LabelBox { x: number; y: number; width: number; height: number }
export interface FacilityLabel extends LabelBox { marker: FacilityMarker; anchor: MapPoint; start: MapPoint; end: MapPoint }
export interface FacilityIcon extends LabelBox { marker: FacilityMarker; anchor: MapPoint }
export interface LabelLayoutOptions { mapWidth: number; mapHeight: number; iconPixel: number; playerRadius: number; icons?: readonly FacilityIcon[] }

// Provisional spacing in canvas pixels; labels and icons can be adjusted after visual review.
const overlaps = (a: LabelBox, b: LabelBox): boolean =>
  a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;

/** Include the three-pixel leader stroke when checking a line against a rectangle. */
function lineMeetsBox(start: MapPoint, end: MapPoint, box: LabelBox): boolean {
  const margin = 2, dx = end.x - start.x, dy = end.y - start.y;
  let first = 0, last = 1;
  for (const [direction, distance] of [
    [-dx, start.x - (box.x - margin)], [dx, box.x + box.width + margin - start.x],
    [-dy, start.y - (box.y - margin)], [dy, box.y + box.height + margin - start.y],
  ]) {
    if (direction === 0) { if (distance < 0) return false; continue; }
    const ratio = distance / direction;
    if (direction < 0) first = Math.max(first, ratio); else last = Math.min(last, ratio);
    if (first > last) return false;
  }
  return true;
}

/** A facility hidden by the player points to the edge, never underneath the player. */
function leaderStart(anchor: MapPoint, end: MapPoint, player: LabelBox): MapPoint {
  const margin = 2;
  const left = player.x - margin, right = player.x + player.width + margin;
  const top = player.y - margin, bottom = player.y + player.height + margin;
  if (anchor.x < left || anchor.x > right || anchor.y < top || anchor.y > bottom) return anchor;
  const dx = end.x - anchor.x, dy = end.y - anchor.y;
  const tx = dx > 0 ? (right - anchor.x) / dx : dx < 0 ? (left - anchor.x) / dx : Infinity;
  const ty = dy > 0 ? (bottom - anchor.y) / dy : dy < 0 ? (top - anchor.y) / dy : Infinity;
  const t = Math.min(tx, ty) + .1 / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: anchor.x + dx * t, y: anchor.y + dy * t };
}

function linesCross(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
  const orientation = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  const [abC, abD, cdA, cdB] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  if (abC === 0 && onSegment(a, b, c) || abD === 0 && onSegment(a, b, d) ||
      cdA === 0 && onSegment(c, d, a) || cdB === 0 && onSegment(c, d, b)) return true;
  return abC * abD < 0 && cdA * cdB < 0;
}

function iconBox(anchor: MapPoint, pixel: number): LabelBox {
  const size = 9 * pixel;
  // Includes the half-pixel border and its one-pixel stroke in drawFacilityIcon.
  return { x: Math.round(anchor.x - size / 2) - 3, y: Math.round(anchor.y - size / 2) - 3, width: size + 6, height: size + 6 };
}

function orderedMarkers(markers: readonly FacilityMarker[], projection: MapProjection, player: MapPoint) {
  return markers.map(marker => ({ marker, anchor: projectPoint(projection, marker) })).sort((a, b) => {
    const distance = (a.anchor.x - player.x) ** 2 + (a.anchor.y - player.y) ** 2 -
      ((b.anchor.x - player.x) ** 2 + (b.anchor.y - player.y) ** 2);
    return distance || (a.marker.id < b.marker.id ? -1 : a.marker.id > b.marker.id ? 1 : 0);
  });
}

/** Keep true map positions: the player wins, then nearer icons, with ID as a stable tie-breaker. */
export function layoutFacilityIcons(markers: readonly FacilityMarker[], projection: MapProjection,
  width: number, height: number, player: MapPoint, pixel: number, playerRadius: number): FacilityIcon[] {
  const radius = playerRadius + 2;
  const occupied: LabelBox[] = [{ x: player.x - radius, y: player.y - radius, width: 2 * radius, height: 2 * radius }];
  const icons: FacilityIcon[] = [];
  for (const { marker, anchor } of orderedMarkers(markers, projection, player)) {
    const box = iconBox(anchor, pixel);
    if (box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height || occupied.some(other => overlaps(box, other))) continue;
    icons.push({ ...box, marker, anchor }); occupied.push(box);
  }
  return icons;
}

/** Names nearer the player are placed first; with options, use collision-safe leaders. */
export function layoutFacilityLabels(markers: readonly FacilityMarker[], projection: MapProjection,
  width: number, height: number, measure: (text: string) => number, player: MapPoint, options?: LabelLayoutOptions): FacilityLabel[] {
  const points = orderedMarkers(markers, projection, player);
  const radius = (options?.playerRadius ?? 15) + 2;
  const playerBox = { x: player.x - radius, y: player.y - radius, width: 2 * radius, height: 2 * radius };
  const icons = options?.icons ?? layoutFacilityIcons(markers, projection, width, height, player, options?.iconPixel ?? 2, options?.playerRadius ?? 15);
  const map = options && { x: projection.left, y: projection.top, width: options.mapWidth * projection.scale, height: options.mapHeight * projection.scale };
  const arrange = (ordered: typeof points, coverWeight: number, crossWeight: number, step: number) => {
    const occupied: LabelBox[] = [...points.map(({ anchor }) => iconBox(anchor, options?.iconPixel ?? 2)), playerBox];
    const labels: FacilityLabel[] = [];
    let crossings = 0, totalScore = 0;
    for (const { marker, anchor } of ordered) {
      const w = Math.ceil(measure(marker.name)) + 12, h = 23;
      const maxX = width - w - 5, maxY = height - h - 5;
      if (maxX < 5 || maxY < 5) continue;
      const clamp = (value: number, max: number) => Math.max(5, Math.min(max, value));
      const xs = new Set([5, maxX, clamp(anchor.x - w / 2, maxX), clamp(anchor.x + 15, maxX), clamp(anchor.x - w - 15, maxX)]);
      const ys = new Set([5, maxY, clamp(anchor.y - h - 17, maxY), clamp(anchor.y + 17, maxY)]);
      for (let x = 5; x <= maxX; x += step) xs.add(x);
      for (let y = 5; y <= maxY; y += step) ys.add(y);
      let best: (LabelBox & { start: MapPoint; end: MapPoint }) | undefined, bestScore = Infinity, bestCrossings = 0, bestVisualCost = 0;
      for (const y of ys) for (const x of xs) {
        const box = { x, y, width: w, height: h };
        if (occupied.some(other => overlaps(box, other))) continue;
        const end = { x: Math.max(x, Math.min(x + w, anchor.x)), y: Math.max(y, Math.min(y + h, anchor.y)) };
        const start = options ? leaderStart(anchor, end, playerBox) : anchor;
        // Legacy calls without layout options place boxes only; the actual map supplies
        // its rendered icon sizes and opts into collision-safe leaders.
        if (options && (lineMeetsBox(start, end, playerBox) ||
            icons.some(icon => icon.marker.id !== marker.id && lineMeetsBox(start, end, icon)) ||
            labels.some(label => lineMeetsBox(start, end, label) || lineMeetsBox(label.start, label.end, box)))) continue;
        const coverWidth = map ? Math.max(0, Math.min(x + w, map.x + map.width) - Math.max(x, map.x)) : 0;
        const coverHeight = map ? Math.max(0, Math.min(y + h, map.y + map.height) - Math.max(y, map.y)) : 0;
        const coverPenalty = coverWeight * coverWidth * coverHeight / (w * h);
        // Crossing another leader is a last resort, not a reason to drop a name.
        const crossingCount = options ? labels.filter(label => linesCross(start, end, label.start, label.end)).length : 0;
        const crossingPenalty = crossWeight * crossingCount;
        const distance = Math.hypot(x + w / 2 - anchor.x, y + h / 2 - anchor.y);
        const score = distance + coverPenalty + crossingPenalty;
        if (score < bestScore) {
          best = { ...box, start, end }; bestScore = score; bestCrossings = crossingCount;
          bestVisualCost = distance + 60 * coverWidth * coverHeight / (w * h) + 500 * crossingCount;
        }
      }
      if (best) { labels.push({ ...best, marker, anchor }); occupied.push(best); crossings += bestCrossings; totalScore += bestVisualCost; }
    }
    return { labels, crossings, totalScore };
  };
  // Repack deterministically when a greedy placement leaves a name out; prefer
  // all names, then fewer crossings, then shorter and less obtrusive leaders.
  const presets = options ? [[width < 600 ? 180 : 60, 500, 12], [90, 100, 12], [0, 100, 12],
    [180, 0, 12], [60, 0, 12], [0, 0, 12], [180, 100, 6], [60, 0, 6],
    [300, 500, 6], [300, 0, 6], [0, 0, 6], [90, 300, 6], [0, 500, 6]] : [[0, 0, 12]];
  const attempt = (ordered: typeof points) => {
    let best: ReturnType<typeof arrange> | undefined;
    for (const [coverWeight, crossWeight, step] of presets) {
      const candidate = arrange(ordered, coverWeight, crossWeight, step);
      if (!best || candidate.labels.length > best.labels.length ||
          candidate.labels.length === best.labels.length && candidate.crossings < best.crossings ||
          candidate.labels.length === best.labels.length && candidate.crossings === best.crossings && candidate.totalScore < best.totalScore) best = candidate;
      if (best.labels.length === points.length && best.crossings === 0) break;
    }
    return best!;
  };

  let best = attempt(points);
  if (!options || best.labels.length === points.length) return best.labels;
  const distance = (point: typeof points[number]) => (point.anchor.x - player.x) ** 2 + (point.anchor.y - player.y) ** 2;
  const byId = (a: typeof points[number], b: typeof points[number]) => a.marker.id < b.marker.id ? -1 : a.marker.id > b.marker.id ? 1 : 0;
  // Only if the nearest-first layout omits names, retry farthest-first, then
  // left-to-right; distance and ID make ties stable. Keep the more complete layout.
  const alternatives = [
    [...points].sort((a, b) => distance(b) - distance(a) || byId(a, b)),
    [...points].sort((a, b) => a.anchor.x - b.anchor.x || distance(a) - distance(b) || byId(a, b)),
  ];
  for (const ordered of alternatives) {
    const candidate = attempt(ordered);
    if (candidate.labels.length > best.labels.length) best = candidate;
    if (best.labels.length === points.length) break;
  }
  return best.labels;
}
