export const CELESTIAL_OBJECT_TYPES = [
  'moon',
  'planet',
  'star',
  'constellation',
] as const;

export type CelestialObjectType = (typeof CELESTIAL_OBJECT_TYPES)[number];

// Fixed objects use J2000 equatorial coordinates in degrees.
export interface FixedCoordinates {
  kind: 'fixed';
  epoch: 'J2000';
  rightAscensionDegrees: number;
  declinationDegrees: number;
}

// Solar System bodies move; positions come from JPL Horizons by object id.
export interface EphemerisCoordinates {
  kind: 'ephemeris';
  provider: 'jpl-horizons';
  providerObjectId: string;
}

export type CelestialCoordinates = FixedCoordinates | EphemerisCoordinates;

export interface CelestialObject {
  id: string;
  name: string;
  type: CelestialObjectType;
  aliases: string[];
  magnitude: number | null;
  coordinates: CelestialCoordinates;
}
