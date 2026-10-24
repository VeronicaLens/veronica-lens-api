import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp as createApplication } from '../src/app.js';
import { createAuthModelMock, createProfileModelMock } from './helpers/mocks.js';

function createApp() {
  const authModel = createAuthModelMock();

  return createApplication({ authModel, profileModel: createProfileModelMock() });
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('HTTP application', () => {
  it('returns the health status', async () => {
    const response = await request(createApp())
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });

    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns a standard error for unknown routes', async () => {
    const response = await request(createApp())
      .get('/does-not-exist')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  it('rejects malformed JSON', async () => {
    const response = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"invalid":')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
      },
    });

    expect(response.headers['x-request-id']).toMatch(uuidPattern);
  });

  it('rejects bodies larger than 1 MB', async () => {
    const response = await request(createApp())
      .post('/health')
      .send({ text: 'x'.repeat(1024 * 1024) })
      .expect(413);

    expect(response.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the allowed size',
      },
    });
  });

  it('generates a different request ID for each request', async () => {
    const app = createApp();

    const first = await request(app).get('/health').expect(200);
    const second = await request(app).get('/health').expect(200);

    expect(first.headers['x-request-id']).toMatch(uuidPattern);
    expect(second.headers['x-request-id']).toMatch(uuidPattern);
    expect(first.headers['x-request-id']).not.toBe(
      second.headers['x-request-id'],
    );
  });

  it('does not trust a request ID supplied by the client', async () => {
    const response = await request(createApp())
      .get('/health')
      .set('X-Request-Id', 'client-controlled-id')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(response.headers['x-request-id']).not.toBe(
      'client-controlled-id',
    );
  });
});