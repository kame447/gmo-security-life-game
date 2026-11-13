import { describe, expect, it } from 'vitest';
import { fingerprintValue, sourceFingerprint, sourceSnapshot } from '../src/editor-persistence/common.ts';
import { buildWorld } from '../src/world/index.ts';

describe('evaluation source fingerprint shared by map and NPC checks', () => {
  it('hashes canonical JSON including its trailing newline', async () => {
    // SHA-256 of the UTF-8 bytes "{}\n"; independent of any World projection.
    expect(await fingerprintValue({})).toBe('sha256:ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356');
    expect(await fingerprintValue({ b: 2, a: 1 })).toBe(await fingerprintValue({ a: 1, b: 2 }));
  });
  it('ignores Map insertion order while retaining ordered arrays and hidden source metadata', async () => {
    const world = buildWorld(), other = buildWorld();
    other.areas = new Map([...other.areas].reverse());
    other.facilities = new Map([...other.facilities].reverse());
    const before = await sourceFingerprint(world);
    expect(await sourceFingerprint(other)).toBe(before);
    other.areas.get('town-main')!.def.objects.reverse();
    expect(await sourceFingerprint(other)).not.toBe(before);
    const districts = buildWorld();
    districts.areas.get('town-main')!.def.districts![0].name += ' changed';
    expect(await sourceFingerprint(districts)).not.toBe(before);
    const variant = structuredClone(buildWorld());
    variant.variant.edgeMessage = 'evaluation only';
    expect(await sourceFingerprint(variant)).not.toBe(before);
  });
  it('detaches nested fields, tile arrays, portals and conversations without changing the source', () => {
    const world = buildWorld(), before = structuredClone(world), snapshot = sourceSnapshot(world);
    const area = snapshot.areas.find(area => area.id === 'town-main')!;
    area.ground[0] = 255;
    area.objects[0].x = 999;
    area.portals[0].to.x = 999;
    area.interactions[0].lines.push('copy only');
    area.districts![0].name = 'copy only';
    snapshot.facilities[0].name = 'copy only';
    snapshot.start.x = 999;
    snapshot.variant.edgeMessage = 'copy only';
    expect(world).toEqual(before);
  });
});
