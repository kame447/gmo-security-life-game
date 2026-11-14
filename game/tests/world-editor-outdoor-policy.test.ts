import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/world';
import { LANDMARKS } from '../src/world';
import { T } from '../src/world/tiles';
import { withDerived } from '../src/editor/changes';
import { WorldEditorModel } from '../src/world-editor/model';
import { assertWorldEdit } from '../src/world-editor/world-policy';
import { OutdoorModel, assertOutdoorEdit } from '../src/world-editor/outdoor';
import type { EditorDocument } from '../src/editor/types';

const fixture = () => {
  const host = new WorldEditorModel(buildWorld());
  return { host, outdoor: new OutdoorModel(host), before: host.initial, after: host.document };
};
const tile = (d: EditorDocument, value: number) => {
  const a = d.areas.find(a => a.id === 'town-main')!, index = a.ground.indexOf(value);
  if (index < 0) throw new Error(`Missing test ground ${value}`);
  return { x: index % a.width, y: Math.floor(index / a.width) };
};

describe('屋外の編集方針', () => {
  it('既存の重なりを含む未編集のまちをそのまま許す', () => {
    const { before, after, host } = fixture();
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).not.toThrow();
    expect(() => assertWorldEdit(before, after, host.context)).not.toThrow();
  });
  it.each([T.ASPHALT, T.LANE_H, T.ZEBRA_H, T.BRIDGE, T.CROSSING])('通れる花だんでも地面%iの上は拒否する（規則6）', ground => {
    const { before, after, outdoor } = fixture();
    after.objects.push({ ...outdoor.create('flowerbed'), ...tile(after, ground) });
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).toThrow('車道');
  });
  it('建物は歩道を拒否し、小さい物は歩道を方針として許す（規則7）', () => {
    const { before, after, outdoor } = fixture(), point = tile(after, T.SIDEWALK);
    after.objects.push({ ...outdoor.create('house-0'), ...point });
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).toThrow('歩道');
    after.objects.pop(); after.objects.push({ ...outdoor.create('lamp'), ...point });
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).not.toThrow();
  });
  it.each(['schoolGate', 'stationFront', 'parkPlaza', 'shoppingStreet'] as const)('通れる物も固定目印%sを覆えない（規則8）', name => {
    const { before, after, outdoor } = fixture();
    after.objects.push({ ...outdoor.create('flowerbed'), ...LANDMARKS[name] });
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).toThrow('目印');
  });
  it('開始位置もふさげず、固定目印を孤立させる壁も拒否する', () => {
    const { before, after, outdoor } = fixture();
    after.objects.push({ ...outdoor.create('flowerbed'), x: after.start.x, y: after.start.y });
    expect(() => assertOutdoorEdit(before, after, { areaId: 'town-main' })).toThrow('目印');
    // Use ordinary existing trees as a four-sided ring, without changing their attributes.
    const isolated = structuredClone(before), center = LANDMARKS.parkPlaza;
    const trees = isolated.objects.filter(o => o.kind === 'tree').slice(0, 4);
    for (const [n, [dx, dy]] of [[0, -1], [1, 0], [0, 1], [-1, 0]].entries()) Object.assign(trees[n], { x: center.x + dx, y: center.y + dy });
    expect(() => assertOutdoorEdit(before, isolated, { areaId: 'town-main' })).toThrow('目印');
  });
  it.each(['station', 'train', 'track'])('%sは移動・削除・複製できず、回転も拒否する（規則9）', kind => {
    const { host, outdoor } = fixture(), o = host.document.objects.find(o => o.kind === kind)!;
    expect(outdoor.readOnlyReason(o.id)).not.toBe('');
    expect(() => outdoor.move(o.id, o.x + 1, o.y)).toThrow();
    expect(() => outdoor.remove(o.id)).toThrow();
    expect(() => outdoor.duplicate(o.id)).toThrow();
    expect(() => outdoor.rotate(o.id)).toThrow('回転');
    const changed = host.document; changed.objects.find(p => p.id === o.id)!.style = 'changed';
    expect(() => assertOutdoorEdit(host.initial, changed, { areaId: 'town-main' })).toThrow();
    expect(host.dirty).toBe(0);
  });
  it('地面・施設・年代・地区・大きさの変更は拒否する（規則9/10）', () => {
    const { before } = fixture();
    for (const alter of [
      (d: EditorDocument) => { d.areas.find(a => a.id === 'town-main')!.ground[0]++; },
      (d: EditorDocument) => { d.areas.find(a => a.id === 'town-main')!.width++; },
      (d: EditorDocument) => { d.areas.find(a => a.id === 'town-main')!.districts![0].name += '変更'; },
      (d: EditorDocument) => { d.facilities[0].name += '変更'; },
      (d: EditorDocument) => { d.variant!.id = 'changed'; },
    ]) {
      const next = structuredClone(before); alter(next);
      expect(() => assertOutdoorEdit(before, next, { areaId: 'town-main' })).toThrow();
    }
  });
  it('施設と結び付きのある物は消せず、入口を単独で動かせない', () => {
    const { host, outdoor } = fixture();
    for (const o of host.document.objects.filter(o => o.areaId === 'town-main' &&
      (o.facilityId || host.initial.interactions.some(i => i.objectId === o.id)))) {
      expect(() => outdoor.remove(o.id)).toThrow(); expect(() => outdoor.duplicate(o.id)).toThrow();
    }
    const next = host.document;
    next.portals.find(p => p.id === 'konbini-enter')!.from.x--;
    next.portals.find(p => p.id === 'konbini-exit')!.to.x--;
    expect(() => assertWorldEdit(host.initial, withDerived(next, host.context), host.context)).toThrow('建物');
    expect(host.dirty).toBe(0);
  });
  it('新規の種類・catalogId・足元の偽装と既存物の属性変更を拒否する', () => {
    const { host, outdoor } = fixture();
    for (const patch of [{ kind: 'unlisted' }, { catalogId: 'chair-wood' }, { w: 3 }, { facilityId: 'home-family' }]) {
      const next = host.document; next.objects.push({ ...outdoor.create('tree-green'), ...patch });
      expect(() => assertOutdoorEdit(host.initial, next, { areaId: 'town-main' })).toThrow();
    }
    const next = host.document; next.objects.find(o => o.kind === 'tree')!.solid = false;
    expect(() => assertOutdoorEdit(host.initial, next, { areaId: 'town-main' })).toThrow('属性');
  });
});
