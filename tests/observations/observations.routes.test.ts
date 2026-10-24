import type { PostgrestError, User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { StorageError } from '../../src/modules/profile/avatar.storage.js';
import { CAPTURE_METADATA_HEADER } from '../../src/modules/observations/observations.controller.js';
import {
  ObservationStoreError,
  type ObservationsModelPort,
} from '../../src/modules/observations/observations.model.js';
import type { ObservationPhotoMetadata } from '../../src/modules/observations/observations.schemas.js';
import { createAppMocks, createObservationsModelMock } from '../helpers/mocks.js';
import { jpegBytes, pngBytes } from '../helpers/images.js';

const userId = '00000000-0000-4000-8000-000000000001';
const observationId = '00000000-0000-4000-8000-000000000010';
const photoId = '00000000-0000-4000-8000-000000000011';
const bearer = 'Bearer test-access-token';
const basePath = '/api/v1/observations';
const photoPath = `${basePath}/${observationId}/photos/${photoId}`;

const metadata: ObservationPhotoMetadata = {
  title: 'Lua cheia',
  notes: '',
  capturedAt: '2026-05-01T20:00:00.000Z',
  device: { id: 'device-1', name: 'Pixel 8' },
  parameters: {
    focusMode: 'automatic',
    exposureMode: 'automatic',
    exposureCompensationEv: 0,
    iso: 'automatic',
    exposureTimeSeconds: 'automatic',
    fallbacks: [],
  },
};

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

function encodeMetadata(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

function databaseError(code: string): ObservationStoreError {
  return new ObservationStoreError({
    source: 'database',
    error: {
      code,
      message: 'Internal database details',
      details: '',
      hint: '',
    } as PostgrestError,
  });
}

function storageError(status: number): ObservationStoreError {
  return new ObservationStoreError({
    source: 'storage',
    error: {
      name: 'StorageApiError',
      message: 'Internal storage details',
      status,
      statusCode: String(status),
    } as unknown as StorageError,
  });
}

function setup() {
  const mocks = createAppMocks();
  const observationsModel = createObservationsModelMock();

  mocks.authModel.getUser.mockResolvedValue({ user: createUser(), error: null });

  return {
    observationsModel,
    app: createApp({ ...mocks, observationsModel }),
  };
}

function savePhotoRequest(
  app: ReturnType<typeof createApp>,
  contentType: string,
  body: Buffer | string,
  header: string | null = encodeMetadata(metadata),
) {
  const req = request(app)
    .put(photoPath)
    .set('Authorization', bearer)
    .set('Content-Type', contentType);
  if (header !== null) req.set(CAPTURE_METADATA_HEADER, header);
  return req.send(body);
}

describe('GET /api/v1/observations', () => {
  it('returns the history page inside the data envelope', async () => {
    const { app, observationsModel } = setup();
    observationsModel.list.mockResolvedValue({
      observations: [],
      page: 2,
      pageSize: 10,
      hasMore: false,
    });

    const response = await request(app)
      .get(`${basePath}?page=2&pageSize=10`)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body).toEqual({
      data: { observations: [], page: 2, pageSize: 10, hasMore: false },
    });
    expect(observationsModel.list).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      { userId, page: 2, pageSize: 10 },
    );
  });

  it('applies default paging', async () => {
    const { app, observationsModel } = setup();
    observationsModel.list.mockResolvedValue({
      observations: [],
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    await request(app).get(basePath).set('Authorization', bearer).expect(200);

    expect(observationsModel.list).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      { userId, page: 1, pageSize: 20 },
    );
  });

  it('rejects a page size above 50', async () => {
    const { app, observationsModel } = setup();

    const response = await request(app)
      .get(`${basePath}?pageSize=51`)
      .set('Authorization', bearer)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(observationsModel.list).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { app, observationsModel } = setup();

    const response = await request(app).get(basePath).expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(observationsModel.list).not.toHaveBeenCalled();
  });

  it('maps database token rejection to 401', async () => {
    const { app, observationsModel } = setup();
    observationsModel.list.mockRejectedValue(databaseError('PGRST301'));

    const response = await request(app)
      .get(basePath)
      .set('Authorization', bearer)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('hides database details behind 503', async () => {
    const { app, observationsModel } = setup();
    observationsModel.list.mockRejectedValue(databaseError('08006'));

    const response = await request(app)
      .get(basePath)
      .set('Authorization', bearer)
      .expect(503);

    expect(response.body.error.code).toBe('OBSERVATION_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain(
      'Internal database details',
    );
  });
});

describe('PUT /api/v1/observations/:observationId/photos/:photoId', () => {
  const savedPhoto = {
    observationId,
    photoId,
    storagePath: `${userId}/${observationId}/${photoId}.jpg`,
    capturedAt: metadata.capturedAt,
  };

  it('stores the photo and returns its storage path', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockResolvedValue(savedPhoto);

    const response = await savePhotoRequest(app, 'image/jpeg', jpegBytes).expect(
      200,
    );

    expect(response.body).toEqual({ data: { photo: savedPhoto } });
    expect(observationsModel.savePhoto).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      {
        observationId,
        photoId,
        userId,
        contentType: 'image/jpeg',
        bytes: jpegBytes,
        metadata,
      },
    );
  });

  it('requires authentication', async () => {
    const { app, observationsModel } = setup();

    const response = await request(app)
      .put(photoPath)
      .set('Content-Type', 'image/png')
      .set(CAPTURE_METADATA_HEADER, encodeMetadata(metadata))
      .send(pngBytes)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(observationsModel.savePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ['image/gif', 'data'],
    ['application/json', '{}'],
    ['text/plain', 'data'],
  ])(
    'rejects content type %s with 415',
    async (type, body) => {
      const { app, observationsModel } = setup();

      const response = await savePhotoRequest(app, type, body).expect(415);

      expect(response.body.error.code).toBe('PHOTO_TYPE_UNSUPPORTED');
      expect(observationsModel.savePhoto).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty body with 400', async () => {
    const { app, observationsModel } = setup();

    const response = await savePhotoRequest(
      app,
      'image/png',
      Buffer.alloc(0),
    ).expect(400);

    expect(response.body.error.code).toBe('PHOTO_INVALID');
    expect(observationsModel.savePhoto).not.toHaveBeenCalled();
  });

  it('rejects bytes that do not match the declared type with 400', async () => {
    const { app, observationsModel } = setup();

    const response = await savePhotoRequest(app, 'image/png', jpegBytes).expect(
      400,
    );

    expect(response.body.error.code).toBe('OBSERVATION_PHOTO_INVALID');
    expect(observationsModel.savePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing header', null],
    ['a malformed JSON header', '%7Bnot-json'],
    ['a schema-invalid header', encodeMetadata({ title: '' })],
  ])('rejects %s with 400', async (_label, header) => {
    const { app, observationsModel } = setup();

    const response = await savePhotoRequest(
      app,
      'image/png',
      pngBytes,
      header,
    ).expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(observationsModel.savePhoto).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID observation id with 400', async () => {
    const { app, observationsModel } = setup();

    const response = await request(app)
      .put(`${basePath}/not-a-uuid/photos/${photoId}`)
      .set('Authorization', bearer)
      .set('Content-Type', 'image/png')
      .set(CAPTURE_METADATA_HEADER, encodeMetadata(metadata))
      .send(pngBytes)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(observationsModel.savePhoto).not.toHaveBeenCalled();
  });

  it('maps a database token rejection to 401', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(databaseError('PGRST303'));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      401,
    );

    expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('maps a database failure to 503 without leaking details', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(databaseError('23503'));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      503,
    );

    expect(response.body.error.code).toBe('OBSERVATION_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain(
      'Internal database details',
    );
  });

  it('maps a storage rejection to 401', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(storageError(401));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      401,
    );

    expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('maps a storage size rejection to 413', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(storageError(413));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      413,
    );

    expect(response.body.error.code).toBe('PHOTO_TOO_LARGE');
  });

  it('maps a storage type rejection to 415', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(storageError(415));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      415,
    );

    expect(response.body.error.code).toBe('PHOTO_TYPE_UNSUPPORTED');
  });

  it('maps other storage failures to 503 without leaking details', async () => {
    const { app, observationsModel } = setup();
    observationsModel.savePhoto.mockRejectedValue(storageError(500));

    const response = await savePhotoRequest(app, 'image/png', pngBytes).expect(
      503,
    );

    expect(response.body.error.code).toBe('OBSERVATION_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain(
      'Internal storage details',
    );
  });
});

