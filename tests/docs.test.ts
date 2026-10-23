import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { AuthModelPort } from '../src/modules/auth/auth.model.js';

function setup() {
  const model = {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
    getUser: vi.fn<AuthModelPort['getUser']>(),
  };

  return {
    model,
    app: createApp({ authModel: model }),
  };
}

describe('API documentation', () => {
  it('serves the OpenAPI document', async () => {
    const { app, model } = setup();

    const response = await request(app)
      .get('/openapi.json')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.openapi).toBe('3.0.3');

    expect(Object.keys(response.body.paths).sort()).toEqual([
      '/api/v1/auth/me',
      '/api/v1/auth/refresh',
      '/api/v1/auth/sign-in',
      '/api/v1/auth/sign-up',
      '/health',
    ]);

    expect(
      response.body.paths['/api/v1/auth/me'].get.security,
    ).toEqual([{ bearerAuth: [] }]);

    expect(model.signUp).not.toHaveBeenCalled();
    expect(model.signIn).not.toHaveBeenCalled();
    expect(model.refresh).not.toHaveBeenCalled();
    expect(model.getUser).not.toHaveBeenCalled();
  });

  it('serves the Swagger UI page', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/docs/')
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toContain('swagger-ui');
  });

  it('serves Swagger UI assets', async () => {
    const { app } = setup();

    await request(app)
      .get('/docs/swagger-ui.css')
      .expect('Content-Type', /css/)
      .expect(200);
  });
});