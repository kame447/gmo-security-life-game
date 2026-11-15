import { describe, expect, it } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { SHOP_CATALOGS, shopCatalog, type ShopCatalog } from '../src/data/shop-catalogs';
import { STORE_CONTACTS, storeForClerk } from '../src/data/stores';
import { CHILDHOOD_SAMPLE_EVENTS } from '../src/events/samples/childhood';
import { Game } from '../src/session/game';
import { clerkVisit } from '../src/shop/clerk-visit';
import { buildWorld } from '../src/world';
import { areaLayout } from '../src/world/layouts/index';
import { initialLayout, type AreaLayout } from '../src/world/layouts/codec';
import { HOME_AREA, WorldEditorModel } from '../src/world-editor/model';
import { areaNpcs, npcBadges, npcReferences } from '../src/world-editor/npc';
import { prepareSave } from '../src/world-editor/persistence';

describe('N2 店員と人生イベントの役割導出とN3.3店員しるしの一致', () => {
  it('母と公園の友だちの人生イベント参照を保ち、既存注記の形を維持する', () => {
    const model = new WorldEditorModel(buildWorld());
    const mother = model.npc('home-mother', undefined, HOME_AREA)!;
    const motherRefs = npcReferences(mother, model.document);
    expect(motherRefs.kind).toBe('life-events');
    expect(motherRefs.events.map(event => event.id)).toEqual(
      CHILDHOOD_SAMPLE_EVENTS.filter(event => event.trigger.eventKey === 'home.mother').map(event => event.id),
    );
    expect(motherRefs.events).toHaveLength(2);
    expect(motherRefs.note).toContain('ふだんの会話');
    expect(npcBadges(mother, model.document)).toEqual(['もとからいる人', 'イベントあり']);

    const friend = model.npc('park-friend', undefined, 'town-main')!;
    const friendRefs = npcReferences(friend, model.document);
    expect(friendRefs.kind).toBe('life-events');
    expect(friendRefs.events).toHaveLength(1);
    expect(npcBadges(friend, model.document)).toEqual(['もとからいる人', 'イベントあり']);
  });

  it('カタログあり店員（コンビニ）は買い物起動と1行目の先頭文あいさつを説明し、台詞を編集できる', () => {
    const model = new WorldEditorModel(buildWorld());
    const areaId = 'shop-konbini-interior';
    const clerk = areaNpcs(model.document, areaId).find(npc => npc.eventKey === 'shopping.konbini.clerk')!;
    const refs = npcReferences(clerk, model.document);
    const area = model.document.areas.find(candidate => candidate.id === areaId)!;
    const visit = clerkVisit(area, clerk);

    expect(visit).toBeDefined();
    expect(refs.kind).toBe('shop-clerk');
    expect(refs.store).toEqual(storeForClerk(areaId, clerk.eventKey));
    expect(refs.catalog?.id).toBe('konbini');
    expect(refs.linesLabel).toBe('店のあいさつ（1行目の最初の文だけが出ます）');
    expect(refs.note).toContain('買い物の画面');
    expect(refs.note).toContain('1行目の最初の文（最初の「。」「！」「？」まで）が、店のあいさつとして出ます');
    expect(refs.note).toContain('1行目の残りの文と、2行目からあとは、いまはゲームに出ません');
    expect(refs.note).toContain('あいさつの話し手の名前として出ます');
    expect(refs.note).not.toMatch(/台詞はゲームに出ない|会話はゲームに出ない/);
    expect(npcBadges(clerk, model.document)).toEqual(['もとからいる人', '店員']);

    model.updateNpc(clerk.id, {
      name: 'コンビニのたなかさん',
      lines: ['ようこそ、編集した挨拶です！ ゆっくり見ていってね。', '2行目のメモです。'],
    }, areaId);
    const edited = model.npc(clerk.id, undefined, areaId)!;
    const runtime = model.runtime(model.document, [areaId]);
    const editedVisit = clerkVisit(runtime.areas.get(areaId)!.def, runtime.areas.get(areaId)!.interactions.find(i => i.id === clerk.id)!)!;
    expect(editedVisit.greeting.speaker).toBe('コンビニのたなかさん');
    expect((editedVisit.greeting.lines[0] ?? '').match(/^[^。！？]*[。！？]?/)![0]).toBe('ようこそ、編集した挨拶です！');
    expect(edited.lines).toEqual(['ようこそ、編集した挨拶です！ ゆっくり見ていってね。', '2行目のメモです。']);
  });

  it('カタログなし6店の店員は店員役割と通常会話枠への表示を示し、編集した台詞がそのままゲームに出る', () => {
    const model = new WorldEditorModel(buildWorld());
    const cataloglessStores = STORE_CONTACTS.filter(store => !shopCatalog(store.catalogId));
    expect(cataloglessStores).toHaveLength(6);

    for (const store of cataloglessStores) {
      const area = model.document.areas.find(candidate => candidate.id === store.interiorAreaId)!;
      const clerk = areaNpcs(model.document, store.interiorAreaId).find(npc => npc.eventKey === store.clerkEventKey)!;
      expect(storeForClerk(store.interiorAreaId, clerk.eventKey)).toEqual(store);
      expect(clerkVisit(area, clerk)).toBeUndefined();

      const refs = npcReferences(clerk, model.document);
      expect(refs.kind).toBe('clerk-no-catalog');
      expect(refs.store).toEqual(store);
      expect(refs.catalog).toBeUndefined();
      expect(refs.note).toContain('通常の会話枠');
      expect(npcBadges(clerk, model.document)).toEqual(['もとからいる人', '店員']);
    }

    const targetStore = cataloglessStores.find(store => store.storeId === 'shop-bakery')!;
    const targetAreaId = targetStore.interiorAreaId;
    const bakeryClerk = areaNpcs(model.document, targetAreaId).find(npc => npc.eventKey === targetStore.clerkEventKey)!;
    model.updateNpc(bakeryClerk.id, { lines: ['パンが焼きたてだよ。', '2行目も出ます。'] }, targetAreaId);
    const game = new Game(model.runtime(model.document, [targetAreaId]), { phoneClock: () => 0, phoneEpochClock: () => 0 });
    game.player = { areaId: targetAreaId, ...feetAtTile(bakeryClerk.x, bakeryClerk.y + 1), facing: 'up' };
    expect(game.facingInteraction()?.id).toBe(bakeryClerk.id);
    game.action();
    expect(game.dialog?.lines).toEqual(['パンが焼きたてだよ。', '2行目も出ます。']);
  });

  it('prefix や見た目 sprite ではなく実契約だけで店員を判定する（N2.4・N3.3負例）', () => {
    const model = new WorldEditorModel(buildWorld());

    // 屋外の candy-shopkeeper は eventKey が shopping.candy でも STORE_CONTACTS 契約外
    const outdoorCandy = model.npc('candy-shopkeeper', undefined, 'town-main')!;
    expect(npcReferences(outdoorCandy, model.document).kind).toBe('dialogue');
    expect(npcReferences(outdoorCandy, model.document).store).toBeUndefined();
    expect(npcBadges(outdoorCandy, model.document)).toEqual(['もとからいる人']);
    expect(clerkVisit(model.document.areas.find(a => a.id === 'town-main')!, outdoorCandy)).toBeUndefined();

    const grandma = model.npc('neighbor-grandma', undefined, 'town-main')!;
    expect(npcReferences(grandma, model.document).kind).toBe('dialogue');
    expect(npcBadges(grandma, model.document)).toEqual(['もとからいる人']);

    // 見た目が clerk でも自己キーの置いた人は店員ではない
    const placedClerkLookalike = { ...model.createNpc('clerk', HOME_AREA), x: 4, y: 7, name: '店員風の知人', lines: ['こんにちは'] };
    model.commit(model.npcCandidate(placedClerkLookalike, true));
    expect(npcReferences(placedClerkLookalike, model.document).kind).toBe('dialogue');
    expect(npcBadges(placedClerkLookalike, model.document)).toEqual(['置いた人']);

    // areaId 不一致・outdoor・非 npc の負例でも clerk 扱いしない
    expect(npcReferences({ ...placedClerkLookalike, eventKey: 'shopping.konbini.clerk', areaId: HOME_AREA }, model.document).store).toBeUndefined();
    expect(npcReferences({ ...placedClerkLookalike, eventKey: 'shopping.konbini.clerk', areaId: 'town-main' }, model.document).store).toBeUndefined();
    expect(npcReferences({ ...placedClerkLookalike, eventKey: 'shopping.konbini.clerk', areaId: 'shop-konbini-interior', kind: 'object' }, model.document).store).toBeUndefined();
  });

  it('unit-only のカタログ fixture で clerkVisit と役割導出が一致して切り替わり、製品カタログは汚さない（N2.5）', () => {
    const model = new WorldEditorModel(buildWorld());
    const konbiniArea = model.document.areas.find(candidate => candidate.id === 'shop-konbini-interior')!;
    const konbiniClerk = areaNpcs(model.document, konbiniArea.id)[0]!;
    expect(npcReferences(konbiniClerk, model.document, { catalogs: [] }).kind).toBe('clerk-no-catalog');
    expect(clerkVisit(konbiniArea, konbiniClerk, STORE_CONTACTS, [])).toBeUndefined();

    const bakeryArea = model.document.areas.find(candidate => candidate.id === 'shop-bakery-interior')!;
    const bakeryClerk = areaNpcs(model.document, bakeryArea.id)[0]!;
    const expandedCatalogs: readonly ShopCatalog[] = [
      ...SHOP_CATALOGS,
      { id: 'bakery', name: 'パンや', offers: [{ itemId: 'bottled-water', priceYen: 120 }] },
    ];
    const bakeryWithCatalog = npcReferences(bakeryClerk, model.document, { catalogs: expandedCatalogs });
    const bakeryVisit = clerkVisit(bakeryArea, bakeryClerk, STORE_CONTACTS, expandedCatalogs);
    expect(bakeryWithCatalog.kind).toBe('shop-clerk');
    expect(bakeryWithCatalog.catalog?.id).toBe('bakery');
    expect(bakeryVisit?.catalog.id).toBe('bakery');

    // 製品カタログは変わらない
    expect(SHOP_CATALOGS.map(catalog => catalog.id)).toEqual(['konbini']);
  });

  it('役割導出のため保存JSONに欄を増やさず、全キー集合が変わらない（N2.6）', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    model.updateNpc('konbini-clerk', { name: '店員保存', lines: ['あいさつ保存。'] }, 'shop-konbini-interior');
    model.updateNpc('bakery-indoor-clerk', { name: 'パン店員保存', lines: ['パン保存。'] }, 'shop-bakery-interior');
    model.updateNpc('home-mother', { name: '母保存', lines: ['自宅保存。'] }, HOME_AREA);

    const saved = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(saved.files).toHaveLength(3);
    const keyShape = (layout: AreaLayout, npcId: string) => ({
      root: Object.keys(layout).sort(),
      area: Object.keys(layout.area).sort(),
      npc: Object.keys(layout.interactions.find(item => item.id === npcId)!).sort(),
    });
    for (const [areaId, npcId] of [
      ['shop-konbini-interior', 'konbini-clerk'],
      ['shop-bakery-interior', 'bakery-indoor-clerk'],
      [HOME_AREA, 'home-mother'],
    ] as const) {
      const before = areaLayout(areaId) ?? initialLayout(world.areas.get(areaId)!.def, 'AreaFactory');
      const after = JSON.parse(saved.files.find(file => file.areaId === areaId)!.text) as AreaLayout;
      expect(keyShape(after, npcId)).toEqual(keyShape(before, npcId));
    }
  });
});
