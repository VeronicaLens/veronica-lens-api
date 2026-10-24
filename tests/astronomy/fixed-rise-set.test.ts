import { describe, expect, it } from 'vitest';

import {
  STANDARD_HORIZON_DEGREES,
  equatorialToHorizontal,
  fixedRiseTransitSet,
} from '../../src/modules/astronomy/astro-core.js';

const campinas = { latitudeDegrees: -22.9, longitudeDegrees: -47.06, elevationMeters: 0 };
const from = new Date('2026-06-01T12:00:00Z');
const to = new Date('2026-06-02T12:00:00Z');
const sirius = { rightAscensionDegrees: 101.287155, declinationDegrees: -16.716116 };

describe('fixedRiseTransitSet', () => {
  it('finds Sirius rising, culminating and setting once in 24 hours', () => {
    const result = fixedRiseTransitSet(sirius, from, to, campinas);

    expect(result.status).toBe('rises-and-sets');
    expect(result.events.map((event) => event.type).sort()).toEqual(['rise', 'set', 'transit']);

    for (const event of result.events) {
      const at = Date.parse(event.at);
      expect(at).toBeGreaterThanOrEqual(from.getTime());
      expect(at).toBeLessThanOrEqual(to.getTime());
    }
  });

  it('places rise and set on the refracted horizon and transit at the highest point', () => {
    const { events } = fixedRiseTransitSet(sirius, from, to, campinas);

    for (const event of events.filter((e) => e.type !== 'transit')) {
      expect(event.altitudeDegrees).toBeCloseTo(STANDARD_HORIZON_DEGREES, 2);
    }

    const transit = events.find((event) => event.type === 'transit')!;
    const before = equatorialToHorizontal(sirius, new Date(Date.parse(transit.at) - 600_000), campinas);
    const after = equatorialToHorizontal(sirius, new Date(Date.parse(transit.at) + 600_000), campinas);

    // Upper culmination: 90 - |latitude - declination|.
    expect(transit.altitudeDegrees).toBeCloseTo(90 - Math.abs(-22.9 - -16.716116), 2);
    expect(transit.altitudeDegrees).toBeGreaterThan(before.altitudeDegrees);
    expect(transit.altitudeDegrees).toBeGreaterThan(after.altitudeDegrees);
  });

  it('rises in the east and sets in the west', () => {
    const { events } = fixedRiseTransitSet(sirius, from, to, campinas);
    const rise = events.find((event) => event.type === 'rise')!;
    const set = events.find((event) => event.type === 'set')!;

    expect(rise.azimuthDegrees).toBeGreaterThan(0);
    expect(rise.azimuthDegrees).toBeLessThan(180);
    expect(set.azimuthDegrees).toBeGreaterThan(180);
    expect(set.azimuthDegrees).toBeLessThan(360);
  });

  it('marks objects near the south celestial pole as always above in Campinas', () => {
    const result = fixedRiseTransitSet(
      { rightAscensionDegrees: 0, declinationDegrees: -80 },
      from,
      to,
      campinas,
    );

    expect(result.status).toBe('always-above');
    expect(result.events.every((event) => event.type === 'transit')).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  it('marks Ursa Major as never rising far enough south', () => {
    const result = fixedRiseTransitSet(
      { rightAscensionDegrees: 165.932, declinationDegrees: 61.751 },
      from,
      to,
      { latitudeDegrees: -40, longitudeDegrees: -47, elevationMeters: 0 },
    );

    expect(result.status).toBe('always-below');
    expect(result.events.every((event) => event.altitudeDegrees < 0)).toBe(true);
  });

  it('reports a second transit one sidereal day later when the window allows', () => {
    const first = fixedRiseTransitSet(sirius, from, to, campinas).events.find(
      (event) => event.type === 'transit',
    )!;
    const start = Date.parse(first.at) - 60_000;

    const transits = fixedRiseTransitSet(
      sirius,
      new Date(start),
      new Date(start + 24 * 3_600_000),
      campinas,
    ).events.filter((event) => event.type === 'transit');

    expect(transits).toHaveLength(2);
    // 23h 56m 4.1s between consecutive transits.
    expect(Date.parse(transits[1].at) - Date.parse(transits[0].at)).toBeCloseTo(86_164_091, -3);
  });
});
