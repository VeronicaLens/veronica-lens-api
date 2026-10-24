import type {
  PostgrestError,
  SupabaseClient,
} from '@supabase/supabase-js';

import type { DevicePlatform } from './notifications.types.js';

export interface EventRow {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
}

export interface PreferenceRow {
  user_id: string;
  event_type: string;
  lead_minutes: number;
}

export interface ActiveTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: DevicePlatform;
}

export interface DeliveryRow {
  id: string;
  astronomical_event_id: string;
  device_push_token_id: string;
}

export interface NewDelivery {
  astronomical_event_id: string;
  device_push_token_id: string;
  user_id: string;
}

export interface DispatchModelPort {
  findUpcomingEvents(from: Date, until: Date): Promise<EventRow[]>;
  findEnabledPreferences(eventTypes: string[]): Promise<PreferenceRow[]>;
  findActiveTokens(userIds: string[]): Promise<ActiveTokenRow[]>;
  insertPendingDeliveries(rows: NewDelivery[]): Promise<DeliveryRow[]>;
  markDeliverySent(id: string, ticketId: string, at: Date): Promise<void>;
  markDeliveryFailed(id: string, code: string, message: string, at: Date): Promise<void>;
  deactivateTokens(tokenIds: string[]): Promise<void>;
}

export type DispatchClient = Pick<SupabaseClient, 'from'>;

// Throws so a failed query aborts the whole dispatch run before any send.
function assertNoError(error: PostgrestError | null): void {
  if (error) {
    throw new Error(`Dispatch query failed: ${error.code}`);
  }
}

// PostgREST truncates responses at max_rows (1000 by default) without an
// error, so reads page until an empty page. Advancing by the rows actually
// received stays correct even when the project cap is lower than PAGE_SIZE.
const PAGE_SIZE = 1000;
// Keeps `in()` filters short enough for the request URL.
const IN_CHUNK_SIZE = 100;
const INSERT_CHUNK_SIZE = 500;

type PageQuery = (
  from: number,
  to: number,
) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;

async function selectAllPages<T>(query: PageQuery): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    assertNoError(error);

    const page = (data ?? []) as T[];
    if (page.length === 0) return rows;

    rows.push(...page);
    from += page.length;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let offset = 0; offset < items.length; offset += size) {
    batches.push(items.slice(offset, offset + size));
  }

  return batches;
}

// Service-role access: the dispatcher reads across users and writes the
// delivery ledger, which no client role can touch.
export class SupabaseDispatchModel implements DispatchModelPort {
  constructor(private readonly client: DispatchClient) {}

  async findUpcomingEvents(from: Date, until: Date): Promise<EventRow[]> {
    return selectAllPages<EventRow>((rangeFrom, rangeTo) =>
      this.client
        .from('astronomical_events')
        .select('id, title, event_type, starts_at')
        .eq('published', true)
        .gte('starts_at', from.toISOString())
        .lte('starts_at', until.toISOString())
        .order('id')
        .range(rangeFrom, rangeTo),
    );
  }

  async findEnabledPreferences(eventTypes: string[]): Promise<PreferenceRow[]> {
    const rows: PreferenceRow[] = [];

    for (const types of chunk(eventTypes, IN_CHUNK_SIZE)) {
      rows.push(
        ...(await selectAllPages<PreferenceRow>((rangeFrom, rangeTo) =>
          this.client
            .from('event_preferences')
            .select('user_id, event_type, lead_minutes')
            .eq('enabled', true)
            .in('event_type', types)
            .order('user_id')
            .order('event_type')
            .range(rangeFrom, rangeTo),
        )),
      );
    }

    return rows;
  }

  async findActiveTokens(userIds: string[]): Promise<ActiveTokenRow[]> {
    const rows: ActiveTokenRow[] = [];

    for (const ids of chunk(userIds, IN_CHUNK_SIZE)) {
      rows.push(
        ...(await selectAllPages<ActiveTokenRow>((rangeFrom, rangeTo) =>
          this.client
            .from('device_push_tokens')
            .select('id, user_id, token, platform')
            .eq('active', true)
            .in('user_id', ids)
            .order('id')
            .range(rangeFrom, rangeTo),
        )),
      );
    }

    return rows;
  }

  // Upsert with ignoreDuplicates returns only rows inserted now. A delivery
  // already in the ledger is never sent again.
  async insertPendingDeliveries(rows: NewDelivery[]): Promise<DeliveryRow[]> {
    const inserted: DeliveryRow[] = [];

    for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
      const { data, error } = await this.client
        .from('notification_deliveries')
        .upsert(batch, {
          onConflict: 'astronomical_event_id,device_push_token_id',
          ignoreDuplicates: true,
        })
        .select('id, astronomical_event_id, device_push_token_id');

      assertNoError(error);
      inserted.push(...((data ?? []) as DeliveryRow[]));
    }

    return inserted;
  }

  async markDeliverySent(id: string, ticketId: string, at: Date): Promise<void> {
    const { error } = await this.client
      .from('notification_deliveries')
      .update({
        status: 'sent',
        provider_ticket_id: ticketId,
        delivered_at: at.toISOString(),
      })
      .eq('id', id);

    assertNoError(error);
  }

  async markDeliveryFailed(
    id: string,
    code: string,
    message: string,
    at: Date,
  ): Promise<void> {
    const { error } = await this.client
      .from('notification_deliveries')
      .update({
        status: 'failed',
        error_code: code,
        error_message: message.slice(0, 500),
        failed_at: at.toISOString(),
      })
      .eq('id', id);

    assertNoError(error);
  }

  async deactivateTokens(tokenIds: string[]): Promise<void> {
    if (tokenIds.length === 0) {
      return;
    }

    for (const ids of chunk(tokenIds, IN_CHUNK_SIZE)) {
      const { error } = await this.client
        .from('device_push_tokens')
        .update({ active: false })
        .in('id', ids);

      assertNoError(error);
    }
  }
}
