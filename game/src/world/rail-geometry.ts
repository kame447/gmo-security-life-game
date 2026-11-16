/**
 * 上り・下りの唯一の定義。町の線路・定期走行の列車・駅の構内・乗車の演出は、すべてここから導く。
 *
 * 日本の鉄道は左側通行。画面の上を北とすると、東（右）へ走る列車は北側の線を使い、西（左）へ走る列車は南側の線を使う。
 * 路線の駅の並びで増える向き（まち → となりまち）を「下り」とし、下りは右へ走る。
 */
export type RailDirection = 'up' | 'down';
export type RailHeading = 'left' | 'right';

export const RAIL_DIRECTIONS: Readonly<Record<RailDirection, { readonly heading: RailHeading; readonly rowOffset: 0 | 1 }>> = Object.freeze({
  down: Object.freeze({ heading: 'right', rowOffset: 0 }),
  up: Object.freeze({ heading: 'left', rowOffset: 1 }),
});

export const RAIL_ORDER: readonly RailDirection[] = ['down', 'up'];

export const headingOf = (direction: RailDirection): RailHeading => RAIL_DIRECTIONS[direction].heading;
export const oppositeHeading = (heading: RailHeading): RailHeading => heading === 'left' ? 'right' : 'left';
/** 2線の北側の行を基準にした、各方向の線の行。 */
export const trackRowOf = (northRow: number, direction: RailDirection): number => northRow + RAIL_DIRECTIONS[direction].rowOffset;
