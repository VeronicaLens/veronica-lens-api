import type {
  HorizonStatus,
  HorizontalCoordinates,
  RiseTransitSetEvent,
} from '../astronomy/index.js';
import type { CelestialObjectType } from '../catalog/catalog.types.js';

export interface SkyObjectPosition {
  id: string;
  name: string;
  type: CelestialObjectType;
  magnitude: number | null;
  horizontal: HorizontalCoordinates;
  aboveHorizon: boolean;
}

export interface UnavailableObject {
  id: string;
  reason: 'NOT_FOUND' | 'PROVIDER_UNAVAILABLE';
}

export interface SkyPositionsResult {
  observedAt: string;
  positions: SkyObjectPosition[];
  unavailable: UnavailableObject[];
}

export interface ObjectRiseSet {
  id: string;
  name: string;
  type: CelestialObjectType;
  // Null when the provider returned no event to infer it from.
  horizon: HorizonStatus | null;
  events: RiseTransitSetEvent[];
}

export interface RiseSetResult {
  from: string;
  to: string;
  objects: ObjectRiseSet[];
  unavailable: UnavailableObject[];
}
