import {
  AuthApiError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../src/modules/auth/auth.service.js';
import { createAuthModelMock } from '../helpers/mocks.js';

function setup() {
  const model = createAuthModelMock();

  return {
    model,
    service: new AuthService(model),
  };
}

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {
      display_name: 'Veronica',
      private_field: 'must-not-be-returned',
    },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createSession(): Session {
  return {
    user: createUser(),
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1893456000,
  };
}

const input = {
  email: 'user@example.com',
  password: 'test-password',
};

describe('AuthService', () => {
  it('returns registration without a session when confirmation is required', async () => {
    const { model, service } = setup();

    model.signUp.mockResolvedValue({
      user: createUser(),
      session: null,
      error: null,
    });

    await expect(service.signUp(input)).resolves.toEqual({
      user: {
        id: createUser().id,
        email: input.email,
        displayName: 'Veronica',
      },
      session: null,
      confirmationRequired: true,
    });

    expect(model.signUp).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('returns registration with an immediate session', async () => {
    const { model, service } = setup();

    model.signUp.mockResolvedValue({
      user: createUser(),
      session: createSession(),
      error: null,
    });

    const result = await service.signUp(input);

    expect(result.confirmationRequired).toBe(false);
    expect(result.session?.accessToken).toBe('test-access-token');
  });

  it('returns only the public session fields on login', async () => {
    const { model, service } = setup();

    model.signIn.mockResolvedValue({
      user: createUser(),
      session: createSession(),
      error: null,
    });

    await expect(service.signIn(input)).resolves.toEqual({
      user: {
        id: createUser().id,
        email: input.email,
        displayName: 'Veronica',
      },
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenType: 'bearer',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
  });

  it.each([
    ['invalid_credentials', 400, 401, 'AUTH_INVALID_CREDENTIALS'],
    ['email_not_confirmed', 400, 403, 'AUTH_EMAIL_NOT_CONFIRMED'],
    ['over_request_rate_limit', 429, 429, 'AUTH_RATE_LIMITED'],
    ['unexpected_failure', 500, 503, 'AUTH_UNAVAILABLE'],
    ['user_already_exists', 422, 400, 'AUTH_REQUEST_REJECTED'],
    ['unexpected_failure', 400, 502, 'AUTH_PROVIDER_ERROR'],
  ] as const)(
    'maps provider error %s with status %i',
    async (code, providerStatus, statusCode, publicCode) => {
      const { model, service } = setup();

      model.signIn.mockResolvedValue({
        user: null,
        session: null,
        error: new AuthApiError(
          'Provider details must not be exposed',
          providerStatus,
          code,
        ),
      });

      await expect(service.signIn(input)).rejects.toMatchObject({
        statusCode,
        code: publicCode,
      });
    },
  );

  it('rejects login success without a session', async () => {
    const { model, service } = setup();

    model.signIn.mockResolvedValue({
      user: createUser(),
      session: null,
      error: null,
    });

    await expect(service.signIn(input)).rejects.toMatchObject({
      statusCode: 502,
      code: 'AUTH_RESPONSE_INVALID',
    });
  });

  it('rejects a session without an expiration date', async () => {
    const { model, service } = setup();
    const session = createSession();
    delete session.expires_at;

    model.signIn.mockResolvedValue({
      user: session.user,
      session,
      error: null,
    });

    await expect(service.signIn(input)).rejects.toMatchObject({
      code: 'AUTH_RESPONSE_INVALID',
    });
  });
});