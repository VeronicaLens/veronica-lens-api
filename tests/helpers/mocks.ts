import { vi } from 'vitest';

import type { AuthModelPort } from '../../src/modules/auth/auth.model.js';
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
