const SVG = 'http://www.w3.org/2000/svg';
function shape<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

/** Original vector product illustration. No third-party photographs or network assets. */
export function bicycleProductArt(color: string, view: 'side' | 'basket' | 'frame' = 'side'): SVGSVGElement {
  const svg = shape('svg', { viewBox: view === 'basket' ? '236 35 140 160' : view === 'frame' ? '115 60 180 160' : '0 0 420 250', role: 'img' });
  svg.classList.add('bicycle-product-art');
  const title = shape('title', {}); title.textContent = view === 'basket' ? '前かごとハンドルの拡大' : view === 'frame' ? 'フレームと変速機の拡大' : '通学用シティサイクルの側面'; svg.append(title);
  svg.append(shape('ellipse', { cx: 211, cy: 223, rx: 173, ry: 10, fill: '#142b3b', opacity: '.08' }));
  for (const cx of [93, 319]) {
    svg.append(shape('circle', { cx, cy: 166, r: 57, fill: '#f9faf8', stroke: '#263238', 'stroke-width': 9 }),
      shape('circle', { cx, cy: 166, r: 49, fill: 'none', stroke: '#b8bec0', 'stroke-width': 2 }));
    for (let n = 0; n < 12; n++) {
      const angle = n * Math.PI / 6;
      svg.append(shape('line', { x1: cx, y1: 166, x2: cx + Math.cos(angle) * 48, y2: 166 + Math.sin(angle) * 48, stroke: '#c6cdce', 'stroke-width': 1 }));
    }
    svg.append(shape('circle', { cx, cy: 166, r: 5, fill: '#9ca7a8' }));
  }
  svg.append(shape('path', { d: 'M35 155 Q44 106 92 105 Q141 105 151 151 M261 153 Q269 105 320 105 Q367 105 377 151', fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M47 107H128M51 101H122 M59 104L93 165 M121 104L108 164', fill: 'none', stroke: '#8e999a', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M93 166L170 166L146 88 M93 166L146 88 M170 166L283 110 M151 105Q190 154 208 143L281 96', fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    shape('path', { d: 'M169 159L97 157Q83 165 96 175L171 177Q185 173 179 164Z', fill: '#d4dbd9', stroke: '#a6b1b0', 'stroke-width': 2 }),
    shape('circle', { cx: 170, cy: 168, r: 17, fill: color, stroke: '#a5b3af', 'stroke-width': 2 }),
    shape('path', { d: 'M170 169L183 181H195 M170 167L156 157H145', fill: 'none', stroke: '#687878', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M280 81L319 166 M276 82L265 50L284 39H302', fill: 'none', stroke: '#6b7b7e', 'stroke-width': 5, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M282 84L303 139', fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M302 39H315', fill: 'none', stroke: '#303b3e', 'stroke-width': 8, 'stroke-linecap': 'round' }),
    shape('path', { d: 'M146 88L142 71', fill: 'none', stroke: '#899697', 'stroke-width': 4 }),
    shape('path', { d: 'M122 67Q129 59 142 64L164 68Q170 73 156 76L128 75Q119 74 122 67', fill: '#3f4545' }),
    shape('path', { d: 'M300 65H359L354 99H309Z', fill: '#b9c2c3', 'fill-opacity': '.35', stroke: '#6b7b7e', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    shape('path', { d: 'M308 67L315 97 M318 67L323 97 M329 67V97 M339 67L336 97 M350 67L346 97 M304 77H357 M306 87H355', fill: 'none', stroke: '#7f8e91', 'stroke-width': 1.3 }),
    shape('path', { d: 'M311 100L319 164 M304 41Q280 53 288 91', fill: 'none', stroke: '#7b898d', 'stroke-width': 1.5 }),
    shape('ellipse', { cx: 305, cy: 109, rx: 8, ry: 6, fill: '#ecdda5', stroke: '#7f8b8c', 'stroke-width': 2 }),
    shape('path', { d: 'M189 173L192 214', fill: 'none', stroke: '#66787a', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  return svg;
}
