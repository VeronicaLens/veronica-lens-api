export type ProbeStatus = 'up' | 'down';

export interface ProbeResult {
  status: ProbeStatus;
  latencyMs: number;
}

export interface ConnectivityProbe {
  check(): Promise<ProbeResult>;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// Auth's health route is public, so it needs no credentials.
export class SupabaseHealthProbe implements ConnectivityProbe {
  private readonly healthUrl: string;

  constructor(
    supabaseUrl: string,
    private readonly timeoutMs = 3000,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.healthUrl = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`;
  }

  async check(): Promise<ProbeResult> {
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
