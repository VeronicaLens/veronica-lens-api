import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { HealthService } from '../../src/modules/health/health.service.js';
import {
  createAppMocks,
  createConnectivityProbeMock,
} from '../helpers/mocks.js';

describe('GET /api/v1/health/connectivity', () => {
  it('returns 200 with ok status when Supabase is reachable', async () => {
    const response = await request(createApp(createAppMocks()))
      .get('/api/v1/health/connectivity')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        checks: { supabase: { status: 'up', latencyMs: expect.any(Number) } },
        timestamp: expect.any(String),
      },
    });
  });

  it('returns 503 with degraded status when Supabase is unreachable', async () => {
    const probe = createConnectivityProbeMock();
    probe.check.mockResolvedValue({ status: 'down', latencyMs: 3000 });

    const response = await request(
      createApp({
        ...createAppMocks(),
        healthService: new HealthService(probe),
      }),
    )
      .get('/api/v1/health/connectivity')
      .expect('Content-Type', /json/)
      .expect(503);

    expect(response.body.data).toMatchObject({
      status: 'degraded',
      checks: { supabase: { status: 'down', latencyMs: 3000 } },
    });
  });

  it('keeps /health as a liveness check that does not call Supabase', async () => {
    const probe = createConnectivityProbeMock();

    await request(
      createApp({
        ...createAppMocks(),
        healthService: new HealthService(probe),
      }),
    )
      .get('/health')
      .expect(200);

    expect(probe.check).not.toHaveBeenCalled();
  });
});
