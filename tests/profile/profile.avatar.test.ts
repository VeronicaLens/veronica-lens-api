import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { MAX_AVATAR_BYTES } from '../../src/modules/profile/avatar-image.js';
import type { StorageError } from '../../src/modules/profile/avatar.storage.js';
import type { ProfileRow } from '../../src/modules/profile/profile.model.js';
import {
  createAppMocks,
  createAvatarStorageMock,
  createProfileModelMock,
} from '../helpers/mocks.js';
import { jpegBytes, pngBytes, webpBytes } from '../helpers/images.js';

const userId = '00000000-0000-4000-8000-000000000001';
const endpoint = '/api/v1/profile/avatar';
const bearer = 'Bearer test-access-token';
const publicUrl = `https://cdn.example/avatars/${userId}/avatar`;

function createUser(): User {
  return {
    id: userId,
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createRow(avatarUrl: string | null): ProfileRow {
  return {
    id: userId,
    display_name: null,
    avatar_url: avatarUrl,
    location_name: null,
    latitude: null,
    longitude: null,
    notifications_enabled: true,
    measurement_unit: 'metric',
    language: 'pt-BR',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

function storageError(status: number): StorageError {
  return {
    name: 'StorageApiError',
    message: 'Internal storage details',
    status,
    statusCode: String(status),
  } as unknown as StorageError;
}

function setup() {
  const mocks = createAppMocks();
  const profileModel = createProfileModelMock();
  const avatarStorage = createAvatarStorageMock();

  mocks.authModel.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });
  profileModel.update.mockImplementation(async (_token, _id, changes) => ({
    profile: createRow(changes.avatar_url ?? null),
    error: null,
  }));

  return {
    profileModel,
    avatarStorage,
    app: createApp({ ...mocks, profileModel, avatarStorage }),
  };
}

describe('PUT /api/v1/profile/avatar', () => {
  it.each([
    ['image/jpeg', jpegBytes],
    ['image/png', pngBytes],
    ['image/webp', webpBytes],
  ])('uploads a %s image and stores a cache-busting URL', async (type, bytes) => {
    const { app, avatarStorage, profileModel } = setup();

    avatarStorage.upload.mockResolvedValue({ publicUrl, error: null });

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', bearer)
      .set('Content-Type', type)
      .send(bytes)
      .expect(200);

    expect(response.body.data.profile.avatarUrl).toMatch(
      new RegExp(`^${publicUrl}\\?v=\\d+$`),
    );
    expect(avatarStorage.upload).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
      { contentType: type, bytes },
    );
    expect(profileModel.update).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
      { avatar_url: expect.stringMatching(/\?v=\d+$/) },
    );
  });

  it('requires authentication', async () => {
    const { app, avatarStorage } = setup();

    const response = await request(app)
      .put(endpoint)
      .set('Content-Type', 'image/png')
      .send(pngBytes)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(avatarStorage.upload).not.toHaveBeenCalled();
  });

  it.each(['image/gif', 'image/svg+xml', 'application/json', 'text/plain'])(
    'rejects content type %s',
    async (type) => {
      const { app, avatarStorage } = setup();

      const response = await request(app)
        .put(endpoint)
        .set('Authorization', bearer)
        .set('Content-Type', type)
        .send(type === 'application/json' ? '{}' : 'data')
        .expect(415);

      expect(response.body.error.code).toBe('AVATAR_TYPE_UNSUPPORTED');
      expect(avatarStorage.upload).not.toHaveBeenCalled();
    },
  );

  it('rejects content that does not match the declared type', async () => {
    const { app, avatarStorage } = setup();

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', bearer)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload="alert(1)"/>'))
      .expect(400);

    expect(response.body.error.code).toBe('AVATAR_INVALID');
    expect(avatarStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects a JPEG declared as PNG', async () => {
    const { app, avatarStorage } = setup();

    await request(app)
      .put(endpoint)
      .set('Authorization', bearer)
      .set('Content-Type', 'image/png')
      .send(jpegBytes)
      .expect(400);

    expect(avatarStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const { app, avatarStorage } = setup();

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', bearer)
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(0))
      .expect(400);

    expect(response.body.error.code).toBe('AVATAR_INVALID');
    expect(avatarStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects files above 5 MB before calling storage', async () => {
    const { app, avatarStorage } = setup();
    const bytes = Buffer.concat([pngBytes, Buffer.alloc(MAX_AVATAR_BYTES)]);

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', bearer)
      .set('Content-Type', 'image/png')
      .send(bytes)
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(avatarStorage.upload).not.toHaveBeenCalled();
  });

  it.each([
    [401, 401, 'AUTH_TOKEN_INVALID'],
    [413, 413, 'AVATAR_TOO_LARGE'],
    [415, 415, 'AVATAR_TYPE_UNSUPPORTED'],
    [403, 503, 'AVATAR_STORAGE_UNAVAILABLE'],
    [500, 503, 'AVATAR_STORAGE_UNAVAILABLE'],
  ])(
    'maps storage status %i to %i %s without updating the profile',
    async (providerStatus, status, code) => {
      const { app, avatarStorage, profileModel } = setup();

      avatarStorage.upload.mockResolvedValue({
        publicUrl: null,
        error: storageError(providerStatus),
      });

      const response = await request(app)
        .put(endpoint)
        .set('Authorization', bearer)
        .set('Content-Type', 'image/png')
        .send(pngBytes)
        .expect(status);

      expect(response.body.error.code).toBe(code);
      expect(JSON.stringify(response.body)).not.toContain(
        'Internal storage details',
      );
      expect(profileModel.update).not.toHaveBeenCalled();
    },
  );
});

describe('DELETE /api/v1/profile/avatar', () => {
  it('removes the files and clears the avatar URL', async () => {
    const { app, avatarStorage, profileModel } = setup();

    avatarStorage.remove.mockResolvedValue({ error: null });

    const response = await request(app)
      .delete(endpoint)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.profile.avatarUrl).toBeNull();
    expect(avatarStorage.remove).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
    );
    expect(profileModel.update).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      userId,
      { avatar_url: null },
    );
  });

  it('keeps the profile unchanged when storage fails', async () => {
    const { app, avatarStorage, profileModel } = setup();

    avatarStorage.remove.mockResolvedValue({ error: storageError(500) });

    await request(app)
      .delete(endpoint)
      .set('Authorization', bearer)
      .expect(503);

    expect(profileModel.update).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { app, avatarStorage } = setup();

    await request(app).delete(endpoint).expect(401);

    expect(avatarStorage.remove).not.toHaveBeenCalled();
  });
});
