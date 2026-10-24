import { vi } from 'vitest';

import type { AuthModelPort } from '../../src/modules/auth/auth.model.js';
import type { AvatarStoragePort } from '../../src/modules/profile/avatar.storage.js';
import type { ProfileModelPort } from '../../src/modules/profile/profile.model.js';

export function createAuthModelMock() {
  return {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
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

// Every dependency required by createApp; override only what a test uses.
export function createAppMocks() {
  return {
    authModel: createAuthModelMock(),
    profileModel: createProfileModelMock(),
    avatarStorage: createAvatarStorageMock(),
  };
}
