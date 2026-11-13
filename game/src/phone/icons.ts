/** Original pixel icons drawn from small grids; no third-party image assets. */
const ART: Record<string, readonly string[]> = {
  message: [
    '............', '..########..', '.##########.', '.##wwwwww##.', '.##wwwwww##.', '.##########.',
    '.##########.', '..#######...', '...###......', '..##........', '............', '............',
  ],
  web: [
    '............', '...######...', '..########..', '.###wwww###.', '.##ww##ww##.', '.##ww##ww##.',
    '.##########.', '.##ww##ww##.', '.###wwww###.', '..########..', '...######...', '............',
  ],
  life: [
    '............', '....####....', '...##..##...', '...######...', '..########..', '..##wwww##..',
    '..##wwww##..', '..########..', '..########..', '...######...', '............', '............',
  ],
  friends: [
    '............', '...####.....', '..##ww##....', '..##ww##....', '...####.....', '......####..',
    '..######ww#.', '.##########.', '.##wwww###..', '.#########..', '............', '............',
  ],
};

export function phoneIcon(kind: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('phone-pixel-icon');
  const rows = ART[kind] ?? ART.message;
  rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel === '.') return;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y));
    rect.setAttribute('width', '1'); rect.setAttribute('height', '1');
    rect.setAttribute('fill', pixel === 'w' ? '#fffaf0' : 'currentColor');
    svg.append(rect);
  }));
  return svg;
}
