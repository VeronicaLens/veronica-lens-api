import { AuthApiError } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { AuthModelPort } from '../../src/modules/auth/auth.model.js';

function setup() {
  const model = {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
    getUser: vi.fn<AuthModelPort['getUser']>(),
    signOut: vi.fn<AuthModelPort['signOut']>(),
    requestPasswordRecovery:
      vi.fn<AuthModelPort['requestPasswordRecovery']>(),
    updatePassword: vi.fn<AuthModelPort['updatePassword']>(),
  };

  return {
    model,
    app: createApp({ authModel: model }),
  };
}

const acceptedBody = {
  data: {
    message:
      'If the account exists, password recovery instructions were sent.',
  },
};

describe('Password recovery', () => {
  it('accepts the request and normalizes the email', async () => {
    const { app, model } = setup();

    model.requestPasswordRecovery.mockResolvedValue({
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: ' User@Example.com ' })
      .expect(202);

    expect(response.body).toEqual(acceptedBody);
    expect(
      model.requestPasswordRecovery,
    ).toHaveBeenCalledExactlyOnceWith('user@example.com');
  });

  it('does not disclose an unknown account', async () => {
    const { app, model } = setup();

    model.requestPasswordRecovery.mockResolvedValue({
      error: new AuthApiError(
        'Internal account details',
        400,
        'user_not_found',
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'unknown@example.com' })
      .expect(202);

    expect(response.body).toEqual(acceptedBody);
  });

  it('rejects invalid email before calling the provider', async () => {
    const { app, model } = setup();

    const response = await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'invalid' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(model.requestPasswordRecovery).not.toHaveBeenCalled();
  });

  it('does not hide provider unavailability', async () => {
    const { app, model } = setup();

    model.requestPasswordRecovery.mockResolvedValue({
      error: new AuthApiError(
        'Internal provider details',
        503,
        undefined,
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'user@example.com' })
      .expect(503);

    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  it('returns 429 when the provider rate limits requests', async () => {
    const { app, model } = setup();

    model.requestPasswordRecovery.mockResolvedValue({
      error: new AuthApiError(
        'Internal rate limit details',
        429,
        'over_email_send_rate_limit',
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'user@example.com' })
      .expect(429);

    expect(response.body.error.code).toBe('AUTH_RATE_LIMITED');
  });
});