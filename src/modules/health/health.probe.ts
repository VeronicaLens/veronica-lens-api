export type ProbeStatus = 'up' | 'down';

export interface ProbeResult {
  status: ProbeStatus;
  latencyMs: number;
}

export interface ConnectivityProbe {
  check(): Promise<ProbeResult>;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// Auth's health route is public, so it needs no credentials. Results are
// cached briefly, and concurrent callers share one in-flight request, so
// frequent polling of the connectivity route does not fan out to Supabase.
export class SupabaseHealthProbe implements ConnectivityProbe {
  private readonly healthUrl: string;
  private cached: { expiresAt: number; result: Promise<ProbeResult> } | undefined;

  constructor(
    supabaseUrl: string,
    private readonly timeoutMs = 3000,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly cacheTtlMs = 15_000,
  ) {
    this.healthUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`;
  }

  check(): Promise<ProbeResult> {
    const now = Date.now();

    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.result;
    }

    const result = this.probe();
    this.cached = { expiresAt: now + this.cacheTtlMs, result };

    return result;
  }

  private async probe(): Promise<ProbeResult> {
    const startedAt = Date.now();

    try {
      const response = await this.fetchImpl(this.healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      return {
        status: response.ok ? 'up' : 'down',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - startedAt };
    }
  }
}
