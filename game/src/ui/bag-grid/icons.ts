/** Original 16-pixel drawings; no external image or font assets. */
export function gridItemIcon(id: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  canvas.setAttribute('aria-hidden', 'true');
  const c = canvas.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  const ink = '#35484b', cream = '#fff6da', shade = '#c4c3ac', red = '#c66c55';
  if (id === 'notebook') {
    r(3, 2, 10, 13, ink); r(4, 3, 8, 11, '#74a79c'); r(4, 3, 2, 11, '#49877e');
    r(7, 5, 4, 3, cream); r(2, 4, 3, 1, cream); r(2, 8, 3, 1, cream); r(2, 12, 3, 1, cream);
  } else if (id === 'pencil') {
    for (let y = 2; y < 12; y++) {
      const x = 12 - y;
      r(x, y, 4, 1, ink); r(x + 1, y, 2, 1, y < 4 ? red : '#e1b756');
    }
    r(1, 12, 3, 1, '#c3966c'); r(1, 13, 2, 1, ink);
  } else if (id === 'bottled-water') {
    r(6, 1, 4, 2, ink); r(6, 2, 4, 1, '#639bab'); r(5, 3, 6, 2, ink);
    r(4, 5, 8, 10, ink); r(5, 5, 6, 9, '#83bdc7'); r(6, 5, 2, 9, '#b7dce0');
    r(5, 8, 6, 4, cream); r(8, 9, 2, 2, '#6ba5b5');
  } else if (id === 'small-snack') {
    r(3, 2, 10, 13, ink); r(4, 3, 8, 11, red); r(4, 4, 8, 1, '#e2a47b');
    r(5, 7, 6, 5, '#f2ce80'); r(6, 6, 4, 1, '#f2ce80'); r(6, 8, 1, 1, '#95623d');
    r(9, 10, 1, 1, '#95623d'); r(4, 13, 8, 1, '#e2a47b');
  } else if (id === 'hand-towel') {
    r(2, 3, 12, 11, ink); r(3, 4, 10, 9, '#b0bfa1'); r(3, 7, 10, 2, '#e6e6bf');
    r(6, 4, 2, 9, '#e6e6bf'); r(11, 4, 1, 9, '#829b83'); r(3, 11, 10, 1, '#829b83');
  } else if (id === 'bread') {
    r(4, 4, 8, 10, ink); r(2, 6, 12, 6, ink); r(3, 6, 10, 6, '#c58c4e');
    r(4, 5, 8, 7, '#e8b96e'); r(5, 4, 6, 1, '#e8b96e'); r(5, 12, 6, 1, '#c58c4e');
    r(5, 6, 2, 2, '#fae0a0'); r(9, 7, 2, 2, '#fae0a0');
  } else if (id === 'shirt') {
    r(5, 2, 6, 12, ink); r(3, 3, 10, 4, ink); r(1, 4, 14, 3, ink);
    r(5, 3, 6, 10, cream); r(2, 4, 4, 2, cream); r(10, 4, 4, 2, cream);
    r(6, 2, 4, 2, ink); r(7, 3, 2, 2, shade); r(10, 7, 1, 6, shade);
  } else if (id === 'umbrella') {
    r(7, 1, 2, 13, ink); r(5, 13, 3, 2, ink); r(4, 12, 2, 2, ink);
    r(5, 3, 6, 7, ink); r(3, 5, 10, 5, ink); r(2, 7, 12, 3, ink);
    r(5, 4, 6, 5, '#7c9e90'); r(3, 6, 10, 3, '#7c9e90'); r(7, 4, 2, 5, '#aec3a3');
  } else if (id === 'key') {
    r(2, 2, 7, 7, ink); r(3, 3, 5, 5, '#e0b756'); r(4, 4, 3, 3, ink);
    r(7, 7, 3, 3, ink); r(8, 8, 5, 5, ink); r(9, 8, 2, 4, '#e0b756');
    r(11, 11, 3, 3, ink); r(11, 11, 2, 1, '#e0b756');
  } else if (id === 'card') {
    r(1, 3, 14, 10, ink); r(2, 4, 12, 8, cream); r(2, 5, 12, 2, '#739e9d');
    r(3, 8, 3, 3, '#d3b66e'); r(8, 9, 4, 1, shade); r(8, 11, 3, 1, shade);
  } else if (id === 'bag') {
    r(5, 1, 6, 4, ink); r(6, 2, 4, 2, '#d5ac72'); r(3, 4, 10, 11, ink);
    r(4, 5, 8, 9, '#c49b69'); r(5, 9, 6, 4, '#e3c591'); r(7, 8, 2, 2, ink);
  } else {
    r(3, 5, 10, 9, ink); r(4, 6, 8, 7, '#e0b756'); r(6, 2, 4, 4, ink);
    r(7, 3, 2, 4, '#f8dc84'); r(6, 9, 4, 1, '#fff1ba');
  }
  return canvas;
}
