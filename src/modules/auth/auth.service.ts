import type {
  AuthError,
  Session,
  User,
} from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import type { AuthModelPort } from './auth.model.js';
import type {
  RefreshSessionInput,
  SignInInput,
  SignUpInput,
} from './auth.schemas.js';
import type {
  PublicSession,
  PublicUser,
  SignUpResult,
} from './auth.types.js';

function invalidProviderResponse(): never {
  logger.error('Authentication provider returned invalid data');

  throw new AppError(
    502,
    'AUTH_RESPONSE_INVALID',
    'Authentication provider returned invalid data',
  );
}

function toPublicUser(user: User): PublicUser {
  if (
    typeof user.id !== 'string' ||
    user.id.length === 0 ||
    typeof user.email !== 'string' ||
    user.email.length === 0
  ) {
    return invalidProviderResponse();
  }

  const displayName: unknown = user.user_metadata?.display_name;

  return {
    id: user.id,
    email: user.email,
    displayName:
      typeof displayName === 'string' && displayName.trim().length > 0
        ? displayName.trim()
        : null,
  };
}

function toPublicSession(session: Session): PublicSession {
  if (
    !session.user ||
    typeof session.access_token !== 'string' ||
    session.access_token.length === 0 ||
    typeof session.refresh_token !== 'string' ||
    session.refresh_token.length === 0 ||
    session.token_type !== 'bearer' ||
    typeof session.expires_at !== 'number' ||
    !Number.isInteger(session.expires_at) ||
    session.expires_at <= 0
  ) {
    return invalidProviderResponse();
  }

  const expiresAt = new Date(session.expires_at * 1000);

  if (Number.isNaN(expiresAt.getTime())) {
    return invalidProviderResponse();
  }

  return {
    user: toPublicUser(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: 'bearer',
    expiresAt: expiresAt.toISOString(),
  };
}

function throwAuthError(error: AuthError): never {
  if (error.status === 429) {
    throw new AppError(
      429,
      'AUTH_RATE_LIMITED',
      'Too many authentication attempts',
    );
  }

  if (
    error.name === 'AuthRetryableFetchError' ||
    (error.status !== undefined && error.status >= 500)
  ) {
    logger.error(
      { providerStatus: error.status },
      'Authentication provider unavailable',
    );

    throw new AppError(
      503,
      'AUTH_UNAVAILABLE',
      'Authentication service is temporarily unavailable',
    );
  }

  switch (error.code) {
    case 'invalid_credentials':
      throw new AppError(
        401,
        'AUTH_INVALID_CREDENTIALS',
        'Invalid authentication credentials',
      );

    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'session_not_found':
    case 'session_expired':
      throw new AppError(
        401,
        'AUTH_SESSION_INVALID',
        'Authentication session is invalid or expired',
      );

    case 'email_not_confirmed':
      throw new AppError(
        403,
        'AUTH_EMAIL_NOT_CONFIRMED',
        'Email confirmation is required',
      );

    case 'weak_password':
    case 'email_address_invalid':
    case 'user_already_exists':
    case 'email_exists':
      throw new AppError(
        400,
        'AUTH_REQUEST_REJECTED',
        'Authentication request could not be completed',
      );

    default:
      logger.error(
        { providerStatus: error.status },
        'Unrecognized authentication provider error',
      );

      throw new AppError(
        502,
        'AUTH_PROVIDER_ERROR',
        'Authentication service returned an unexpected error',
      );
  }
}

export class AuthService {
  constructor(private readonly model: AuthModelPort) {}

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const result = await this.model.signUp(input);

    if (result.error) {
      throwAuthError(result.error);
    }

    if (!result.user) {
      return invalidProviderResponse();
    }

    const user = toPublicUser(result.user);
    const session = result.session
      ? toPublicSession(result.session)
      : null;

    if (session && session.user.id !== user.id) {
      return invalidProviderResponse();
    }

    return {
      user,
      session,
      confirmationRequired: session === null,
    };
  }

  async signIn(input: SignInInput): Promise<PublicSession> {
    const result = await this.model.signIn(input);

    if (result.error) {
      throwAuthError(result.error);
    }

    if (!result.session) {
      return invalidProviderResponse();
    }

    return toPublicSession(result.session);
  }

  async refresh(
    input: RefreshSessionInput,
  ): Promise<PublicSession> {
    const result = await this.model.refresh(input);

    if (result.error) {
      throwAuthError(result.error);
    }

    if (!result.session) {
      return invalidProviderResponse();
    }

    return toPublicSession(result.session);
  }

  async authenticate(accessToken: string): Promise<PublicUser> {
    const result = await this.model.getUser(accessToken);

    if (result.error) {
      const invalidTokenCodes = [
        'bad_jwt',
        'jwt_expired',
        'user_not_found',
        'session_not_found',
        'session_expired',
      ];

      if (
        result.error.status === 401 ||
        result.error.status === 403 ||
        (
          result.error.code !== undefined &&
          invalidTokenCodes.includes(result.error.code)
        )
      ) {
        throw new AppError(
          401,
          'AUTH_TOKEN_INVALID',
          'Authentication token is invalid or expired',
        );
      }

      throwAuthError(result.error);
    }

    if (!result.user) {
      return invalidProviderResponse();
    }

    return toPublicUser(result.user);
  }
}