import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import {
  AstronomyProviderError,
  equatorialToHorizontal,
  type EphemerisProviderPort,
  type HorizontalCoordinates,
  type ObserverLocation,
} from '../astronomy/index.js';
import type { CatalogModelPort } from '../catalog/catalog.model.js';
import type { CelestialObject } from '../catalog/catalog.types.js';
import type { SkyPositionsInput } from './sky-guide.schemas.js';
import type {
  SkyObjectPosition,
  SkyPositionsResult,
  UnavailableObject,
} from './sky-guide.types.js';

const MAX_TIME_OFFSET_MS = 366 * 24 * 60 * 60 * 1_000;

type Outcome =
  | { kind: 'position'; position: SkyObjectPosition }
  | { kind: 'unavailable'; entry: UnavailableObject };

export class SkyGuideService {
  constructor(
    private readonly catalog: CatalogModelPort,
    private readonly ephemeris: EphemerisProviderPort,
    private readonly now: () => number = Date.now,
  ) {}

  async getPositions(input: SkyPositionsInput): Promise<SkyPositionsResult> {
    const observedAt = this.resolveInstant(input.observedAt);

    const outcomes = await Promise.all(
      input.objectIds.map((id) =>
        this.locate(id, observedAt, input.observer),
      ),
    );

    return {
      observedAt: observedAt.toISOString(),
      positions: outcomes.flatMap((outcome) =>
        outcome.kind === 'position' ? [outcome.position] : [],
      ),
      unavailable: outcomes.flatMap((outcome) =>
        outcome.kind === 'unavailable' ? [outcome.entry] : [],
      ),
    };
  }

  private resolveInstant(value: string | undefined): Date {
    const now = this.now();
    const instant = value === undefined ? new Date(now) : new Date(value);

    if (Math.abs(instant.getTime() - now) > MAX_TIME_OFFSET_MS) {
      throw new AppError(
        400,
        'OBSERVATION_TIME_OUT_OF_RANGE',
        'Observation time must be within one year from now',
      );
    }

    return instant;
  }

  private async locate(
    id: string,
    observedAt: Date,
    observer: ObserverLocation,
  ): Promise<Outcome> {
    const object = await this.catalog.findById(id);

    if (!object) {
      return { kind: 'unavailable', entry: { id, reason: 'NOT_FOUND' } };
    }

    try {
      const horizontal = await this.horizontalOf(object, observedAt, observer);

      return {
        kind: 'position',
        position: {
          id: object.id,
          name: object.name,
          type: object.type,
          magnitude: object.magnitude,
          horizontal,
          aboveHorizon: horizontal.altitudeDegrees > 0,
        },
      };
    } catch (error) {
      if (!(error instanceof AstronomyProviderError)) {
        throw error;
      }

      logger.warn(
        { objectId: object.id, providerCode: error.code },
        'Ephemeris provider failed for object',
      );

      return {
        kind: 'unavailable',
        entry: { id: object.id, reason: 'PROVIDER_UNAVAILABLE' },
      };
    }
  }

  private async horizontalOf(
    object: CelestialObject,
    observedAt: Date,
    observer: ObserverLocation,
  ): Promise<HorizontalCoordinates> {
    const { coordinates } = object;

    if (coordinates.kind === 'fixed') {
      return equatorialToHorizontal(coordinates, observedAt, observer);
    }

    const position = await this.ephemeris.getApparentPosition({
      providerObjectId: coordinates.providerObjectId,
      observedAt,
      observer,
    });

    return position.horizontal;
  }
}
