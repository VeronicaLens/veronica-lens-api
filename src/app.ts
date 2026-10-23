import express from 'express';

import type { AuthModelPort } from './modules/auth/auth.model.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found.js';
import { requestLogger } from './shared/http/request-logger.js';

interface AppOptions {
  authModel: AuthModelPort;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/auth', createAuthRouter(options.authModel));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}