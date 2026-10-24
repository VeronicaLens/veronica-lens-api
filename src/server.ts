import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createAuthClient, createUserClient } from './config/supabase.js';
import { SupabaseAuthModel } from './modules/auth/auth.model.js';
import { SupabaseProfileModel } from './modules/profile/profile.model.js';
import { logger } from './shared/logging/logger.js';

const env = loadEnv();

const authModel = new SupabaseAuthModel(
  () => createAuthClient(env).auth,
  env.PASSWORD_RESET_REDIRECT_URL,
);

const profileModel = new SupabaseProfileModel((accessToken) =>
  createUserClient(env, accessToken),
);

const app = createApp({
  authModel,
  profileModel,
  corsOrigins: env.CORS_ORIGINS,
  httpsOnly: env.NODE_ENV === 'production',
});

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