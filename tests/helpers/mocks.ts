import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

import type { AccountModelPort } from '../../src/modules/account/account.model.js';
import type { EphemerisProviderPort } from '../../src/modules/astronomy/index.js';
import type { EventsModelPort } from '../../src/modules/events/events.model.js';
import type { WeatherProviderPort } from '../../src/modules/weather/index.js';
import type { AuthModelPort } from '../../src/modules/auth/auth.model.js';
import { StaticCatalogModel } from '../../src/modules/catalog/catalog.model.js';
import type { AvatarStoragePort } from '../../src/modules/profile/avatar.storage.js';
import type { ProfileModelPort } from '../../src/modules/profile/profile.model.js';

// Supabase Auth SDK methods used by SupabaseAuthModel.
export function createAuthClientMock() {
  return {
    signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
    signInWithPassword:
      vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
    signInWithIdToken:
      vi.fn<SupabaseClient['auth']['signInWithIdToken']>(),
    refreshSession: vi.fn<SupabaseClient['auth']['refreshSession']>(),
    getUser: vi.fn<SupabaseClient['auth']['getUser']>(),
    resetPasswordForEmail:
      vi.fn<SupabaseClient['auth']['resetPasswordForEmail']>(),
    setSession: vi.fn<SupabaseClient['auth']['setSession']>(),
    updateUser: vi.fn<SupabaseClient['auth']['updateUser']>(),
    admin: {
      signOut: vi.fn<SupabaseClient['auth']['admin']['signOut']>(),
    },
  };
}

export function createAuthModelMock() {
  return {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    signInWithGoogle: vi.fn<AuthModelPort['signInWithGoogle']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
    getUser: vi.fn<AuthModelPort['getUser']>(),
    signOut: vi.fn<AuthModelPort['signOut']>(),
    requestPasswordRecovery:
      vi.fn<AuthModelPort['requestPasswordRecovery']>(),
    updatePassword: vi.fn<AuthModelPort['updatePassword']>(),
  } satisfies AuthModelPort;
}

export function createProfileModelMock() {
  return {
    findById: vi.fn<ProfileModelPort['findById']>(),
    update: vi.fn<ProfileModelPort['update']>(),
  } satisfies ProfileModelPort;
}

export function createAvatarStorageMock() {
  return {
    upload: vi.fn<AvatarStoragePort['upload']>(),
    remove: vi.fn<AvatarStoragePort['remove']>(),
  } satisfies AvatarStoragePort;
}

export function createAccountModelMock() {
  return {
    listObservationMediaPaths:
      vi.fn<AccountModelPort['listObservationMediaPaths']>(),
    listAvatarPaths: vi.fn<AccountModelPort['listAvatarPaths']>(),
    removeFiles: vi.fn<AccountModelPort['removeFiles']>(),
    deleteUser: vi.fn<AccountModelPort['deleteUser']>(),
  } satisfies AccountModelPort;
}

export function createEphemerisProviderMock() {
  return {
    getApparentPosition:
      vi.fn<EphemerisProviderPort['getApparentPosition']>(),
  } satisfies EphemerisProviderPort;
}

export function createWeatherProviderMock() {
  return {
    getHourlyForecast: vi.fn<WeatherProviderPort['getHourlyForecast']>(),
  } satisfies WeatherProviderPort;
}

export function createEventsModelMock() {
  return {
    findMany: vi.fn<EventsModelPort['findMany']>(),
    findById: vi.fn<EventsModelPort['findById']>(),
  } satisfies EventsModelPort;
}

// Every dependency required by createApp; override only what a test uses.
export function createAppMocks() {
  return {
    authModel: createAuthModelMock(),
    profileModel: createProfileModelMock(),
    avatarStorage: createAvatarStorageMock(),
    accountModel: createAccountModelMock(),
    // Static data with no external dependency; the real model is used.
    catalogModel: new StaticCatalogModel(),
    ephemerisProvider: createEphemerisProviderMock(),
    weatherProvider: createWeatherProviderMock(),
    eventsModel: createEventsModelMock(),
  };
}
