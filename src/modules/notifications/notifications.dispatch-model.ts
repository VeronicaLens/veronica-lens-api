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

// Service-role access: the dispatcher reads across users and writes the
// delivery ledger, which no client role can touch.
export class SupabaseDispatchModel implements DispatchModelPort {
  constructor(private readonly client: DispatchClient) {}

  async findUpcomingEvents(from: Date, until: Date): Promise<EventRow[]> {
    const { data, error } = await this.client
      .from('astronomical_events')
      .select('id, title, event_type, starts_at')
      .eq('published', true)
      .gte('starts_at', from.toISOString())
      .lte('starts_at', until.toISOString());

    assertNoError(error);
    return (data ?? []) as EventRow[];
  }

  async findEnabledPreferences(eventTypes: string[]): Promise<PreferenceRow[]> {
    const { data, error } = await this.client
      .from('event_preferences')
      .select('user_id, event_type, lead_minutes')
      .eq('enabled', true)
      .in('event_type', eventTypes);

    assertNoError(error);
    return (data ?? []) as PreferenceRow[];
  }

  async findActiveTokens(userIds: string[]): Promise<ActiveTokenRow[]> {
    const { data, error } = await this.client
      .from('device_push_tokens')
      .select('id, user_id, token, platform')
      .eq('active', true)
      .in('user_id', userIds);

    assertNoError(error);
    return (data ?? []) as ActiveTokenRow[];
  }

  // Upsert with ignoreDuplicates returns only rows inserted now. A delivery
  // already in the ledger is never sent again.
  async insertPendingDeliveries(rows: NewDelivery[]): Promise<DeliveryRow[]> {
    if (rows.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from('notification_deliveries')
      .upsert(rows, {
        onConflict: 'astronomical_event_id,device_push_token_id',
        ignoreDuplicates: true,
      })
      .select('id, astronomical_event_id, device_push_token_id');

    assertNoError(error);
    return (data ?? []) as DeliveryRow[];
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

    const { error } = await this.client
      .from('device_push_tokens')
      .update({ active: false })
      .in('id', tokenIds);

    assertNoError(error);
  }
}
