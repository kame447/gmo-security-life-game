/** 自作ピクセル図形。第三者素材なし。NPCの外見・スプライトは扱わない。 */
const NS = 'http://www.w3.org/2000/svg';
const rects: Record<string, readonly (readonly [number, number, number, number, string])[]> = {
  'small-snack': [[3, 3, 10, 10, '#bd5d50'], [4, 4, 8, 8, '#efb45a'], [5, 6, 6, 4, '#fff0c2'], [3, 2, 10, 2, '#e88a68'], [3, 12, 10, 2, '#984b45'], [7, 7, 2, 2, '#b66f3b']],
  'bottled-water': [[6, 1, 4, 2, '#2e7d94'], [5, 3, 6, 2, '#ecf5eb'], [4, 5, 8, 9, '#6eafc2'], [5, 6, 2, 6, '#b5e4e3'], [4, 8, 8, 3, '#f5f0d9'], [8, 8, 3, 3, '#4c8d97'], [5, 14, 6, 1, '#497c91']],
  notebook: [[3, 2, 10, 12, '#356d59'], [5, 2, 8, 11, '#e7ddad'], [5, 2, 1, 11, '#aeac83'], [7, 4, 4, 1, '#72917c'], [7, 6, 4, 1, '#b7bd9c'], [7, 8, 4, 1, '#b7bd9c'], [2, 4, 2, 1, '#c5a46c'], [2, 8, 2, 1, '#c5a46c'], [2, 12, 2, 1, '#c5a46c']],
  store: [[2, 4, 12, 2, '#846447'], [3, 6, 10, 8, '#e8c691'], [2, 4, 3, 3, '#507b63'], [5, 4, 3, 3, '#fff0ca'], [8, 4, 3, 3, '#507b63'], [11, 4, 3, 3, '#fff0ca'], [4, 9, 3, 5, '#5c8275'], [9, 9, 3, 3, '#8db6a0'], [3, 2, 10, 2, '#54765b']],
};
export function shopIcon(id: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (const [x, y, w, h, color] of rects[id] ?? rects.store) {
    const rect = document.createElementNS(NS, 'rect');
    for (const [key, value] of Object.entries({ x, y, width: w, height: h, fill: color })) rect.setAttribute(key, String(value));
    svg.append(rect);
  }
  return svg;
}
