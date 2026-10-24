import { describe, expect, it, vi } from 'vitest';

import { SupabaseHealthProbe } from '../../src/modules/health/health.probe.js';

describe('SupabaseHealthProbe', () => {
  it('reports up when Supabase auth health responds 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const probe = new SupabaseHealthProbe('https://project.supabase.co/', 3000, fetchImpl);

    const result = await probe.check();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/health',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    );
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports down on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const probe = new SupabaseHealthProbe('https://project.supabase.co', 3000, fetchImpl);

    expect((await probe.check()).status).toBe('down');
  });

  it('reports down when the network call throws, without leaking the error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed secret-host'));
    const probe = new SupabaseHealthProbe('https://project.supabase.co', 3000, fetchImpl);

    const result = await probe.check();

    expect(result).toEqual({ status: 'down', latencyMs: expect.any(Number) });
    expect(JSON.stringify(result)).not.toContain('secret-host');
  });

  it('reports down when the call exceeds the timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const probe = new SupabaseHealthProbe('https://project.supabase.co', 10, fetchImpl);

    expect((await probe.check()).status).toBe('down');
  });
});
