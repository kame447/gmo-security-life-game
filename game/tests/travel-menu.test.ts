import { describe, expect, it } from 'vitest';
import { TravelMenu } from '../src/travel/menu';

const origin = { id: 'station', name: 'いつものまち' };
const destinations = [{ id: 'station-neighbor', name: 'となりまち' }, { id: 'station-other', name: 'べつのまち' }];

describe('train destination selection', () => {
  it('requires a valid selection and explicit confirmation before returning a journey', () => {
    const menu = new TravelMenu();
    expect(menu.confirm()).toBeNull();
    expect(menu.open(origin, destinations)).toBe(true);
    expect(menu.confirm()).toBeNull();
    expect(menu.select('station-other')).toBe(true);
    expect(menu.state).toMatchObject({ step: 'confirm', destination: destinations[1] });
    expect(menu.confirm()).toEqual({ originId: 'station', destinationId: 'station-other' });
    expect(menu.state).toEqual({ step: 'closed' });
    expect(menu.confirm()).toBeNull();
  });

  it('rejects invalid or duplicate destinations and does not replace an open choice', () => {
    const menu = new TravelMenu();
    expect(menu.open(origin, [])).toBe(false);
    expect(menu.open(origin, [origin])).toBe(false);
    expect(menu.open(origin, [destinations[0], destinations[0]])).toBe(false);
    expect(menu.open(origin, destinations)).toBe(true);
    expect(menu.open(origin, [destinations[1]])).toBe(false);
    expect(menu.select('missing')).toBe(false);
    expect(menu.state).toMatchObject({ step: 'destinations', destinations });
  });

  it('returns from confirmation to the choices and closes without a journey', () => {
    const menu = new TravelMenu();
    expect(menu.open(origin, destinations)).toBe(true);
    expect(menu.select('station-neighbor')).toBe(true);
    expect(menu.back()).toBe(true);
    expect(menu.state).toMatchObject({ step: 'destinations', destinations });
    expect(menu.back()).toBe(true);
    expect(menu.state).toEqual({ step: 'closed' });
    expect(menu.back()).toBe(false);
    expect(menu.confirm()).toBeNull();
  });

  it('copies the offered stations so changing input or a snapshot cannot change the request', () => {
    const menu = new TravelMenu(), suppliedOrigin = { ...origin }, supplied = [{ ...destinations[0] }];
    expect(menu.open(suppliedOrigin, supplied)).toBe(true);
    suppliedOrigin.id = 'changed'; supplied[0].id = 'changed';
    const snapshot = menu.state;
    if (snapshot.step !== 'destinations') throw new Error('Expected destination choices');
    (snapshot.destinations[0] as { id: string }).id = 'snapshot-changed';
    expect(menu.select('station-neighbor')).toBe(true);
    expect(menu.confirm()).toEqual({ originId: 'station', destinationId: 'station-neighbor' });
  });
});
