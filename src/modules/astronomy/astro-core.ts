import type {
  EquatorialCoordinates,
  HorizontalCoordinates,
  ObserverLocation,
  RiseTransitSetEvent,
  RiseTransitSetType,
} from './astronomy.types.js';

const JULIAN_DATE_UNIX_EPOCH = 2_440_587.5;
const JULIAN_DATE_J2000 = 2_451_545;
const MILLISECONDS_PER_DAY = 86_400_000;

export function toJulianDate(date: Date): number {
  assertValidDate(date);

  return date.getTime() / MILLISECONDS_PER_DAY + JULIAN_DATE_UNIX_EPOCH;
}

// USNO approximation; UTC stands in for UT1 (error below one second).
export function greenwichMeanSiderealTimeDegrees(date: Date): number {
  const julianDate = toJulianDate(date);
  const julianDateAtMidnight = Math.floor(julianDate - 0.5) + 0.5;
  const hours = (julianDate - julianDateAtMidnight) * 24;
  const daysSinceJ2000 = julianDateAtMidnight - JULIAN_DATE_J2000;
  const centuries = (julianDate - JULIAN_DATE_J2000) / 36_525;

  const gmstHours =
    6.697375 +
    0.065707485828 * daysSinceJ2000 +
    1.0027379 * hours +
    0.0854103 * centuries +
    0.0000258 * centuries ** 2;

  return normalizeDegrees(gmstHours * 15);
}

// Geometric conversion without refraction. Precession and nutation are not
// applied, so J2000 coordinates drift by a fraction of a degree today; this is
// enough for pointing a phone, not for astrometry.
export function equatorialToHorizontal(
  equatorial: EquatorialCoordinates,
  observedAt: Date,
  observer: ObserverLocation,
): HorizontalCoordinates {
  assertRange('declination', equatorial.declinationDegrees, -90, 90);
  assertRange('latitude', observer.latitudeDegrees, -90, 90);
  assertRange('longitude', observer.longitudeDegrees, -180, 180);
  assertFinite('right ascension', equatorial.rightAscensionDegrees);

  const localSiderealTime = normalizeDegrees(
    greenwichMeanSiderealTimeDegrees(observedAt) + observer.longitudeDegrees,
  );
  const hourAngle = toRadians(
    localSiderealTime - normalizeDegrees(equatorial.rightAscensionDegrees),
  );
  const declination = toRadians(equatorial.declinationDegrees);
  const latitude = toRadians(observer.latitudeDegrees);

  const sinAltitude = clamp(
    Math.sin(declination) * Math.sin(latitude) +
      Math.cos(declination) * Math.cos(latitude) * Math.cos(hourAngle),
  );

  const y = -Math.sin(hourAngle) * Math.cos(declination);
  const x =
    Math.sin(declination) * Math.cos(latitude) -
    Math.cos(declination) * Math.sin(latitude) * Math.cos(hourAngle);
  const atZenithOrNadir =
    Math.abs(x) < Number.EPSILON && Math.abs(y) < Number.EPSILON;

  return {
    altitudeDegrees: toDegrees(Math.asin(sinAltitude)),
    azimuthDegrees: atZenithOrNadir
      ? 0
      : normalizeDegrees(toDegrees(Math.atan2(y, x))),
  };
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

// Low-precision solar coordinates from the Astronomical Almanac
// (about 0.01 degree between 1950 and 2050).
export function sunEquatorial(date: Date): EquatorialCoordinates {
  const days = toJulianDate(date) - JULIAN_DATE_J2000;
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * days);
  const meanAnomaly = toRadians(normalizeDegrees(357.528 + 0.9856003 * days));
  const eclipticLongitude = toRadians(
    meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly),
  );
  const obliquity = toRadians(23.439 - 0.0000004 * days);

  return {
    rightAscensionDegrees: normalizeDegrees(
      toDegrees(
        Math.atan2(
          Math.cos(obliquity) * Math.sin(eclipticLongitude),
          Math.cos(eclipticLongitude),
        ),
      ),
    ),
    declinationDegrees: toDegrees(
      Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)),
    ),
  };
}

export function sunHorizontal(
  date: Date,
  observer: ObserverLocation,
): HorizontalCoordinates {
  return equatorialToHorizontal(sunEquatorial(date), date, observer);
}

// Standard horizon for stars: true altitude when refraction lifts the object
// onto the visible horizon.
export const STANDARD_HORIZON_DEGREES = -0.5667;

const SIDEREAL_DEGREES_PER_DAY = 360.98564736629;

export type HorizonStatus = 'rises-and-sets' | 'always-above' | 'always-below';

export interface FixedRiseTransitSet {
  status: HorizonStatus;
  events: RiseTransitSetEvent[];
}

// Analytic rise, transit and set for an object with fixed RA/Dec, within
// [from, to]. Transit is the upper culmination, reported for every status.
export function fixedRiseTransitSet(
  equatorial: EquatorialCoordinates,
  from: Date,
  to: Date,
  observer: ObserverLocation,
  horizonDegrees = STANDARD_HORIZON_DEGREES,
): FixedRiseTransitSet {
  const latitude = toRadians(observer.latitudeDegrees);
  const declination = toRadians(equatorial.declinationDegrees);
  const denominator = Math.cos(latitude) * Math.cos(declination);
  const numerator =
    Math.sin(toRadians(horizonDegrees)) -
    Math.sin(latitude) * Math.sin(declination);
  // At the poles every object keeps a constant altitude.
  const cosHourAngle =
    Math.abs(denominator) < 1e-12
      ? numerator > 0 ? 2 : -2
      : numerator / denominator;

  const status: HorizonStatus =
    cosHourAngle < -1
      ? 'always-above'
      : cosHourAngle > 1
        ? 'always-below'
        : 'rises-and-sets';

  const localSiderealTime = normalizeDegrees(
    greenwichMeanSiderealTimeDegrees(from) + observer.longitudeDegrees,
  );
  const dayMs = (360 / SIDEREAL_DEGREES_PER_DAY) * MILLISECONDS_PER_DAY;
  const firstTransit =
    from.getTime() +
    (normalizeDegrees(equatorial.rightAscensionDegrees - localSiderealTime) /
      SIDEREAL_DEGREES_PER_DAY) *
      MILLISECONDS_PER_DAY;
  const halfArcMs =
    status === 'rises-and-sets'
      ? (toDegrees(Math.acos(cosHourAngle)) / SIDEREAL_DEGREES_PER_DAY) *
        MILLISECONDS_PER_DAY
      : null;

  const candidates: { type: RiseTransitSetType; at: number }[] = [];

  for (const cycle of [-1, 0, 1]) {
    const transit = firstTransit + cycle * dayMs;
    candidates.push({ type: 'transit', at: transit });

    if (halfArcMs !== null) {
      candidates.push({ type: 'rise', at: transit - halfArcMs });
      candidates.push({ type: 'set', at: transit + halfArcMs });
    }
  }

  const events = candidates
    .filter(({ at }) => at >= from.getTime() && at <= to.getTime())
    .sort((left, right) => left.at - right.at)
    .map(({ type, at }) => {
      const instant = new Date(Math.round(at));
      const horizontal = equatorialToHorizontal(equatorial, instant, observer);

      return {
        type,
        at: instant.toISOString(),
        azimuthDegrees: horizontal.azimuthDegrees,
        altitudeDegrees: horizontal.altitudeDegrees,
      };
    });

  return { status, events };
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('date must be valid');
  }
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function assertRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void {
  assertFinite(name, value);

  if (value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  }
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
