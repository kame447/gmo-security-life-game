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
export interface FacilityLabel extends LabelBox { marker: FacilityMarker; anchor: MapPoint }
const overlaps = (a: LabelBox, b: LabelBox): boolean =>
  a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;

/** Place nearby labels first, then search outward; never cover another label or symbol. */
export function layoutFacilityLabels(markers: readonly FacilityMarker[], projection: MapProjection,
  width: number, height: number, measure: (text: string) => number, player: MapPoint): FacilityLabel[] {
  const points = markers.map(marker => ({ marker, anchor: projectPoint(projection, marker) }));
  const occupied: LabelBox[] = points.map(({ anchor }) => ({ x: anchor.x - 11, y: anchor.y - 11, width: 22, height: 22 }));
  occupied.push({ x: player.x - 16, y: player.y - 16, width: 32, height: 32 });
  const labels: FacilityLabel[] = [];
  for (const { marker, anchor } of points) {
    const w = Math.ceil(measure(marker.name)) + 12, h = 23;
    let placed = false;
    for (let distance = 17; distance < height && !placed; distance += 27) {
      for (const dy of [-distance - h, distance]) {
        for (const dx of [-w / 2, 15, -w - 15]) {
          const box = { x: Math.max(5, Math.min(width - w - 5, anchor.x + dx)), y: anchor.y + dy, width: w, height: h };
          if (box.y < 5 || box.y + h > height - 5 || occupied.some(other => overlaps(box, other))) continue;
          labels.push({ ...box, marker, anchor }); occupied.push(box); placed = true; break;
        }
        if (placed) break;
      }
    }
  }
  return labels;
}
