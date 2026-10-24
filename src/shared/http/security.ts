import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

// HTTPS-only protections would break plain-HTTP access in development,
// for example opening /docs/ from a phone through the LAN IP.
export function createSecurityHeaders(httpsOnly: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: httpsOnly ? [] : null,
      },
    },
    strictTransportSecurity: httpsOnly,
  });
}

export function createCorsMiddleware(
  allowedOrigins: readonly string[],
): RequestHandler {
  return cors({
    origin: allowedOrigins.length > 0 ? [...allowedOrigins] : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'RateLimit',
      'RateLimit-Policy',
    ],
    // Bearer tokens only; cookies are never accepted cross-origin.
    credentials: false,
    maxAge: 600,
  });
}
