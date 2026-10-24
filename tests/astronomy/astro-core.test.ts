import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  equatorialToHorizontal,
  greenwichMeanSiderealTimeDegrees,
  toJulianDate,
} from '../../src/modules/astronomy/astro-core.js';
import { parseObserverEphemeris } from '../../src/modules/astronomy/horizons.client.js';

const campinas = {
  latitudeDegrees: -22.9,
  longitudeDegrees: -47.06,
  elevationMeters: 600,
};

describe('time conversions', () => {
  it('returns the Julian Date of the J2000 epoch', () => {
    expect(toJulianDate(new Date('2000-01-01T12:00:00Z'))).toBe(2_451_545);
  });

  it('computes GMST at the J2000 epoch (~280.46 degrees)', () => {
    expect(
      greenwichMeanSiderealTimeDegrees(new Date('2000-01-01T12:00:00Z')),
    ).toBeCloseTo(280.46, 1);
  });

  it('rejects invalid dates', () => {
    expect(() => toJulianDate(new Date('invalid'))).toThrow(RangeError);
  });
});

describe('equatorialToHorizontal', () => {
  it('places an object at the zenith when RA equals the local sidereal time', () => {
    const observedAt = new Date('2026-06-01T00:00:00Z');
    const localSiderealTime =
      greenwichMeanSiderealTimeDegrees(observedAt) + campinas.longitudeDegrees;

    const result = equatorialToHorizontal(
      {
        rightAscensionDegrees: localSiderealTime,
        declinationDegrees: campinas.latitudeDegrees,
      },
      observedAt,
      campinas,
    );

    expect(result.altitudeDegrees).toBeCloseTo(90, 6);
  });

  it('matches JPL Horizons for the Moon within 0.1 degree', () => {
    const payload = JSON.parse(
      readFileSync(
        new URL('../fixtures/horizons-moon-observer.json', import.meta.url),
        'utf8',
      ),
    );
    const observedAt = new Date('2026-06-01T00:00:00Z');
    const horizons = parseObserverEphemeris(payload, observedAt);

    const local = equatorialToHorizontal(horizons.equatorial, observedAt, campinas);

    expect(local.altitudeDegrees).toBeCloseTo(horizons.horizontal.altitudeDegrees, 1);
    expect(local.azimuthDegrees).toBeCloseTo(horizons.horizontal.azimuthDegrees, 1);
  });

  it('keeps azimuth in [0, 360) and altitude in [-90, 90]', () => {
    for (let hour = 0; hour < 24; hour += 3) {
      const result = equatorialToHorizontal(
        { rightAscensionDegrees: 101.287155, declinationDegrees: -16.716116 },
        new Date(Date.UTC(2026, 5, 1, hour)),
        campinas,
      );

      expect(result.azimuthDegrees).toBeGreaterThanOrEqual(0);
      expect(result.azimuthDegrees).toBeLessThan(360);
      expect(Math.abs(result.altitudeDegrees)).toBeLessThanOrEqual(90);
    }
  });

  it.each([
    [{ rightAscensionDegrees: 0, declinationDegrees: 91 }, campinas],
    [{ rightAscensionDegrees: Number.NaN, declinationDegrees: 0 }, campinas],
    [
      { rightAscensionDegrees: 0, declinationDegrees: 0 },
      { ...campinas, latitudeDegrees: -91 },
    ],
    [
      { rightAscensionDegrees: 0, declinationDegrees: 0 },
      { ...campinas, longitudeDegrees: 181 },
    ],
  ])('rejects out-of-range input %#', (equatorial, observer) => {
    expect(() =>
      equatorialToHorizontal(equatorial, new Date(), observer),
    ).toThrow(RangeError);
  });
});
