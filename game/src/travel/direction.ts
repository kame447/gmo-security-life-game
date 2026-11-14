/** 路線の駅順で、番号が増える向きを下り、減る向きを上りとする（暫定）。 */
export type Direction = 'up' | 'down';
export type Heading = 'left' | 'right';

export function directionBetween(stations: readonly string[], from: string, to: string): Direction | null {
  const a = stations.indexOf(from), b = stations.indexOf(to);
  return a < 0 || b < 0 || a === b ? null : b > a ? 'down' : 'up';
}

/** 町を走る列車は左から右へ進む。下りと同じ向きにそろえ、上りは逆向き（暫定）。 */
export const headingOf = (direction: Direction): Heading => direction === 'down' ? 'right' : 'left';
export const directionLabel = (direction: Direction): string => direction === 'down' ? 'くだり' : 'のぼり';
