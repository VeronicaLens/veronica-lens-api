import type {
  PostgrestError,
  SupabaseClient,
} from '@supabase/supabase-js';

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  event_type: string;
  celestial_object_name: string | null;
  starts_at: string;
  ends_at: string | null;
  peaks_at: string | null;
}

export interface EventsFilter {
  from: Date;
  to: Date;
  type?: string;
  limit: number;
}

export interface EventsListResult {
  events: EventRow[];
  error: PostgrestError | null;
}

export interface EventResult {
  event: EventRow | null;
  error: PostgrestError | null;
}

export interface EventsModelPort {
  findMany(accessToken: string, filter: EventsFilter): Promise<EventsListResult>;
  findById(accessToken: string, id: string): Promise<EventResult>;
}

export type EventsClient = Pick<SupabaseClient, 'from'>;

const EVENT_COLUMNS =
  'id, slug, title, description, event_type, celestial_object_name, starts_at, ends_at, peaks_at';

// Curated events only: rows written by the legacy per-location sync job
// (provider <> 'manual') are never exposed. RLS also requires `published`
// for regular users; the explicit filter keeps admins on the same list.
export class SupabaseEventsModel implements EventsModelPort {
  constructor(
    private readonly createClient: (accessToken: string) => EventsClient,
  ) {}

  async findMany(
    accessToken: string,
    filter: EventsFilter,
  ): Promise<EventsListResult> {
    const from = filter.from.toISOString();
    let query = this.createClient(accessToken)
      .from('astronomical_events')
      .select(EVENT_COLUMNS)
      .eq('provider', 'manual')
      .eq('published', true)
      .lte('starts_at', filter.to.toISOString())
      // Overlaps the window: still running at `from`, or starting after it.
      .or(`ends_at.gte."${from}",and(ends_at.is.null,starts_at.gte."${from}")`);

    if (filter.type !== undefined) {
      query = query.eq('event_type', filter.type);
    }

    const { data, error } = await query
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(filter.limit);

    return { events: (data ?? []) as EventRow[], error };
  }

  async findById(accessToken: string, id: string): Promise<EventResult> {
    const { data, error } = await this.createClient(accessToken)
      .from('astronomical_events')
      .select(EVENT_COLUMNS)
      .eq('id', id)
      .eq('provider', 'manual')
      .eq('published', true)
      .maybeSingle<EventRow>();

    return { event: data, error };
  }
}
