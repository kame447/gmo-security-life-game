import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJSON } from '../src/editor/schema';
import { buildAreaMap } from '../src/minimap/model';
import { buildingRepresentativeColor } from '../src/render/building-colors';
import { outdoorForObject } from '../src/render/outdoor/catalog';
import { objectSprite } from '../src/render/sprites';
import { buildWorld, AREA_FACTORIES } from '../src/world';
import { createTown, FACILITIES } from '../src/world/town';
import { toRuntime } from '../src/world/runtime';
import { AREA_LAYOUTS, staleLayouts } from '../src/world/layouts';
import { areaFingerprint, initialLayout, layoutArea, plainArea } from '../src/world/layouts/codec';
import { WorldEditorModel } from '../src/world-editor/model';
import { OutdoorModel } from '../src/world-editor/outdoor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { STORE_CONTACTS } from '../src/data/stores';

const { storefront } = vi.hoisted(() => ({ storefront: vi.fn() }));
vi.mock('../src/render/stores', async original => ({
  ...await original<typeof import('../src/render/stores')>(), drawShopExterior: storefront,
}));
const ID = 'town-shop-60-59';
const target = (area = createTown()) => area.objects.find(o => o.id === ID)!;
/** Old generated town differs only in the two appearance fields changed by F5. */
function oldTown() {
  const old = createTown(); Object.assign(target(old), { kind: 'shop', style: 'cafe' }); return old;
}
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('F5 background residence', () => {
  it('keeps its stable identity, footprint, collision and lack of store linkage', () => {
    const area = createTown(), object = target(area), old = oldTown();
    expect(object).toEqual({ id: ID, kind: 'apartment', x: 60, y: 59, w: 6, h: 6, style: '0',
      solid: true, facilityId: undefined, layer: 'sorted' });
    expect(area.objects.filter(o => o.id === ID)).toHaveLength(1);
    expect(toRuntime(area).solid).toEqual(toRuntime(old).solid);
    expect(area.portals).toEqual(old.portals); expect(area.interactions).toEqual(old.interactions);
    expect(area.portals.some(p => p.from.x >= 60 && p.from.x < 66 && p.from.y >= 59 && p.from.y <= 65)).toBe(false);
    expect(area.interactions.some(i => i.x >= 60 && i.x < 66 && i.y >= 59 && i.y < 65)).toBe(false);
    expect(area.objects.filter(o => o.kind === 'shop')).toHaveLength(7); expect(STORE_CONTACTS).toHaveLength(7);
  });

  it('uses the existing apartment sprite without calling the store painter', () => {
    const fillText = vi.fn();
    class Canvas {
      width = 0; height = 0;
      readonly ctx = { fillStyle: '', imageSmoothingEnabled: false, fillRect: vi.fn(), fillText };
      getContext() { return this.ctx; }
    }
    vi.stubGlobal('document', { createElement: () => new Canvas() });
    const object = target(), sprite = objectSprite(object);
    expect(sprite).toBe(objectSprite({ kind: 'apartment', style: '0', x: 0, y: 0, w: 6, h: 6, solid: true }));
    expect(sprite.canvas.width).toBe(96); expect(sprite.canvas.height).toBe(96);
    expect(sprite.ox).toBe(0); expect(sprite.oy).toBe(0);
    expect(storefront).not.toHaveBeenCalled(); expect(fillText).not.toHaveBeenCalled();
  });

  it('changes the map building color to residential without adding a name or marker', () => {
    const area = createTown(), map = buildAreaMap(toRuntime(area), FACILITIES);
    const previous = buildAreaMap(toRuntime(oldTown()), FACILITIES);
    expect(buildingRepresentativeColor(target())).toBe('#b5bec0');
    expect(buildingRepresentativeColor(target(oldTown()))).toBe('#64776a');
    expect(map.markers).toEqual(previous.markers);
    expect(map.markers.some(m => m.id === ID)).toBe(false);
    expect(map.cells).toEqual(previous.cells);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const inside = x >= 60 && x < 66 && y >= 59 && y < 65;
      expect(map.colors[y * map.width + x]).toBe(inside ? '#b5bec0' : previous.colors[y * map.width + x]);
    }
  });

  it('retains outdoor editing protection and round-trips through the public save plan', () => {
    const world = buildWorld(), model = new WorldEditorModel(world), outdoor = new OutdoorModel(model);
    expect(outdoorForObject(target())?.id).toBe('apartment-0');
    expect(outdoorForObject(target(oldTown()))?.id).toBe('shop-cafe');
    expect(outdoor.readOnlyReason(ID)).toBe(''); expect(outdoor.protectedReason(ID)).toBe('');
    const before = structuredClone(model.document);
    expect(() => outdoor.move(ID, 61, 59)).toThrow('壁やほかの家具と重なっています');
    expect(model.document).toEqual(before);
    outdoor.move(ID, 60, 60);
    const plan = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(plan.files).toHaveLength(1); expect(plan.files[0].relativePath).toBe('data/world/areas/town-main.json');
    const restored = layoutArea(JSON.parse(plan.files[0].text), createTown());
    expect(target(restored)).toMatchObject({ id: ID, kind: 'apartment', style: '0', x: 60, y: 60, w: 6, h: 6, solid: true });
  });

  it('loads an old full-town layout unchanged, including its authored cafe appearance', () => {
    const old = oldTown(), saved = initialLayout(old, 'createTown');
    const raw = canonicalJSON(saved), restored = layoutArea(JSON.parse(raw), createTown());
    expect(plainArea(restored)).toEqual(plainArea(old));
    expect(target(restored)).toMatchObject({ id: ID, kind: 'shop', style: 'cafe', x: 60, y: 59, w: 6, h: 6 });
    expect(canonicalJSON(initialLayout(restored, 'createTown'))).toBe(raw);
  });

  it('keeps the existing stale-source warning and save refusal for an installed old town layout', () => {
    const saved = initialLayout(oldTown(), 'createTown');
    expect(saved.source.fingerprint).not.toBe(areaFingerprint(createTown()));
    AREA_LAYOUTS.push(saved);
    try {
      expect(staleLayouts(AREA_FACTORIES.map(create => create()))).toContain('town-main');
      const world = buildWorld(), model = new WorldEditorModel(world);
      expect(() => prepareSave({ changes: model.session.exportChanges() }, world)).toThrow('生成元が変わっています');
    } finally { AREA_LAYOUTS.pop(); }
  });
});
