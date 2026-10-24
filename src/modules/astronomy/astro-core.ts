import type {
  EquatorialCoordinates,
  HorizontalCoordinates,
  ObserverLocation,
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
