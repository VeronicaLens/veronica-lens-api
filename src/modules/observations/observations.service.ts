import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { throwIfTokenRejected } from '../../shared/supabase/postgrest-errors.js';
import {
  matchesObservationPhotoType,
  type ObservationPhotoContentType,
} from './observation-photo.js';
import type { ObservationPhotoMetadata, ObservationHistoryQuery } from './observations.schemas.js';
import {
  ObservationStoreError,
  type ObservationStoreFailure,
  type ObservationsModelPort,
} from './observations.model.js';
import type {
  ObservationHistoryPage,
  ObservationPhotoResult,
} from './observations.types.js';

export interface SavePhotoInput {
  observationId: string;
  photoId: string;
  contentType: ObservationPhotoContentType;
  bytes: Buffer;
  metadata: ObservationPhotoMetadata;
}

export interface PhotoParams {
  observationId: string;
  photoId: string;
}

export interface ObservationParams {
  observationId: string;
}

export class ObservationsService {
  constructor(private readonly model: ObservationsModelPort) {}

  list(
    auth: AuthContext,
    query: ObservationHistoryQuery,
  ): Promise<ObservationHistoryPage> {
    return this.run(() =>
      this.model.list(auth.accessToken, { userId: auth.user.id, ...query }),
    );
  }

  async savePhoto(
    auth: AuthContext,
    input: SavePhotoInput,
  ): Promise<ObservationPhotoResult> {
    if (!matchesObservationPhotoType(input.bytes, input.contentType)) {
      throw new AppError(
        400,
        'OBSERVATION_PHOTO_INVALID',
        'File content does not match the declared image type',
      );
    }

    return this.run(() =>
      this.model.savePhoto(auth.accessToken, { ...input, userId: auth.user.id }),
    );
  }

  async deletePhoto(
    auth: AuthContext,
    params: PhotoParams,
  ): Promise<{ observationDeleted: boolean }> {
    const result = await this.run(() =>
      this.model.deletePhoto(auth.accessToken, { ...params, userId: auth.user.id }),
    );

    if (!result) {
      throw new AppError(404, 'PHOTO_NOT_FOUND', 'Astrophoto was not found');
    }

    return result;
  }

  async deleteObservation(
    auth: AuthContext,
    params: ObservationParams,
  ): Promise<void> {
    const deleted = await this.run(() =>
      this.model.deleteObservation(auth.accessToken, {
        ...params,
        userId: auth.user.id,
      }),
    );

    if (!deleted) {
      throw new AppError(404, 'OBSERVATION_NOT_FOUND', 'Observation was not found');
    }
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ObservationStoreError) {
        throw toAppError(error.failure);
      }
      throw error;
    }
  }
}

function toAppError(failure: ObservationStoreFailure): AppError {
  if (failure.source === 'database') {
    throwIfTokenRejected(failure.error);

    logger.error(
      { providerCode: failure.error.code },
      'Observation database error',
    );

    return new AppError(
      503,
      'OBSERVATION_UNAVAILABLE',
      'Observation service is temporarily unavailable',
    );
  }

  const { error } = failure;

  if (error.status === 401) {
    return new AppError(
      401,
      'AUTH_TOKEN_INVALID',
      'Authentication token is invalid or expired',
    );
  }

  if (error.status === 413) {
    return new AppError(413, 'PHOTO_TOO_LARGE', 'Astrophoto exceeds 50 MB');
  }

  if (error.status === 415) {
    return new AppError(
      415,
      'PHOTO_TYPE_UNSUPPORTED',
      'Astrophoto must be a JPEG, PNG, WebP, HEIC or HEIF image',
    );
  }

  logger.error(
    { providerStatus: error.status, providerCode: error.statusCode },
    'Observation storage error',
  );

  return new AppError(
    503,
    'OBSERVATION_STORAGE_UNAVAILABLE',
    'Observation storage is temporarily unavailable',
  );
}
