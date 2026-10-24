import type { PostgrestError, User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { ProfileRow } from '../../src/modules/profile/profile.model.js';
import {
  createAppMocks,
  createAvatarStorageMock,
  createProfileModelMock,
} from '../helpers/mocks.js';

const userId = '00000000-0000-4000-8000-000000000001';
const endpoint = '/api/v1/profile';
const bearer = 'Bearer test-access-token';

function createUser(): User {
  return {
    id: userId,
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: userId,
    display_name: 'Veronica',
    avatar_url: null,
    location_name: 'Campinas',
    latitude: '-22.90000',
    longitude: -47.06,
    notifications_enabled: true,
    measurement_unit: 'metric',
    language: 'pt-BR',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function postgrestError(code: string): PostgrestError {
  return {
    name: 'PostgrestError',
    code,
    message: 'Internal provider details',
    details: '',
    hint: '',
  } as PostgrestError;
}

function setup() {
  const mocks = createAppMocks();
  const profileModel = createProfileModelMock();
  const avatarStorage = createAvatarStorageMock();

  mocks.authModel.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });

  return {
    authModel: mocks.authModel,
    profileModel,
    avatarStorage,
    app: createApp({ ...mocks, profileModel, avatarStorage }),
  };
}

const expectedProfile = {
  id: userId,
  displayName: 'Veronica',
  avatarUrl: null,
  locationName: 'Campinas',
  latitude: -22.9,
  longitude: -47.06,
  notificationsEnabled: true,
  measurementUnit: 'metric',
  language: 'pt-BR',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('GET /api/v1/profile', () => {
  it('returns the authenticated user profile', async () => {
    const { app, profileModel } = setup();

    profileModel.findById.mockResolvedValue({
      profile: createRow(),
      error: null,
    });

    const response = await request(app)
      .get(endpoint)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body).toEqual({ data: { profile: expectedProfile } });
    expect(profileModel.findById).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
    );
  });

  it('requires authentication', async () => {
    const { app, profileModel } = setup();

    const response = await request(app).get(endpoint).expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(profileModel.findById).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile is not visible', async () => {
    const { app, profileModel } = setup();

    profileModel.findById.mockResolvedValue({ profile: null, error: null });

    const response = await request(app)
      .get(endpoint)
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('rejects a profile that belongs to another user', async () => {
    const { app, profileModel } = setup();

    profileModel.findById.mockResolvedValue({
      profile: createRow({ id: '00000000-0000-4000-8000-000000000002' }),
      error: null,
    });

    const response = await request(app)
      .get(endpoint)
      .set('Authorization', bearer)
      .expect(502);

    expect(response.body.error.code).toBe('PROFILE_RESPONSE_INVALID');
  });

  it.each([
    ['PGRST301', 401, 'AUTH_TOKEN_INVALID'],
    ['PGRST303', 401, 'AUTH_TOKEN_INVALID'],
    ['42501', 503, 'PROFILE_UNAVAILABLE'],
    ['', 503, 'PROFILE_UNAVAILABLE'],
  ])(
    'maps provider error %j to %i %s',
    async (code, status, errorCode) => {
      const { app, profileModel } = setup();

      profileModel.findById.mockResolvedValue({
        profile: null,
        error: postgrestError(code),
      });

      const response = await request(app)
        .get(endpoint)
        .set('Authorization', bearer)
        .expect(status);

      expect(response.body.error.code).toBe(errorCode);
      expect(JSON.stringify(response.body)).not.toContain(
        'Internal provider details',
      );
    },
  );
});

describe('PATCH /api/v1/profile', () => {
  it('converts allowed fields to database columns', async () => {
    const { app, profileModel } = setup();

    profileModel.update.mockResolvedValue({
      profile: createRow({ display_name: 'Ana' }),
      error: null,
    });

    const response = await request(app)
      .patch(endpoint)
      .set('Authorization', bearer)
      .send({
        displayName: ' Ana ',
        locationName: null,
        latitude: null,
        longitude: null,
        notificationsEnabled: false,
        measurementUnit: 'imperial',
        language: 'en',
      })
      .expect(200);

    expect(response.body.data.profile.displayName).toBe('Ana');
    expect(profileModel.update).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
      {
        display_name: 'Ana',
        location_name: null,
        latitude: null,
        longitude: null,
        notifications_enabled: false,
        measurement_unit: 'imperial',
        language: 'en',
      },
    );
  });

  it('sends only the fields present in the request', async () => {
    const { app, profileModel } = setup();

    profileModel.update.mockResolvedValue({
      profile: createRow(),
      error: null,
    });

    await request(app)
      .patch(endpoint)
      .set('Authorization', bearer)
      .send({ language: 'en' })
      .expect(200);

    expect(profileModel.update).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
      { language: 'en' },
    );
  });

  it.each([
    {},
    { avatarUrl: 'https://example.com/a.png' },
    { id: '00000000-0000-4000-8000-000000000002' },
    { latitude: 10 },
  ])('rejects invalid body %j before calling the model', async (body) => {
    const { app, profileModel } = setup();

    const response = await request(app)
      .patch(endpoint)
      .set('Authorization', bearer)
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(profileModel.update).not.toHaveBeenCalled();
  });

  it('requires authentication before validating the body', async () => {
    const { app, profileModel } = setup();

    const response = await request(app)
      .patch(endpoint)
      .send({})
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(profileModel.update).not.toHaveBeenCalled();
  });

  it('maps rejected database values to 400', async () => {
    const { app, profileModel } = setup();

    profileModel.update.mockResolvedValue({
      profile: null,
      error: postgrestError('23514'),
    });

    const response = await request(app)
      .patch(endpoint)
      .set('Authorization', bearer)
      .send({ displayName: 'Ana' })
      .expect(400);

    expect(response.body.error.code).toBe('PROFILE_REJECTED');
  });

  it('returns 404 when no visible row was updated', async () => {
    const { app, profileModel } = setup();

    profileModel.update.mockResolvedValue({ profile: null, error: null });

    const response = await request(app)
      .patch(endpoint)
      .set('Authorization', bearer)
      .send({ displayName: 'Ana' })
      .expect(404);

    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});
