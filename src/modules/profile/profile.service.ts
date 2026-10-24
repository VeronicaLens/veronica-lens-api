import type { PostgrestError } from '@supabase/supabase-js';

import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { detectImageType, type AvatarFile } from './avatar-image.js';
import type { AvatarStoragePort, StorageError } from './avatar.storage.js';
import type {
  ProfileChanges,
  ProfileModelPort,
  ProfileResult,
  ProfileRow,
} from './profile.model.js';
import type { UpdateProfileInput } from './profile.schemas.js';
import type { Profile } from './profile.types.js';

// PostgREST JWT errors: missing, invalid or expired token.
const TOKEN_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

// Postgres check violation and numeric overflow.
const REJECTED_VALUE_CODES = new Set(['23514', '22003']);

function throwProfileError(error: PostgrestError): never {
  if (TOKEN_ERROR_CODES.has(error.code)) {
    throw new AppError(
      401,
      'AUTH_TOKEN_INVALID',
      'Authentication token is invalid or expired',
    );
  }

  if (REJECTED_VALUE_CODES.has(error.code)) {
    throw new AppError(
      400,
      'PROFILE_REJECTED',
      'Profile values were rejected',
    );
  }

  logger.error({ providerCode: error.code }, 'Profile provider error');

  throw new AppError(
    503,
    'PROFILE_UNAVAILABLE',
    'Profile service is temporarily unavailable',
  );
}

function throwStorageError(error: StorageError): never {
  if (error.status === 401) {
    throw new AppError(
      401,
      'AUTH_TOKEN_INVALID',
      'Authentication token is invalid or expired',
    );
  }

  if (error.status === 413) {
    throw new AppError(413, 'AVATAR_TOO_LARGE', 'Avatar exceeds 5 MB');
  }

  if (error.status === 415) {
    throw new AppError(
      415,
      'AVATAR_TYPE_UNSUPPORTED',
      'Avatar must be a JPEG, PNG or WebP image',
    );
  }

  logger.error(
    { providerStatus: error.status, providerCode: error.statusCode },
    'Avatar storage error',
  );

  throw new AppError(
    503,
    'AVATAR_STORAGE_UNAVAILABLE',
    'Avatar storage is temporarily unavailable',
  );
}

function toCoordinate(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    locationName: row.location_name,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    notificationsEnabled: row.notifications_enabled,
    measurementUnit: row.measurement_unit,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChanges(input: UpdateProfileInput): ProfileChanges {
  return {
    ...(input.displayName !== undefined && {
      display_name: input.displayName,
    }),
    ...(input.locationName !== undefined && {
      location_name: input.locationName,
    }),
    ...(input.latitude !== undefined && { latitude: input.latitude }),
    ...(input.longitude !== undefined && { longitude: input.longitude }),
    ...(input.notificationsEnabled !== undefined && {
      notifications_enabled: input.notificationsEnabled,
    }),
    ...(input.measurementUnit !== undefined && {
      measurement_unit: input.measurementUnit,
    }),
    ...(input.language !== undefined && { language: input.language }),
  };
}

function requireProfile(result: ProfileResult, userId: string): Profile {
  if (result.error) {
    throwProfileError(result.error);
  }

  if (!result.profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Profile was not found');
  }

  if (result.profile.id !== userId) {
    logger.error('Profile provider returned another user profile');

    throw new AppError(
      502,
      'PROFILE_RESPONSE_INVALID',
      'Profile service returned invalid data',
    );
  }

  return toProfile(result.profile);
}

export class ProfileService {
  constructor(
    private readonly model: ProfileModelPort,
    private readonly avatarStorage: AvatarStoragePort,
    private readonly now: () => number = Date.now,
  ) {}

  async get(auth: AuthContext): Promise<Profile> {
    const result = await this.model.findById(
      auth.accessToken,
      auth.user.id,
    );

    return requireProfile(result, auth.user.id);
  }

  async update(
    auth: AuthContext,
    input: UpdateProfileInput,
  ): Promise<Profile> {
    const result = await this.model.update(
      auth.accessToken,
      auth.user.id,
      toChanges(input),
    );

    return requireProfile(result, auth.user.id);
  }

  async uploadAvatar(auth: AuthContext, file: AvatarFile): Promise<Profile> {
    if (detectImageType(file.bytes) !== file.contentType) {
      throw new AppError(
        400,
        'AVATAR_INVALID',
        'File content does not match the declared image type',
      );
    }

    const upload = await this.avatarStorage.upload(
      auth.accessToken,
      auth.user.id,
      file,
    );

    if (upload.error) {
      throwStorageError(upload.error);
    }

    if (!upload.publicUrl) {
      throw new AppError(
        502,
        'AVATAR_RESPONSE_INVALID',
        'Avatar storage returned invalid data',
      );
    }

    // The query string changes the URL on every upload to bypass caches.
    const avatarUrl = `${upload.publicUrl}?v=${this.now()}`;
    const result = await this.model.update(auth.accessToken, auth.user.id, {
      avatar_url: avatarUrl,
    });

    return requireProfile(result, auth.user.id);
  }

  async removeAvatar(auth: AuthContext): Promise<Profile> {
    const removal = await this.avatarStorage.remove(
      auth.accessToken,
      auth.user.id,
    );

    if (removal.error) {
      throwStorageError(removal.error);
    }

    const result = await this.model.update(auth.accessToken, auth.user.id, {
      avatar_url: null,
    });

    return requireProfile(result, auth.user.id);
  }
}