describe('DELETE /api/v1/observations/:observationId/photos/:photoId', () => {
  it('reports whether the parent observation was removed', async () => {
    const { app, observationsModel } = setup();
    observationsModel.deletePhoto.mockResolvedValue({
      observationDeleted: true,
    });

    const response = await request(app)
      .delete(photoPath)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body).toEqual({ data: { observationDeleted: true } });
    expect(observationsModel.deletePhoto).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      { observationId, photoId, userId },
    );
  });

  it('returns 404 when the photo is not found', async () => {
    const { app, observationsModel } = setup();
    observationsModel.deletePhoto.mockResolvedValue(null);

    const response = await request(app)
      .delete(photoPath)
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('requires authentication', async () => {
    const { app, observationsModel } = setup();

    await request(app).delete(photoPath).expect(401);

    expect(observationsModel.deletePhoto).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/observations/:observationId', () => {
  it('removes the observation with 204', async () => {
    const { app, observationsModel } = setup();
    observationsModel.deleteObservation.mockResolvedValue(true);

    await request(app)
      .delete(`${basePath}/${observationId}`)
      .set('Authorization', bearer)
      .expect(204);

    expect(observationsModel.deleteObservation).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      { observationId, userId },
    );
  });

  it('returns 404 when the observation is not found', async () => {
    const { app, observationsModel } = setup();
    observationsModel.deleteObservation.mockResolvedValue(false);

    const response = await request(app)
      .delete(`${basePath}/${observationId}`)
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('OBSERVATION_NOT_FOUND');
  });

  it('maps storage failure to 503', async () => {
    const { app, observationsModel } = setup();
    observationsModel.deleteObservation.mockRejectedValue(storageError(500));

    const response = await request(app)
      .delete(`${basePath}/${observationId}`)
      .set('Authorization', bearer)
      .expect(503);

    expect(response.body.error.code).toBe('OBSERVATION_STORAGE_UNAVAILABLE');
  });
});
