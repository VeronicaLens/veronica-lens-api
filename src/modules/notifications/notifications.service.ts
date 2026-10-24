import type { PostgrestError } from '@supabase/supabase-js';

import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { throwIfTokenRejected } from '../../shared/supabase/postgrest-errors.js';
import type {
  ActiveTokenRow,
  DispatchModelPort,
  EventRow,
  NewDelivery,
} from './notifications.dispatch-model.js';
import type { DeviceModelPort } from './notifications.model.js';
import {
  EXPO_PUSH_CHUNK_SIZE,
  type PushMessage,
  type PushSender,
  type PushTicket,
} from './expo-push.client.js';
import { expoPushTokenSchema, type RegisterDeviceInput } from './notifications.schemas.js';
import type { DeviceRegistration, DispatchSummary } from './notifications.types.js';

// Largest lead time allowed by event_preferences.lead_minutes (30 days).
const MAX_LEAD_MINUTES = 43_200;
const MINUTE_MS = 60_000;

const PUSH_TITLE = 'Veronica Lens';

function throwDeviceError(error: PostgrestError): never {
  throwIfTokenRejected(error);

  // RLS rejects a token already registered to another account.
  if (error.code === '42501') {
    throw new AppError(
      409,
      'DEVICE_TOKEN_IN_USE',
      'Push token is registered to another account',
    );
  }

  logger.error({ providerCode: error.code }, 'Device token error');

  throw new AppError(
    503,
    'NOTIFICATIONS_UNAVAILABLE',
    'Notifications are temporarily unavailable',
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }

  return groups;
}

function emptySummary(): DispatchSummary {
  return {
    events: 0,
    recipients: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    deactivatedTokens: 0,
  };
}

export class NotificationsService {
  constructor(
    private readonly devices: DeviceModelPort,
    private readonly dispatch: DispatchModelPort,
    private readonly sender: PushSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async registerDevice(
    auth: AuthContext,
    input: RegisterDeviceInput,
  ): Promise<DeviceRegistration> {
    const { row, error } = await this.devices.registerDevice(
      auth.accessToken,
      auth.user.id,
      input,
    );

    if (error) throwDeviceError(error);

    if (row === null) {
      throw new AppError(
        503,
        'NOTIFICATIONS_UNAVAILABLE',
        'Notifications are temporarily unavailable',
      );
    }

    return row;
  }

  async removeDevice(auth: AuthContext, token: string): Promise<void> {
    // A malformed token cannot be stored, so there is nothing to delete.
    const parsed = expoPushTokenSchema.safeParse(token);

    if (!parsed.success) return;

    const { error } = await this.devices.removeDevice(auth.accessToken, parsed.data);

    if (error) throwDeviceError(error);
  }

  // Sends each due event once per device. The delivery ledger makes repeat
  // runs safe: a pair that already has a row is skipped.
  async dispatchDueNotifications(): Promise<DispatchSummary> {
    const now = this.now();
    const summary = emptySummary();

    const events = await this.dispatch.findUpcomingEvents(
      now,
      new Date(now.getTime() + MAX_LEAD_MINUTES * MINUTE_MS),
    );

    if (events.length === 0) return summary;
    summary.events = events.length;

    const preferences = await this.dispatch.findEnabledPreferences(
      [...new Set(events.map((event) => event.event_type))],
    );
    const eventsByType = groupBy(events, (event) => event.event_type);

    const recipients = new Map<string, Set<string>>();
    for (const preference of preferences) {
      const dueFrom = preference.lead_minutes * MINUTE_MS;

      for (const event of eventsByType.get(preference.event_type) ?? []) {
        const startsAt = new Date(event.starts_at).getTime();

        if (now.getTime() < startsAt - dueFrom) continue;

        const set = recipients.get(event.id) ?? new Set<string>();
        set.add(preference.user_id);
        recipients.set(event.id, set);
      }
    }

    const userIds = [...new Set([...recipients.values()].flatMap((set) => [...set]))];
    if (userIds.length === 0) return summary;

    const tokens = await this.dispatch.findActiveTokens(userIds);
    const tokensByUser = groupBy(tokens, (token) => token.user_id);
    const eventById = new Map(events.map((event) => [event.id, event]));
    const tokenById = new Map(tokens.map((token) => [token.id, token]));

    const candidates: NewDelivery[] = [];
    for (const [eventId, userSet] of recipients) {
      for (const userId of userSet) {
        for (const token of tokensByUser.get(userId) ?? []) {
          candidates.push({
            astronomical_event_id: eventId,
            device_push_token_id: token.id,
            user_id: userId,
          });
        }
      }
    }

    summary.recipients = candidates.length;

    const inserted = await this.dispatch.insertPendingDeliveries(candidates);
    summary.attempted = inserted.length;

    const outbox = inserted.flatMap((row) => {
      const event = eventById.get(row.astronomical_event_id);
      const token = tokenById.get(row.device_push_token_id);

      return event && token ? [{ deliveryId: row.id, event, token }] : [];
    });

    for (let offset = 0; offset < outbox.length; offset += EXPO_PUSH_CHUNK_SIZE) {
      const chunk = outbox.slice(offset, offset + EXPO_PUSH_CHUNK_SIZE);
      await this.sendChunk(chunk, summary);
    }

    return summary;
  }

  private async sendChunk(
    chunk: { deliveryId: string; event: EventRow; token: ActiveTokenRow }[],
    summary: DispatchSummary,
  ): Promise<void> {
    const messages: PushMessage[] = chunk.map(({ event, token }) => ({
      to: token.token,
      title: PUSH_TITLE,
      body: event.title,
      data: { eventId: event.id },
    }));

    let tickets: PushTicket[];

    try {
      tickets = await this.sender.send(messages);
    } catch (error) {
      logger.error(
        { errorType: error instanceof Error ? error.name : 'unknown' },
        'Expo push request failed',
      );

      for (const { deliveryId } of chunk) {
        await this.markFailed(deliveryId, 'EXPO_UNAVAILABLE', 'Expo push request failed', summary);
      }
      return;
    }

    for (let index = 0; index < chunk.length; index += 1) {
      const item = chunk[index];
      if (item === undefined) continue;

      const { deliveryId, token } = item;
      const ticket = tickets[index];

      if (ticket?.status === 'ok') {
        await this.dispatch.markDeliverySent(deliveryId, ticket.id, this.now());
        summary.sent += 1;
        continue;
      }

      if (ticket?.status !== 'error') {
        await this.markFailed(deliveryId, 'EXPO_INVALID_RESPONSE', 'Missing push ticket', summary);
        continue;
      }

      const code = ticket.details?.error ?? 'EXPO_ERROR';

      // Expo reports the token as gone; stop sending to it.
      if (code === 'DeviceNotRegistered') {
        await this.dispatch.deactivateTokens([token.id]);
        summary.deactivatedTokens += 1;
      }

      await this.markFailed(deliveryId, code, ticket.message, summary);
    }
  }

  private async markFailed(
    deliveryId: string,
    code: string,
    message: string,
    summary: DispatchSummary,
  ): Promise<void> {
    await this.dispatch.markDeliveryFailed(deliveryId, code, message, this.now());
    summary.failed += 1;
  }
}
