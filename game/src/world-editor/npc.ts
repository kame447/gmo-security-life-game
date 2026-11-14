import type { EditorDocument, EditorInteraction } from '../editor/types';
import { CHILDHOOD_SAMPLE_EVENTS } from '../events/samples/childhood';
import { isSolidGround } from '../world/tiles';
import { PEOPLE } from '../render/people/catalog';

export const EDITABLE_PEOPLE = Object.freeze(PEOPLE.filter(person => person.id !== 'player'));
export const editablePerson = (id: string) => EDITABLE_PEOPLE.find(person => person.id === id);
export const npcEventKey = (id: string) => `npc.${id}`;
export const isPlacedNpc = (npc: EditorInteraction) => npc.kind === 'npc' && npc.eventKey === npcEventKey(npc.id);
export const npcEvents = (npc: EditorInteraction) => CHILDHOOD_SAMPLE_EVENTS.filter(event => event.trigger.eventKey === npc.eventKey);

/** Checked again by the save policy; catalog declarations come from the trusted loader. */
export function npcIssue(npc: EditorInteraction, document: EditorDocument): string | undefined {
  if (npc.kind !== 'npc' || !npc.solid || (npc.w ?? 1) !== 1 || (npc.h ?? 1) !== 1 || npc.objectId)
    return '人は通れない1×1の足元で置きます';
  if (!npc.sprite || !editablePerson(npc.sprite) || !document.catalogs.sprites.includes(npc.sprite))
    return '人のカタログにある見た目を選んでください';
  if (!npc.name.trim() || !npc.lines.length || npc.lines.some(line => !line.trim())) return '名前と会話は空にできません';
  const area = document.areas.find(area => area.id === npc.areaId);
  if (!area || !Number.isSafeInteger(npc.x) || !Number.isSafeInteger(npc.y) || npc.x < 0 || npc.y < 0 ||
      npc.x >= area.width || npc.y >= area.height || isSolidGround(area.ground[npc.y * area.width + npc.x]))
    return '人は通れる床の上に置いてください';
  for (const portal of document.portals) {
    if (portal.areaId === npc.areaId && npc.x >= portal.from.x && npc.x < portal.from.x + (portal.from.w ?? 1) &&
        npc.y === portal.from.y) return '出入口のマスには人を置けません';
    if (portal.to.areaId === npc.areaId && npc.x === portal.to.x && npc.y === portal.to.y) return '出入口の到着位置には人を置けません';
  }
  return undefined;
}
