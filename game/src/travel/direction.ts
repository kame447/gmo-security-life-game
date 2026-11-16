import { headingOf, type RailDirection, type RailHeading } from '../world/rail-geometry';

/** 上り・下りと発車の向きの定義は world/rail-geometry.ts の1か所。ここでは路線の駅順から方向を求めるだけ。 */
export type Direction = RailDirection;
export type Heading = RailHeading;
export { headingOf };

export function directionBetween(stations: readonly string[], from: string, to: string): Direction | null {
  const a = stations.indexOf(from), b = stations.indexOf(to);
  return a < 0 || b < 0 || a === b ? null : b > a ? 'down' : 'up';
}

export const directionLabel = (direction: Direction): string => direction === 'down' ? 'くだり' : 'のぼり';
