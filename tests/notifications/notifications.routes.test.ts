import type { PostgrestError, User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { NotificationsService } from '../../src/modules/notifications/notifications.service.js';
import {
  createAppMocks,
  createDeviceModelMock,
  createDispatchModelMock,
  createPushSenderMock,
} from '../helpers/mocks.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'ExponentPushToken[abc123]';
const bearer = 'Bearer test-access-token';
const DISPATCH_SECRET = 'dispatch-secret-with-at-least-32-characters';

function createUser(): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function postgrestError(code: string): PostgrestError {
  return { name: 'PostgrestError', code, message: 'Internal details', details: '', hint: '' } as PostgrestError;
}

function setup(options: { dispatchSecret?: string } = {}) {
  const mocks = createAppMocks();
  const devices = createDeviceModelMock();
  const dispatch = createDispatchModelMock();
  const sender = createPushSenderMock();

  mocks.authModel.getUser.mockResolvedValue({ user: createUser(), error: null });

  const notificationsService = new NotificationsService(devices, dispatch, sender);
  const app = createApp({
    ...mocks,
    notificationsService,
    notificationsDispatchSecret: options.dispatchSecret,
  });

  return { app, devices, dispatch, sender };
}

describe('PUT /api/v1/notifications/devices', () => {
  it('registers the device and returns it', async () => {
    const { app, devices } = setup();
    devices.registerDevice.mockResolvedValue({
      row: { id: 'device-1', token: TOKEN, platform: 'android', active: true },
      error: null,
    });

    const response = await request(app)
      .put('/api/v1/notifications/devices')
      .set('Authorization', bearer)
      .send({ token: TOKEN, platform: 'android' })
      .expect(200);

    expect(response.body.data.device).toEqual({
      id: 'device-1',
      token: TOKEN,
      platform: 'android',
      active: true,
    });
    expect(devices.registerDevice).toHaveBeenCalledWith('test-access-token', USER_ID, {
      token: TOKEN,
      platform: 'android',
    });
  });

  it('returns 401 without a bearer token', async () => {
    const { app, devices } = setup();

    await request(app)
      .put('/api/v1/notifications/devices')
      .send({ token: TOKEN, platform: 'android' })
      .expect(401);

    expect(devices.registerDevice).not.toHaveBeenCalled();
  });

  it('rejects a malformed Expo token', async () => {
    const { app, devices } = setup();

    await request(app)
      .put('/api/v1/notifications/devices')
      .set('Authorization', bearer)
      .send({ token: 'not-a-token', platform: 'android' })
      .expect(400);

    expect(devices.registerDevice).not.toHaveBeenCalled();
  });

  it('rejects an unsupported platform', async () => {
    const { app } = setup();

    await request(app)
      .put('/api/v1/notifications/devices')
      .set('Authorization', bearer)
      .send({ token: TOKEN, platform: 'web' })
      .expect(400);
  });

  it('returns 409 when the token belongs to another account', async () => {
    const { app, devices } = setup();
    devices.registerDevice.mockResolvedValue({ row: null, error: postgrestError('42501') });

    const response = await request(app)
      .put('/api/v1/notifications/devices')
      .set('Authorization', bearer)
      .send({ token: TOKEN, platform: 'ios' })
      .expect(409);

    expect(response.body.error.code).toBe('DEVICE_TOKEN_IN_USE');
  });
});

describe('DELETE /api/v1/notifications/devices/:token', () => {
  it('removes the device and returns 204', async () => {
    const { app, devices } = setup();
    devices.removeDevice.mockResolvedValue({ error: null });

    await request(app)
      .delete(`/api/v1/notifications/devices/${encodeURIComponent(TOKEN)}`)
      .set('Authorization', bearer)
      .expect(204);

    expect(devices.removeDevice).toHaveBeenCalledWith('test-access-token', TOKEN);
  });

  it('returns 401 without a bearer token', async () => {
    const { app, devices } = setup();

    await request(app)
      .delete(`/api/v1/notifications/devices/${encodeURIComponent(TOKEN)}`)
      .expect(401);

    expect(devices.removeDevice).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/notifications/dispatch', () => {
  it('is disabled when no dispatch secret is configured', async () => {
    const { app } = setup();

    const response = await request(app)
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', `Bearer ${DISPATCH_SECRET}`)
      .expect(503);

    expect(response.body.error.code).toBe('DISPATCH_DISABLED');
  });

  it('rejects a missing dispatch secret', async () => {
    const { app } = setup({ dispatchSecret: DISPATCH_SECRET });

    const response = await request(app).post('/api/v1/notifications/dispatch').expect(401);

    expect(response.body.error.code).toBe('DISPATCH_UNAUTHORIZED');
  });

  it('rejects a wrong dispatch secret', async () => {
    const { app, dispatch } = setup({ dispatchSecret: DISPATCH_SECRET });

    await request(app)
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', 'Bearer wrong-secret')
      .expect(401);

    expect(dispatch.findUpcomingEvents).not.toHaveBeenCalled();
  });

  it('rejects a user access token, which is not the dispatch secret', async () => {
    const { app } = setup({ dispatchSecret: DISPATCH_SECRET });

    await request(app)
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', bearer)
      .expect(401);
  });

  it('runs the dispatch and returns the summary', async () => {
    const { app, dispatch } = setup({ dispatchSecret: DISPATCH_SECRET });
    dispatch.findUpcomingEvents.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/v1/notifications/dispatch')
      .set('Authorization', `Bearer ${DISPATCH_SECRET}`)
      .expect(200);

    expect(response.body.data.summary).toEqual({
      events: 0,
      recipients: 0,
      attempted: 0,
      sent: 0,
      failed: 0,
      deactivatedTokens: 0,
    });
  });
});
