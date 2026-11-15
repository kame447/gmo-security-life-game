import type { EditorDocument, EditorInteraction } from '../editor/types';
import { SHOP_CATALOGS, shopCatalog, type ShopCatalog } from '../data/shop-catalogs';
import { STORE_CONTACTS, storeForClerk, type StoreContact } from '../data/stores';
import type { LifeEventDef } from '../events/life-events';
import { CHILDHOOD_SAMPLE_EVENTS } from '../events/samples/childhood';
import { clerkVisit } from '../shop/clerk-visit';
import { isSolidGround } from '../world/tiles';
import { PEOPLE } from '../render/people/catalog';

export const EDITABLE_PEOPLE = Object.freeze(PEOPLE.filter(person => person.id !== 'player'));
export const editablePerson = (id: string) => EDITABLE_PEOPLE.find(person => person.id === id);
export const npcEventKey = (id: string) => `npc.${id}`;
export const isPlacedNpc = (npc: EditorInteraction) => npc.kind === 'npc' && npc.eventKey === npcEventKey(npc.id);
export const npcEvents = (npc: EditorInteraction) => CHILDHOOD_SAMPLE_EVENTS.filter(event => event.trigger.eventKey === npc.eventKey);

export type NpcBadge = 'もとからいる人' | '置いた人' | '店員' | 'イベントあり';
export type NpcRoleKind = 'shop-clerk' | 'clerk-no-catalog' | 'life-events' | 'dialogue';

export interface NpcReferenceOptions {
  readonly stores?: readonly StoreContact[];
  readonly catalogs?: readonly ShopCatalog[];
  readonly events?: readonly LifeEventDef[];
}

export interface NpcReferences {
  readonly kind: NpcRoleKind;
  readonly roleLabel: string;
  readonly linesLabel: string;
  readonly note: string;
  readonly store?: StoreContact;
  readonly catalog?: ShopCatalog;
  readonly events: readonly LifeEventDef[];
}

/** Derive an NPC's runtime role and game-side references using the game's shared predicates. */
export function npcReferences(
  npc: EditorInteraction,
  document: Pick<EditorDocument, 'areas' | 'facilities'>,
  options?: NpcReferenceOptions,
): NpcReferences {
  const area = document.areas.find(candidate => candidate.id === npc.areaId);
  const stores = options?.stores ?? STORE_CONTACTS;
  const catalogs = options?.catalogs ?? SHOP_CATALOGS;
  const events = (options?.events ?? CHILDHOOD_SAMPLE_EVENTS).filter(
    event => event.trigger.eventKey === npc.eventKey,
  );
  const store = area && area.kind === 'indoor' && npc.kind === 'npc'
    ? (options?.stores
      ? stores.find(entry => entry.interiorAreaId === area.id && entry.clerkEventKey === npc.eventKey)
      : storeForClerk(area.id, npc.eventKey))
    : undefined;
  const visit = area ? clerkVisit(area, npc, stores, catalogs) : undefined;
  const catalog = visit?.catalog ?? (store && !options?.catalogs ? shopCatalog(store.catalogId) : undefined);
  const storeName =
    catalog?.name ??
    (store ? document.facilities.find(facility => facility.id === store.storeId)?.name : undefined) ??
    area?.name ??
    store?.storeId ??
    '';

  if (store && visit) {
    return {
      kind: 'shop-clerk',
      roleLabel: `${storeName}の店員（買い物が開きます）`,
      linesLabel: '店のあいさつ（1行目の最初の文だけが出ます）',
      note: `${storeName}の店員です。話しかけると、買い物の画面が開きます。この欄の1行目の最初の文（最初の「。」「！」「？」まで）が、店のあいさつとして出ます。1行目の残りの文と、2行目からあとは、いまはゲームに出ません。名前は、あいさつの話し手の名前として出ます。`,
      store,
      catalog,
      events,
    };
  }
  if (store) {
    return {
      kind: 'clerk-no-catalog',
      roleLabel: `${storeName}の店員（会話のみ）`,
      linesLabel: 'ふだんの会話（1行ずつ）',
      note: `${storeName}の店員です。商品カタログは未接続のため、話しかけるとここで編集した会話が通常の会話枠に出ます。`,
      store,
      events,
    };
  }
  if (events.length > 0) {
    return {
      kind: 'life-events',
      roleLabel: `人生イベントがある人（${events.length}件）`,
      linesLabel: 'ふだんの会話（1行ずつ）',
      note: `この人には条件つきのイベントの会話が${events.length}件あります。条件を満たすとそちらが出ます。ここで編集するのは、ふだんの会話です。`,
      events,
    };
  }
  return {
    kind: 'dialogue',
    roleLabel: 'ふだんの会話の人',
    linesLabel: 'ふだんの会話（1行ずつ）',
    note: 'この人に話しかけると、ここで編集したふだんの会話が通常の会話枠に出ます。',
    events,
  };
}

/** Return the ordered NPC entries in `areaId` from the current editor document. */
export const areaNpcs = (document: Pick<EditorDocument, 'interactions'>, areaId: string): EditorInteraction[] =>
  document.interactions.filter(interaction => interaction.areaId === areaId && interaction.kind === 'npc');

/** Derive display badges for an NPC row without changing persisted authoring fields. */
export function npcBadges(
  npc: EditorInteraction,
  document: Pick<EditorDocument, 'areas' | 'facilities'>,
  options?: NpcReferenceOptions,
): NpcBadge[] {
  const placed = isPlacedNpc(npc);
  const refs = npcReferences(npc, document, options);
  const badges: NpcBadge[] = [placed ? '置いた人' : 'もとからいる人'];
  if (refs.store) badges.push('店員');
  if (refs.events.length > 0) badges.push('イベントあり');
  return badges;
}

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
