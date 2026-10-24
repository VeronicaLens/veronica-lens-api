import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import {
  createAdminClient,
  createAuthClient,
  createUserClient,
} from './config/supabase.js';
import { SupabaseAccountModel } from './modules/account/account.model.js';
import {
  CachedEphemerisProvider,
  HorizonsClient,
} from './modules/astronomy/index.js';
import { SupabaseAuthModel } from './modules/auth/auth.model.js';
import { StaticCatalogModel } from './modules/catalog/catalog.model.js';
import { SupabaseEventsModel } from './modules/events/events.model.js';
import { SupabaseLearningModel } from './modules/learning/learning.model.js';
import { SupabaseObservationsModel } from './modules/observations/observations.model.js';
import { ExpoPushClient } from './modules/notifications/expo-push.client.js';
import { SupabaseDeviceModel } from './modules/notifications/notifications.model.js';
import { SupabaseDispatchModel } from './modules/notifications/notifications.dispatch-model.js';
import { NotificationsService } from './modules/notifications/notifications.service.js';
import { SupabaseAvatarStorage } from './modules/profile/avatar.storage.js';
import { SupabaseProfileModel } from './modules/profile/profile.model.js';
import {
  CachedWeatherProvider,
  OpenMeteoClient,
} from './modules/weather/index.js';
import { logger } from './shared/logging/logger.js';

const env = loadEnv();

const authModel = new SupabaseAuthModel(
  () => createAuthClient(env).auth,
  env.PASSWORD_RESET_REDIRECT_URL,
);

const createClientForUser = (accessToken: string) =>
  createUserClient(env, accessToken);

const profileModel = new SupabaseProfileModel(createClientForUser);
const avatarStorage = new SupabaseAvatarStorage(createClientForUser);

const adminClient = createAdminClient(env);
const accountModel = new SupabaseAccountModel(() => adminClient);

const notificationsService = new NotificationsService(
  new SupabaseDeviceModel(createClientForUser),
  new SupabaseDispatchModel(adminClient),
  new ExpoPushClient(),
);

const app = createApp({
  authModel,
  profileModel,
  avatarStorage,
  accountModel,
  catalogModel: new StaticCatalogModel(),
  ephemerisProvider: new CachedEphemerisProvider(new HorizonsClient()),
  weatherProvider: new CachedWeatherProvider(new OpenMeteoClient()),
  eventsModel: new SupabaseEventsModel(createClientForUser),
  learningModel: new SupabaseLearningModel(createClientForUser),
  observationsModel: new SupabaseObservationsModel(createClientForUser),
  notificationsService,
  notificationsDispatchSecret: env.NOTIFICATIONS_DISPATCH_SECRET,
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