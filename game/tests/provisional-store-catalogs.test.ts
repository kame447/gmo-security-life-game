/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { getItemDefinition } from '../src/data/items';
import { SHOP_CATALOGS } from '../src/data/shop-catalogs';
import { clerkVisit } from '../src/shop/clerk-visit';
import { purchase } from '../src/shop/purchase';
import { PlayerAssets } from '../src/state/assets';
import { buildProvisionalStoreCatalogs, PROVISIONAL_CATALOG_DELTAS, PROVISIONAL_STORE_CATALOGS,
  PROVISIONAL_STORE_CONTACTS, STORE_CONTRACT_SOURCE } from './fixtures/provisional-store-catalogs';

/** Independent literal copy of the five-field records in #33 bed878f (not generated from this fixture). */
const expectedBed878f = [
  ['shop-konbini', 'shop-konbini-interior', 'konbini-enter', 'shopping.konbini.clerk', 'konbini'],
  ['shop-greengrocer', 'shop-greengrocer-interior', 'greengrocer-enter', 'shopping.greengrocer.clerk', 'greengrocer'],
  ['shop-bookstore', 'shop-bookstore-interior', 'bookstore-enter', 'shopping.bookstore.clerk', 'bookstore'],
  ['shop-candy', 'shop-candy-interior', 'candy-enter', 'shopping.candy.clerk', 'candy'],
  ['shop-bakery', 'shop-bakery-interior', 'bakery-enter', 'shopping.bakery.clerk', 'bakery'],
  ['shop-cafe', 'shop-cafe-interior', 'cafe-enter', 'shopping.cafe.clerk', 'cafe'],
  ['shop-pharmacy', 'shop-pharmacy-interior', 'pharmacy-enter', 'shopping.pharmacy.clerk', 'pharmacy'],
];

describe('provisional seven-store catalogues for the isolated rehearsal', () => {
  it('matches every five-field bed878f contract and resolves exactly those seven catalogue IDs', () => {
    expect(STORE_CONTRACT_SOURCE).toBe('bed878f3248bae0167c76b0437994a9705ba3a0a');
    expect(PROVISIONAL_STORE_CONTACTS.map(store => [store.storeId, store.interiorAreaId, store.entrancePortalId,
      store.clerkEventKey, store.catalogId])).toEqual(expectedBed878f);
    expect(PROVISIONAL_STORE_CATALOGS.map(catalog => catalog.id)).toEqual(expectedBed878f.map(row => row[4]));
    expect(Object.keys(PROVISIONAL_CATALOG_DELTAS).sort()).toEqual(expectedBed878f.map(row => row[4]).sort());
    expect(new Set(PROVISIONAL_STORE_CATALOGS.map(catalog => catalog.id)).size).toBe(7);
  });

  it('marks every contact, delta, removal, addition and resolved offer as provisional', () => {
    for (const store of PROVISIONAL_STORE_CONTACTS) expect(store.provisional).toBe(true);
    for (const delta of Object.values(PROVISIONAL_CATALOG_DELTAS)) {
      expect(delta.provisional).toBe(true); expect(delta.name).toContain('暫定');
      for (const item of [...delta.remove, ...delta.add]) expect(item.provisional).toBe(true);
    }
    for (const catalog of PROVISIONAL_STORE_CATALOGS) {
      expect(catalog.provisional).toBe(true); expect(catalog.name).toContain('暫定');
      expect(catalog.offers.length).toBeGreaterThan(0);
      for (const item of catalog.offers) {
        expect(item.provisional).toBe(true); expect(item.name).toContain('暫定');
        expect(getItemDefinition(item.itemId)).toBeDefined();
        expect(Number.isSafeInteger(item.priceYen) && item.priceYen > 0).toBe(true);
      }
      expect(new Set(catalog.offers.map(item => item.itemId)).size).toBe(catalog.offers.length);
    }
  });

  it('inherits the base with explicit deltas, so changing a base price reaches stores that retain that product', () => {
    const before = structuredClone(SHOP_CATALOGS);
    const changed = SHOP_CATALOGS.map(catalog => ({ ...catalog,
      offers: catalog.offers.map(item => ({ ...item, priceYen: item.itemId === 'bottled-water' ? 121 : item.priceYen })) }));
    const resolved = buildProvisionalStoreCatalogs(changed);
    for (const catalog of resolved.filter(catalog => catalog.id !== 'bookstore')) {
      expect(catalog.offers.find(item => item.itemId === 'bottled-water')?.priceYen).toBe(121);
    }
    expect(resolved.find(catalog => catalog.id === 'bookstore')!.offers.some(item => item.itemId === 'bottled-water')).toBe(false);
    expect(resolved.find(catalog => catalog.id === 'candy')!.offers.find(item => item.itemId === 'small-snack')?.priceYen).toBe(60);
    expect(SHOP_CATALOGS).toEqual(before);
    expect(() => buildProvisionalStoreCatalogs([])).toThrow(/konbini/);
  });

  it.each(PROVISIONAL_STORE_CONTACTS)('$catalogId works with the unchanged clerk and atomic purchase APIs', store => {
    const target = { id: 'rehearsal-clerk', kind: 'npc' as const, name: '暫定 店員', lines: ['暫定の挨拶'],
      eventKey: store.clerkEventKey, x: 1, y: 1, solid: true };
    const context = clerkVisit({ id: store.interiorAreaId, kind: 'indoor' }, target,
      PROVISIONAL_STORE_CONTACTS, PROVISIONAL_STORE_CATALOGS);
    expect(context?.store).toBe(store);
    const assets = new PlayerAssets({ moneyYen: 2480, items: [] });
    const offered = context!.catalog.offers[0];
    expect(purchase(assets, offered)).toMatchObject({ ok: true, paidYen: offered.priceYen, boughtQuantity: 1 });
    expect(assets.moneyYen).toBe(2480 - offered.priceYen); expect(assets.quantity(offered.itemId)).toBe(1);
    expect(clerkVisit({ id: store.interiorAreaId, kind: 'indoor' }, { ...target, kind: 'object' },
      PROVISIONAL_STORE_CONTACTS, PROVISIONAL_STORE_CATALOGS)).toBeUndefined();
  });

  it('has no reference from production src, including dynamic imports and re-exports', () => {
    const sources = import.meta.glob<string>('../src/**/*.{ts,tsx,js,jsx,mjs,cjs,css,html}',
      { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    const hits = Object.entries(sources).filter(([, source]) =>
      /provisional-store-catalogs|PROVISIONAL_STORE_CATALOGS|PROVISIONAL_CATALOG_DELTAS/.test(source)).map(([path]) => path);
    expect(hits).toEqual([]);
  });
});
