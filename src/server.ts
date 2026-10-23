import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { logger } from './shared/logging/logger.js';

const env = loadEnv();
const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    'API started',
  );
});

server.on('error', (error) => {
  logger.fatal(
    {
      errorType: error.name,
      errorCode: 'code' in error ? error.code : undefined,
    },
    'Failed to start HTTP server',
  );

  process.exitCode = 1;
});