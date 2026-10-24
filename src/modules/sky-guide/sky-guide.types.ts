import type { HorizontalCoordinates } from '../astronomy/index.js';
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
