import express from 'express';

import type { AuthModelPort } from './modules/auth/auth.model.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import type { ProfileModelPort } from './modules/profile/profile.model.js';
import type { AvatarStoragePort } from './modules/profile/avatar.storage.js';
import { createProfileRouter } from './modules/profile/profile.routes.js';
import { createAuthenticateMiddleware } from './shared/auth/authenticate.middleware.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found.js';
import { requestLogger } from './shared/http/request-logger.js';
import {
  createCorsMiddleware,
  createSecurityHeaders,
} from './shared/http/security.js';
import { createDocsRouter } from './docs/docs.routes.js';

interface AppOptions {
  authModel: AuthModelPort;
  profileModel: ProfileModelPort;
  avatarStorage: AvatarStoragePort;
  corsOrigins?: readonly string[];
  httpsOnly?: boolean;
}

export function createApp(options: AppOptions) {
  const app = express();
  const authenticate = createAuthenticateMiddleware(
    new AuthService(options.authModel),
  );

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(createSecurityHeaders(options.httpsOnly ?? false));
  app.use(createCorsMiddleware(options.corsOrigins ?? []));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/auth', createAuthRouter(options.authModel));
  app.use(
    '/api/v1/profile',
    createProfileRouter(
      options.profileModel,
      options.avatarStorage,
      authenticate,
    ),
  );
  app.use(createDocsRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}