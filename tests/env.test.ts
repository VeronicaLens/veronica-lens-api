import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

function validSource(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    PASSWORD_RESET_REDIRECT_URL:'veronicalens://auth/reset-password',
  };
}

describe('loadEnv', () => {
  it('uses defaults when optional variables are absent', () => {
    const env = loadEnv(validSource());

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
  });

  it('accepts explicit configuration', () => {
    const env = loadEnv({
      ...validSource(),
      NODE_ENV: 'production',
      PORT: '8080',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
  });

  it.each(['1', '65535'])('accepts boundary port %s', (port) => {
    expect(loadEnv({ ...validSource(), PORT: port }).PORT).toBe(
      Number(port),
    );
  });

  it.each(['', 'abc', '0', '-1', '65536', '3000.5'])(
    'rejects invalid port %j',
    (port) => {
      expect(() =>
        loadEnv({ ...validSource(), PORT: port }),
      ).toThrow(/PORT/);
    },
  );

  it('rejects an invalid environment name', () => {
    expect(() =>
      loadEnv({ ...validSource(), NODE_ENV: 'invalid' }),
    ).toThrow(/NODE_ENV/);
  });

  it('requires a Supabase URL', () => {
    const source = validSource();
    delete source.SUPABASE_URL;

    expect(() => loadEnv(source)).toThrow(/SUPABASE_URL/);
  });

  it.each(['invalid', 'ftp://example.com'])(
    'rejects invalid Supabase URL %s',
    (url) => {
      expect(() =>
        loadEnv({ ...validSource(), SUPABASE_URL: url }),
      ).toThrow(/SUPABASE_URL/);
    },
  );

  it('requires a nonempty publishable key', () => {
    expect(() =>
      loadEnv({
        ...validSource(),
        SUPABASE_PUBLISHABLE_KEY: '   ',
      }),
    ).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });

  it('does not expose invalid values in the error message', () => {
    const sensitiveValue = 'sensitive-invalid-environment';

    expect(() =>
      loadEnv({ ...validSource(), NODE_ENV: sensitiveValue }),
    ).toThrow(
      'Configuracao de ambiente invalida. Verifique: NODE_ENV.',
    );
  });

  it('rejects an unapproved password recovery redirect', () => {
    expect(() =>
      loadEnv({
        ...validSource(),
        PASSWORD_RESET_REDIRECT_URL: 'https://untrusted.example/reset',
      }),
    ).toThrow(/PASSWORD_RESET_REDIRECT_URL/);
  });
});