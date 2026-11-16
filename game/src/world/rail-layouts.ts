import { MAIN_STATION_LAYOUT } from './landmarks';
import { townRailLayout, type TownRailLayout } from './rail-layout';
import { NEIGHBOR_STATION_LAYOUT } from './towns/neighbor';

/** 屋外エリアごとの街の線路の線形。街の定期列車が走る経路は、ここと地面の tile が一致する。 */
export const TOWN_RAIL_LAYOUTS: Readonly<Record<string, TownRailLayout>> = Object.freeze({
  'town-main': townRailLayout(MAIN_STATION_LAYOUT),
  'town-neighbor': townRailLayout(NEIGHBOR_STATION_LAYOUT),
});
