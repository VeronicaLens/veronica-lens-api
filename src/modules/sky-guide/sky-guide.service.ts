import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import {
  AstronomyProviderError,
  equatorialToHorizontal,
  fixedRiseTransitSet,
  type EphemerisProviderPort,
  type HorizonStatus,
  type HorizontalCoordinates,
  type ObserverLocation,
  type RiseTransitSetEvent,
} from '../astronomy/index.js';
import type { CatalogModelPort } from '../catalog/catalog.model.js';
import type { CelestialObject } from '../catalog/catalog.types.js';
import type { RiseSetInput, SkyPositionsInput } from './sky-guide.schemas.js';
import type {
  ObjectRiseSet,
  RiseSetResult,
  SkyObjectPosition,
  SkyPositionsResult,
  UnavailableObject,
} from './sky-guide.types.js';

const MAX_TIME_OFFSET_MS = 366 * 24 * 60 * 60 * 1_000;
const RISE_SET_WINDOW_MS = 24 * 60 * 60 * 1_000;

type Outcome<T> =
  | { kind: 'found'; value: T }
  | { kind: 'unavailable'; entry: UnavailableObject };

function split<T>(outcomes: Outcome<T>[]): {
  found: T[];
  unavailable: UnavailableObject[];
} {
  return {
    found: outcomes.flatMap((o) => (o.kind === 'found' ? [o.value] : [])),
    unavailable: outcomes.flatMap((o) => (o.kind === 'unavailable' ? [o.entry] : [])),
  };
}

// Moving bodies: rise or set in the window means it crosses the horizon;
// otherwise the transit altitude tells on which side it stays.
function horizonFromEvents(events: RiseTransitSetEvent[]): HorizonStatus | null {
  if (events.some((event) => event.type !== 'transit')) {
    return 'rises-and-sets';
  }

  const transit = events.find((event) => event.type === 'transit');

  if (!transit) {
    return null;
  }

  return transit.altitudeDegrees > 0 ? 'always-above' : 'always-below';
}

export class SkyGuideService {
  constructor(
    private readonly catalog: CatalogModelPort,
    private readonly ephemeris: EphemerisProviderPort,
    private readonly now: () => number = Date.now,
  ) {}

  async getPositions(input: SkyPositionsInput): Promise<SkyPositionsResult> {
    const observedAt = this.resolveInstant(input.observedAt);

    const { found, unavailable } = split(
      await Promise.all(
        input.objectIds.map((id) =>
          this.withObject(id, (object) =>
            this.positionOf(object, observedAt, input.observer),
          ),
        ),
      ),
    );

    return { observedAt: observedAt.toISOString(), positions: found, unavailable };
  }

  async getRiseSet(input: RiseSetInput): Promise<RiseSetResult> {
    const from = this.resolveInstant(input.from);
    const to = new Date(from.getTime() + RISE_SET_WINDOW_MS);

    const { found, unavailable } = split(
      await Promise.all(
        input.objectIds.map((id) =>
          this.withObject(id, (object) =>
            this.riseSetOf(object, from, to, input.observer),
          ),
        ),
      ),
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      objects: found,
      unavailable,
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

  // Resolves the catalog object and turns provider failures into
  // `unavailable` entries, so one object never fails the whole request.
  private async withObject<T>(
    id: string,
    compute: (object: CelestialObject) => Promise<T>,
  ): Promise<Outcome<T>> {
    const object = await this.catalog.findById(id);

    if (!object) {
      return { kind: 'unavailable', entry: { id, reason: 'NOT_FOUND' } };
    }

    try {
      return { kind: 'found', value: await compute(object) };
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

  private async positionOf(
    object: CelestialObject,
    observedAt: Date,
    observer: ObserverLocation,
  ): Promise<SkyObjectPosition> {
    const horizontal = await this.horizontalOf(object, observedAt, observer);

    return {
      id: object.id,
      name: object.name,
      type: object.type,
      magnitude: object.magnitude,
      horizontal,
      aboveHorizon: horizontal.altitudeDegrees > 0,
    };
  }

  private async riseSetOf(
    object: CelestialObject,
    from: Date,
    to: Date,
    observer: ObserverLocation,
  ): Promise<ObjectRiseSet> {
    const base = { id: object.id, name: object.name, type: object.type };
    const { coordinates } = object;

    if (coordinates.kind === 'fixed') {
      const { status, events } = fixedRiseTransitSet(coordinates, from, to, observer);

      return { ...base, horizon: status, events };
    }

    const events = await this.ephemeris.getRiseTransitSet({
      providerObjectId: coordinates.providerObjectId,
      from,
      to,
      observer,
    });

    return { ...base, horizon: horizonFromEvents(events), events };
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
