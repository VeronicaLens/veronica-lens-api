import {
  AuthApiError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { SupabaseAuthModel } from '../../src/modules/auth/auth.model.js';
import { createAppMocks, createAuthModelMock } from '../helpers/mocks.js';

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function setup() {
  const model = createAuthModelMock();

  model.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });

  return {
    model,
    app: createApp({ ...createAppMocks(), authModel: model }),
  };
}

describe('Session sign-out', () => {
  it('uses the explicit token and local scope in the SDK', async () => {
    const client = {
      signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
      signInWithPassword:
        vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
      refreshSession:
        vi.fn<SupabaseClient['auth']['refreshSession']>(),
      getUser: vi.fn<SupabaseClient['auth']['getUser']>(),
      resetPasswordForEmail:
        vi.fn<SupabaseClient['auth']['resetPasswordForEmail']>(),
      setSession: vi.fn<SupabaseClient['auth']['setSession']>(),
      updateUser: vi.fn<SupabaseClient['auth']['updateUser']>(),
      admin: {
        signOut:
          vi.fn<SupabaseClient['auth']['admin']['signOut']>(),
      },
    };

    client.admin.signOut.mockResolvedValue({
      data: null,
      error: null,
    });

    const model = new SupabaseAuthModel(
      () => client,
      'veronicalens://auth/reset-password',
    );

    await expect(
      model.signOut('test-access-token'),
    ).resolves.toEqual({ error: null });

    expect(client.admin.signOut).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
      'local',
    );
  });

  it('returns 204 after successful revocation', async () => {
    const { app, model } = setup();

    model.signOut.mockResolvedValue({ error: null });

    const response = await request(app)
      .post('/api/v1/auth/sign-out')
      .set('Authorization', 'Bearer test-access-token')
      .expect(204);

    expect(response.text).toBe('');
    expect(model.getUser).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
    );
    expect(model.signOut).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
    );
  });

  it('requires authentication', async () => {
    const { app, model } = setup();

    await request(app)
      .post('/api/v1/auth/sign-out')
      .expect(401);

    expect(model.getUser).not.toHaveBeenCalled();
    expect(model.signOut).not.toHaveBeenCalled();
  });

  it('does not revoke when token validation fails', async () => {
    const { app, model } = setup();

    model.getUser.mockResolvedValue({
      user: null,
      error: new AuthApiError(
        'Internal verification details',
        401,
        'bad_jwt',
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-out')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
    expect(model.signOut).not.toHaveBeenCalled();
  });

  it('does not report success when revocation is unavailable', async () => {
    const { app, model } = setup();

    model.signOut.mockResolvedValue({
      error: new AuthApiError(
        'Internal provider details',
        503,
        undefined,
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-out')
      .set('Authorization', 'Bearer test-access-token')
      .expect(503);

    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  it('handles a token rejected during revocation', async () => {
    const { app, model } = setup();

    model.signOut.mockResolvedValue({
      error: new AuthApiError(
        'Internal provider details',
        401,
        'bad_jwt',
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-out')
      .set('Authorization', 'Bearer test-access-token')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });
});