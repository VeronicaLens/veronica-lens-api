import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { createAppMocks, createAuthModelMock } from '../helpers/mocks.js';

function setup() {
  const model = createAuthModelMock();

  return {
    model,
    app: createApp({ ...createAppMocks(), authModel: model }),
  };
}

describe('Authentication rate limit', () => {
  it('allows 20 attempts and blocks the next before calling the model', async () => {
    const { app, model } = setup();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/sign-in')
        .send({})
        .expect(400);
    }

    const response = await request(app)
      .post('/api/v1/auth/sign-in')
      .send({
        email: 'user@example.com',
        password: 'test-password',
      })
      .expect(429);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts',
      },
    });

    const retryAfter = Number(response.headers['retry-after']);

    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(response.headers['x-request-id']).toBeDefined();

    expect(model.signIn).not.toHaveBeenCalled();
    expect(model.signUp).not.toHaveBeenCalled();
  });

  it('shares the limit between registration, login, refresh and recovery', async () => {
    const { app, model } = setup();
    const endpoints = [
      'sign-up', 'sign-in', 'refresh', 'password/recovery',
    ];

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const endpoint = endpoints[attempt % endpoints.length];

      await request(app)
        .post(`/api/v1/auth/${endpoint}`)
        .send({})
        .expect(400);
    }

    await request(app)
      .post('/api/v1/auth/sign-up')
      .send({})
      .expect(429);

    await request(app)
      .post('/api/v1/auth/sign-in')
      .send({})
      .expect(429);

    await request(app)
      .post('/api/v1/auth/password/recovery')
      .send({ email: 'user@example.com' })
      .expect(429);

    expect(model.requestPasswordRecovery).not.toHaveBeenCalled();

    await request(app).get('/health').expect(200);
  });

  it('does not share counters between application instances', async () => {
    const first = setup();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(first.app)
        .post('/api/v1/auth/sign-in')
        .send({})
        .expect(400);
    }

    await request(first.app)
      .post('/api/v1/auth/sign-in')
      .send({})
      .expect(429);

    const second = setup();

    await request(second.app)
      .post('/api/v1/auth/sign-in')
      .send({})
      .expect(400);
  });
});