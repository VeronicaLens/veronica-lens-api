import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createAccountModelMock, createAppMocks } from '../helpers/mocks.js';

const userId = '00000000-0000-4000-8000-000000000001';
const endpoint = '/api/v1/account';
const bearer = 'Bearer test-access-token';
const confirmation = { confirmation: 'DELETE' };

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

function setup() {
  const mocks = createAppMocks();
  const accountModel = createAccountModelMock();

  mocks.authModel.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });
  accountModel.listObservationMediaPaths.mockResolvedValue({
    paths: [`${userId}/observation.jpg`],
    error: null,
  });
  accountModel.listAvatarPaths.mockResolvedValue({
    paths: [`${userId}/avatar`],
    error: null,
  });
  accountModel.removeFiles.mockResolvedValue({ error: null });
  accountModel.deleteUser.mockResolvedValue({ error: null });

  return {
    accountModel,
    app: createApp({ ...mocks, accountModel }),
  };
}

describe('DELETE /api/v1/account', () => {
  it('removes files before deleting the user and returns 204', async () => {
    const { app, accountModel } = setup();

    const response = await request(app)
      .delete(endpoint)
      .set('Authorization', bearer)
      .send(confirmation)
      .expect(204);

    expect(response.text).toBe('');
    expect(accountModel.removeFiles.mock.calls).toEqual([
      ['observations', [`${userId}/observation.jpg`]],
      ['avatars', [`${userId}/avatar`]],
    ]);
    expect(accountModel.deleteUser).toHaveBeenCalledExactlyOnceWith(userId);

    const removeOrder = Math.max(
      ...accountModel.removeFiles.mock.invocationCallOrder,
    );
    const deleteOrder = accountModel.deleteUser.mock.invocationCallOrder[0];

    expect(deleteOrder).toBeGreaterThan(removeOrder);
  });

  it('uses the authenticated user id, never one from the body', async () => {
    const { app, accountModel } = setup();

    await request(app)
      .delete(endpoint)
      .set('Authorization', bearer)
      .send({ confirmation: 'DELETE', userId: 'other-user' })
      .expect(400);

    expect(accountModel.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['missing body', undefined],
    ['empty body', {}],
    ['wrong phrase', { confirmation: 'delete' }],
    ['phrase with spaces', { confirmation: ' DELETE ' }],
    ['boolean', { confirmation: true }],
  ])('rejects %s without deleting anything', async (_name, body) => {
    const { app, accountModel } = setup();

    const pending = request(app)
      .delete(endpoint)
      .set('Authorization', bearer);

    const response = await (body === undefined ? pending : pending.send(body))
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(accountModel.listObservationMediaPaths).not.toHaveBeenCalled();
    expect(accountModel.removeFiles).not.toHaveBeenCalled();
    expect(accountModel.deleteUser).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { app, accountModel } = setup();

    const response = await request(app)
      .delete(endpoint)
      .send(confirmation)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(accountModel.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    'listObservationMediaPaths',
    'listAvatarPaths',
    'removeFiles',
  ] as const)(
    'keeps the user when %s fails',
    async (step) => {
      const { app, accountModel } = setup();
      const error = { source: 'storage' as const, status: 500 };

      if (step === 'removeFiles') {
        accountModel.removeFiles.mockResolvedValue({ error });
      } else {
        accountModel[step].mockResolvedValue({ paths: [], error });
      }

      const response = await request(app)
        .delete(endpoint)
        .set('Authorization', bearer)
        .send(confirmation)
        .expect(503);

      expect(response.body.error.code).toBe('ACCOUNT_DELETION_UNAVAILABLE');
      expect(accountModel.deleteUser).not.toHaveBeenCalled();
    },
  );

  it('returns 503 when the user cannot be deleted', async () => {
    const { app, accountModel } = setup();

    accountModel.deleteUser.mockResolvedValue({
      error: { source: 'auth', code: 'unexpected_failure', status: 500 },
    });

    const response = await request(app)
      .delete(endpoint)
      .set('Authorization', bearer)
      .send(confirmation)
      .expect(503);

    expect(response.body).toEqual({
      error: {
        code: 'ACCOUNT_DELETION_UNAVAILABLE',
        message: 'Account could not be deleted; try again later',
      },
    });
  });
});
