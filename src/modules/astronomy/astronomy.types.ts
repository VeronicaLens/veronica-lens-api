export interface ObserverLocation {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters: number;
}

export interface EquatorialCoordinates {
  rightAscensionDegrees: number;
  declinationDegrees: number;
}

// Azimuth is measured eastward from true north (N=0, E=90).
export interface HorizontalCoordinates {
  altitudeDegrees: number;
  azimuthDegrees: number;
}

export interface ApparentPosition {
  observedAt: string;
  equatorial: EquatorialCoordinates;
  horizontal: HorizontalCoordinates;
}

export interface EphemerisRequest {
  providerObjectId: string;
  observedAt: Date;
  observer: ObserverLocation;
}

export type RiseTransitSetType = 'rise' | 'transit' | 'set';

export interface RiseTransitSetEvent {
  type: RiseTransitSetType;
  at: string;
  azimuthDegrees: number;
  altitudeDegrees: number;
}

export interface RiseTransitSetRequest {
  providerObjectId: string;
  from: Date;
  to: Date;
  observer: ObserverLocation;
}

// Port for moving bodies. Vendor payloads never cross this boundary.
export interface EphemerisProviderPort {
  getApparentPosition(request: EphemerisRequest): Promise<ApparentPosition>;
  getRiseTransitSet(request: RiseTransitSetRequest): Promise<RiseTransitSetEvent[]>;
}

export class AstronomyProviderError extends Error {
  constructor(
    readonly code: 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'REJECTED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AstronomyProviderError';
  }
}
