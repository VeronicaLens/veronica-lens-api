import type { PostgrestError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { AuthContext } from '../../src/shared/auth/auth-context.js';
import type { ActiveTokenRow, EventRow, PreferenceRow } from '../../src/modules/notifications/notifications.dispatch-model.js';
import { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import {
  createDeviceModelMock,
  createDispatchModelMock,
  createPushSenderMock,
} from '../helpers/mocks.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-05-01T12:00:00.000Z');
const EVENT_TYPE = 'meteor_shower';

const auth: AuthContext = {
  accessToken: 'test-access-token',
  user: { id: USER_ID, email: 'user@example.com', displayName: null },
};

const TOKEN = 'ExponentPushToken[abc123]';

function postgrestError(code: string): PostgrestError {
  return { name: 'PostgrestError', code, message: 'details', details: '', hint: '' } as PostgrestError;
}

function eventAt(minutesFromNow: number, id = 'event-1'): EventRow {
  return {
    id,
    title: 'Chuva de meteoros',
    event_type: EVENT_TYPE,
    starts_at: new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString(),
  };
}

function preference(leadMinutes: number, userId = USER_ID): PreferenceRow {
  return { user_id: userId, event_type: EVENT_TYPE, lead_minutes: leadMinutes };
}

function token(id: string, userId = USER_ID, value = TOKEN): ActiveTokenRow {
  return { id, user_id: userId, token: value, platform: 'android' };
}

function setup() {
  const devices = createDeviceModelMock();
  const dispatch = createDispatchModelMock();
  const sender = createPushSenderMock();
  const service = new NotificationsService(devices, dispatch, sender, () => NOW);

  // Each candidate pair gets a ledger row whose id encodes the pair.
  dispatch.insertPendingDeliveries.mockImplementation(async (rows) =>
    rows.map((row) => ({
      id: `delivery-${row.astronomical_event_id}-${row.device_push_token_id}`,
      astronomical_event_id: row.astronomical_event_id,
      device_push_token_id: row.device_push_token_id,
    })),
  );
  dispatch.markDeliverySent.mockResolvedValue(undefined);
  dispatch.markDeliveryFailed.mockResolvedValue(undefined);
  dispatch.deactivateTokens.mockResolvedValue(undefined);

  return { devices, dispatch, sender, service };
}

describe('NotificationsService.registerDevice', () => {
  it('returns the registered device for the caller', async () => {
    const { devices, service } = setup();
    const device = { id: 'device-1', token: TOKEN, platform: 'android' as const, active: true };
    devices.registerDevice.mockResolvedValue({ row: device, error: null });

    const result = await service.registerDevice(auth, { token: TOKEN, platform: 'android' });

    expect(result).toEqual(device);
    expect(devices.registerDevice).toHaveBeenCalledWith('test-access-token', USER_ID, {
      token: TOKEN,
      platform: 'android',
    });
  });

  it('maps a token registered to another account to 409', async () => {
    const { devices, service } = setup();
    devices.registerDevice.mockResolvedValue({ row: null, error: postgrestError('42501') });

    await expect(
      service.registerDevice(auth, { token: TOKEN, platform: 'ios' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'DEVICE_TOKEN_IN_USE' });
  });

  it('maps an rejected access token to 401', async () => {
    const { devices, service } = setup();
    devices.registerDevice.mockResolvedValue({ row: null, error: postgrestError('PGRST301') });

    await expect(
      service.registerDevice(auth, { token: TOKEN, platform: 'ios' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('maps other database errors to 503', async () => {
    const { devices, service } = setup();
    devices.registerDevice.mockResolvedValue({ row: null, error: postgrestError('XX000') });

    await expect(
      service.registerDevice(auth, { token: TOKEN, platform: 'ios' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'NOTIFICATIONS_UNAVAILABLE' });
  });

  it('maps a missing row without an error to 503', async () => {
    const { devices, service } = setup();
    devices.registerDevice.mockResolvedValue({ row: null, error: null });

    await expect(
      service.registerDevice(auth, { token: TOKEN, platform: 'ios' }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('NotificationsService.removeDevice', () => {
  it('deletes a well-formed token', async () => {
    const { devices, service } = setup();
    devices.removeDevice.mockResolvedValue({ error: null });

    await service.removeDevice(auth, TOKEN);

    expect(devices.removeDevice).toHaveBeenCalledWith('test-access-token', TOKEN);
  });

  it('ignores a malformed token without calling the database', async () => {
    const { devices, service } = setup();

    await service.removeDevice(auth, 'not-a-token');

    expect(devices.removeDevice).not.toHaveBeenCalled();
  });

  it('maps database errors to 503', async () => {
    const { devices, service } = setup();
    devices.removeDevice.mockResolvedValue({ error: postgrestError('XX000') });

    await expect(service.removeDevice(auth, TOKEN)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('NotificationsService.dispatchDueNotifications', () => {
  it('sends a due event to the recipient device and records the ticket', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    sender.send.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

    const summary = await service.dispatchDueNotifications();

    expect(sender.send).toHaveBeenCalledWith([
      {
        to: TOKEN,
        title: 'Veronica Lens',
        body: 'Chuva de meteoros',
        data: { eventId: 'event-1' },
      },
    ]);
    expect(dispatch.markDeliverySent).toHaveBeenCalledWith(
      'delivery-event-1-token-1',
      'ticket-1',
      NOW,
    );
    expect(summary).toEqual({
      events: 1,
      recipients: 1,
      attempted: 1,
      sent: 1,
      failed: 0,
      deactivatedTokens: 0,
    });
  });

  it('does not notify before the preference lead window opens', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(10)]);

    const summary = await service.dispatchDueNotifications();

    expect(dispatch.findActiveTokens).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(summary.recipients).toBe(0);
  });

  it('returns an empty summary when no event is upcoming', async () => {
    const { dispatch, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([]);

    const summary = await service.dispatchDueNotifications();

    expect(dispatch.findEnabledPreferences).not.toHaveBeenCalled();
    expect(summary.events).toBe(0);
  });

  it('skips pairs already in the delivery ledger', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    dispatch.insertPendingDeliveries.mockResolvedValue([]);

    const summary = await service.dispatchDueNotifications();

    expect(sender.send).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ recipients: 1, attempted: 0, sent: 0 });
  });

  it('only sends to the devices of users with a due preference', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([
      token('token-1'),
      token('token-2', OTHER_USER_ID, 'ExponentPushToken[other]'),
    ]);
    sender.send.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

    await service.dispatchDueNotifications();

    expect(dispatch.findActiveTokens).toHaveBeenCalledWith([USER_ID]);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('marks a DeviceNotRegistered ticket failed and deactivates the token', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    sender.send.mockResolvedValue([
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ]);

    const summary = await service.dispatchDueNotifications();

    expect(dispatch.deactivateTokens).toHaveBeenCalledWith(['token-1']);
    expect(dispatch.markDeliveryFailed).toHaveBeenCalledWith(
      'delivery-event-1-token-1',
      'DeviceNotRegistered',
      'gone',
      NOW,
    );
    expect(summary).toMatchObject({ failed: 1, deactivatedTokens: 1, sent: 0 });
  });

  it('records other ticket errors without deactivating the token', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    sender.send.mockResolvedValue([{ status: 'error', message: 'rate limited' }]);

    const summary = await service.dispatchDueNotifications();

    expect(dispatch.deactivateTokens).not.toHaveBeenCalled();
    expect(dispatch.markDeliveryFailed).toHaveBeenCalledWith(
      'delivery-event-1-token-1',
      'EXPO_ERROR',
      'rate limited',
      NOW,
    );
    expect(summary.failed).toBe(1);
  });

  it('fails the whole chunk with EXPO_UNAVAILABLE when Expo cannot be reached', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    sender.send.mockRejectedValue(new Error('network down'));

    const summary = await service.dispatchDueNotifications();

    expect(dispatch.markDeliveryFailed).toHaveBeenCalledWith(
      'delivery-event-1-token-1',
      'EXPO_UNAVAILABLE',
      'Expo push request failed',
      NOW,
    );
    expect(summary).toMatchObject({ attempted: 1, failed: 1, sent: 0 });
  });

  it('fails a delivery whose ticket is missing from the response', async () => {
    const { dispatch, sender, service } = setup();
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue([token('token-1')]);
    sender.send.mockResolvedValue([]);

    await service.dispatchDueNotifications();

    expect(dispatch.markDeliveryFailed).toHaveBeenCalledWith(
      'delivery-event-1-token-1',
      'EXPO_INVALID_RESPONSE',
      'Missing push ticket',
      NOW,
    );
  });

  it('splits sends into chunks of 100 messages', async () => {
    const { dispatch, sender, service } = setup();
    const tokens = Array.from({ length: 150 }, (_, index) =>
      token(`token-${index}`, USER_ID, `ExponentPushToken[t${index}]`),
    );
    dispatch.findUpcomingEvents.mockResolvedValue([eventAt(30)]);
    dispatch.findEnabledPreferences.mockResolvedValue([preference(60)]);
    dispatch.findActiveTokens.mockResolvedValue(tokens);
    sender.send.mockImplementation(async (messages) =>
      messages.map((_, index) => ({ status: 'ok' as const, id: `ticket-${index}` })),
    );

    const summary = await service.dispatchDueNotifications();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send.mock.calls[0]?.[0]).toHaveLength(100);
    expect(sender.send.mock.calls[1]?.[0]).toHaveLength(50);
    expect(summary).toMatchObject({ attempted: 150, sent: 150 });
  });
});
