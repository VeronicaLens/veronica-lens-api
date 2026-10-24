import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createAppMocks, createAuthModelMock } from './helpers/mocks.js';

function setup() {
  const model = createAuthModelMock();

  return {
    model,
    app: createApp({ ...createAppMocks(), authModel: model }),
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
      '/api/v1/account',
      '/api/v1/auth/google',
      '/api/v1/auth/me',
      '/api/v1/auth/password',
      '/api/v1/auth/password/recovery',
      '/api/v1/auth/refresh',
      '/api/v1/auth/sign-in',
      '/api/v1/auth/sign-out',
      '/api/v1/auth/sign-up',
      '/api/v1/catalog/celestial-objects',
      '/api/v1/catalog/celestial-objects/{id}',
      '/api/v1/conditions/current',
      '/api/v1/conditions/forecast',
      '/api/v1/planning/recommendation',
      '/api/v1/profile',
      '/api/v1/profile/avatar',
      '/api/v1/sky-guide/positions',
      '/health',
    ]);

    expect(
      response.body.paths['/api/v1/auth/me'].get.security,
    ).toEqual([{ bearerAuth: [] }]);

    expect(model.signUp).not.toHaveBeenCalled();
    expect(model.signIn).not.toHaveBeenCalled();
    expect(model.refresh).not.toHaveBeenCalled();
    expect(model.getUser).not.toHaveBeenCalled();
    expect(model.signOut).not.toHaveBeenCalled();
    expect(model.requestPasswordRecovery).not.toHaveBeenCalled();
    expect(
      response.body.paths['/api/v1/auth/sign-out'].post.security,
    ).toEqual([{ bearerAuth: [] }]);
  });

  it('documents the password recovery input and generic response', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/openapi.json')
      .expect(200);

    const operation =
      response.body.paths['/api/v1/auth/password/recovery'].post;

    expect(operation.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/PasswordRecoveryInput',
          },
        },
      },
    });
    expect(
      response.body.components.schemas.PasswordRecoveryInput,
    ).toEqual({
      type: 'object',
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          format: 'email',
          maxLength: 254,
        },
      },
    });
    expect(operation.security).toBeUndefined();
    expect(
      operation.responses['202'].content['application/json'].schema
        .properties.data.properties.message.enum,
    ).toEqual([
      'If the account exists, password recovery instructions were sent.',
    ]);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '202', '400', '413', '429', '500', '502', '503',
    ]);
  });

  it('documents the protected password update', async () => {
    const { app, model } = setup();

    const response = await request(app)
      .get('/openapi.json')
      .expect(200);

    const operation = response.body.paths['/api/v1/auth/password'].put;

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(
      operation.requestBody.content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/UpdatePasswordInput' });
    expect(
      response.body.components.schemas.UpdatePasswordInput.required,
    ).toEqual(['password', 'refreshToken']);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200', '400', '401', '403', '413', '429', '500', '502', '503',
    ]);
    expect(model.updatePassword).not.toHaveBeenCalled();
  });

  it('documents the protected profile operations', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/openapi.json')
      .expect(200);

    const path = response.body.paths['/api/v1/profile'];
    const input = response.body.components.schemas.UpdateProfileInput;

    expect(path.get.security).toEqual([{ bearerAuth: [] }]);
    expect(path.patch.security).toEqual([{ bearerAuth: [] }]);
    expect(path.patch.requestBody.content['application/json'].schema).toEqual(
      { $ref: '#/components/schemas/UpdateProfileInput' },
    );
    expect(input.additionalProperties).toBe(false);
    expect(input.properties.avatarUrl).toBeUndefined();
    expect(Object.keys(path.patch.responses).sort()).toEqual([
      '200', '400', '401', '404', '413', '500', '502', '503',
    ]);

    const avatar = response.body.paths['/api/v1/profile/avatar'];

    expect(avatar.put.security).toEqual([{ bearerAuth: [] }]);
    expect(avatar.delete.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(avatar.put.requestBody.content).sort()).toEqual([
      'image/jpeg', 'image/png', 'image/webp',
    ]);
  });

  it('documents the protected account deletion', async () => {
    const { app } = setup();

    const response = await request(app)
      .get('/openapi.json')
      .expect(200);

    const operation = response.body.paths['/api/v1/account'].delete;

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(
      response.body.components.schemas.DeleteAccountInput.properties
        .confirmation.enum,
    ).toEqual(['DELETE']);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '204', '400', '401', '500', '503',
    ]);
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