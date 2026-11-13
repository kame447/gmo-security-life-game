export const MAP_CELL = 38;
export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;
export function tileFromClient(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }) {
  return { x: Math.floor((clientX - rect.left) * size.width / rect.width / MAP_CELL),
    y: Math.floor((clientY - rect.top) * size.height / rect.height / MAP_CELL) };
}
/** Keep the logical point under the cursor while changing CSS scale inside a scroll viewport. */
export function zoomScroll(scroll: number, anchor: number, previous: number, next: number, padding = 24): number {
  return Math.max(0, (scroll + anchor - padding) / previous * next - anchor + padding);
}
