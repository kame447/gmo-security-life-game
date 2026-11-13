/** Small original pixel icons, drawn from rectangles so no external assets are required. */
type PixelRect = readonly [number, number, number, number, string];
const SHAPES: Record<string, readonly PixelRect[]> = {
  notebook: [[3, 2, 10, 12, '#7b4e37'], [4, 2, 9, 11, '#e5b66e'], [5, 3, 1, 9, '#fff0c0'], [7, 5, 5, 1, '#986d47'], [7, 8, 5, 1, '#986d47']],
  pencil: [[4, 2, 3, 2, '#ca7659'], [4, 4, 3, 8, '#e2b352'], [4, 11, 3, 2, '#f7dfae'], [5, 13, 1, 2, '#544c47'], [7, 5, 1, 6, '#9e763d']],
  water: [[6, 1, 4, 2, '#5f8490'], [5, 3, 6, 2, '#bfe9e5'], [4, 5, 8, 9, '#71b6c3'], [5, 6, 6, 7, '#bfe9e5'], [5, 9, 6, 2, '#ecf5da']],
  snack: [[4, 2, 8, 1, '#b95f4b'], [3, 3, 10, 10, '#d88251'], [4, 5, 8, 6, '#efcf82'], [6, 6, 4, 3, '#a76542'], [4, 13, 8, 1, '#b95f4b']],
  clothing: [[5, 2, 6, 2, '#df8f81'], [3, 4, 10, 3, '#e8b1a0'], [2, 5, 3, 3, '#e8b1a0'], [11, 5, 3, 3, '#e8b1a0'], [4, 7, 8, 7, '#d88173'], [7, 3, 2, 2, '#f5dfc2']],
  key: [[3, 3, 6, 6, '#e3b95d'], [5, 5, 2, 2, '#6b513b'], [8, 7, 5, 2, '#e3b95d'], [11, 8, 2, 4, '#e3b95d'], [9, 8, 2, 3, '#e3b95d']],
  card: [[2, 4, 12, 8, '#7ba9a1'], [3, 5, 10, 6, '#c9e1c8'], [3, 7, 10, 2, '#526f74'], [4, 10, 3, 1, '#f4eee0']],
  item: [[3, 4, 10, 9, '#9d7350'], [4, 5, 8, 7, '#e2bf88'], [7, 4, 2, 9, '#c58a5c'], [4, 7, 8, 2, '#c58a5c']],
};

export function itemIcon(id: string): SVGSVGElement {
  const key = /notebook|book/.test(id) ? 'notebook' : /pencil|pen/.test(id) ? 'pencil'
    : /water|drink/.test(id) ? 'water' : /snack|food/.test(id) ? 'snack'
      : /shirt|cloth|outfit/.test(id) ? 'clothing' : /key/.test(id) ? 'key'
        : /card/.test(id) ? 'card' : 'item';
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (const [x, y, width, height, fill] of SHAPES[key]) {
    const rect = document.createElementNS(namespace, 'rect');
    for (const [name, value] of Object.entries({ x, y, width, height, fill })) rect.setAttribute(name, String(value));
    svg.append(rect);
  }
  return svg;
}
