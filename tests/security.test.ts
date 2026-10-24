import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createAuthModelMock, createProfileModelMock } from './helpers/mocks.js';

function setup(corsOrigins?: readonly string[], httpsOnly?: boolean) {
  const authModel = createAuthModelMock();

  return createApp({
    authModel,
    profileModel: createProfileModelMock(),
    corsOrigins,
    httpsOnly,
  });
}

const allowedOrigin = 'https://admin.veronicalens.example';

describe('Security headers', () => {
  it.each(['/health', '/does-not-exist', '/openapi.json'])(
    'adds security headers to %s',
    async (path) => {
      const response = await request(setup()).get(path);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      expect(response.headers['x-powered-by']).toBeUndefined();
    },
  );

  it('allows plain HTTP outside production', async () => {
    const response = await request(setup()).get('/health');

    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('enforces HTTPS in production', async () => {
    const response = await request(setup(undefined, true)).get('/health');

    expect(response.headers['strict-transport-security']).toContain(
      'max-age=',
    );
    expect(response.headers['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
  });

  it('keeps the Swagger UI page and assets reachable', async () => {
    const app = setup();

    const page = await request(app).get('/docs/').expect(200);

    expect(page.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );
    await request(app).get('/docs/swagger-ui-init.js').expect(200);
  });
});

describe('CORS', () => {
  it('does not allow cross-origin browsers by default', async () => {
    const response = await request(setup())
      .get('/health')
      .set('Origin', allowedOrigin)
      .expect(200);

    expect(
      response.headers['access-control-allow-origin'],
    ).toBeUndefined();
  });

  it('allows a configured origin and exposes safe headers', async () => {
    const response = await request(setup([allowedOrigin]))
      .get('/health')
      .set('Origin', allowedOrigin)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      allowedOrigin,
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(response.headers['access-control-expose-headers']).toBe(
      'X-Request-Id,Retry-After,RateLimit,RateLimit-Policy',
    );
  });

  it('does not allow an origin outside the list', async () => {
    const response = await request(setup([allowedOrigin]))
      .get('/health')
      .set('Origin', 'https://attacker.example')
      .expect(200);

    expect(
      response.headers['access-control-allow-origin'],
    ).toBeUndefined();
  });

  it('answers preflight for a configured origin', async () => {
    const response = await request(setup([allowedOrigin]))
      .options('/api/v1/auth/password')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      allowedOrigin,
    );
    expect(response.headers['access-control-allow-methods']).toBe(
      'GET,POST,PUT,PATCH,DELETE',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type',
    );
    expect(response.headers['access-control-max-age']).toBe('600');
  });
});
