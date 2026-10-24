import type { PostgrestError } from '@supabase/supabase-js';

import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { throwIfTokenRejected } from '../../shared/supabase/postgrest-errors.js';
import type { EventRow, EventsModelPort } from './events.model.js';
import { MAX_EVENTS_RANGE_MS, type ListEventsQuery } from './events.schemas.js';
import type { AstronomicalEvent } from './events.types.js';

const DEFAULT_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;

export interface EventsListResponse {
  from: string;
  to: string;
  events: AstronomicalEvent[];
}

function throwEventsError(error: PostgrestError): never {
  throwIfTokenRejected(error);
  logger.error({ providerCode: error.code }, 'Events provider error');

  throw new AppError(
    503,
    'EVENTS_UNAVAILABLE',
    'Astronomical events are temporarily unavailable',
  );
}

function toEvent(row: EventRow): AstronomicalEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    type: row.event_type,
    celestialObjectName: row.celestial_object_name,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: row.ends_at === null ? null : new Date(row.ends_at).toISOString(),
    peaksAt: row.peaks_at === null ? null : new Date(row.peaks_at).toISOString(),
  };
}

export class EventsService {
  constructor(
    private readonly model: EventsModelPort,
    private readonly now: () => number = Date.now,
  ) {}

  async list(auth: AuthContext, query: ListEventsQuery): Promise<EventsListResponse> {
    const from = query.from === undefined ? new Date(this.now()) : new Date(query.from);
    const to =
      query.to === undefined
        ? new Date(from.getTime() + DEFAULT_RANGE_MS)
        : new Date(query.to);
    const range = to.getTime() - from.getTime();

    if (range <= 0 || range > MAX_EVENTS_RANGE_MS) {
      throw new AppError(
        400,
        'EVENTS_RANGE_INVALID',
        'The range must end after it starts and span at most one year',
      );
    }

    const result = await this.model.findMany(auth.accessToken, {
      from,
      to,
      limit: query.limit,
      ...(query.type !== undefined && { type: query.type }),
    });

    if (result.error) {
      throwEventsError(result.error);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      events: result.events.map(toEvent),
    };
  }

  async getById(auth: AuthContext, id: string): Promise<AstronomicalEvent> {
    const result = await this.model.findById(auth.accessToken, id);

    if (result.error) {
      throwEventsError(result.error);
    }

    if (!result.event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Astronomical event was not found');
    }

    return toEvent(result.event);
  }
}
