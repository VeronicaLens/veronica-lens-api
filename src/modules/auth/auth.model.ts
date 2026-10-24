import type {
  AuthError,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

import type {
  RefreshSessionInput,
  SignInInput,
  SignUpInput,
} from './auth.schemas.js';

export interface AuthSessionResult {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export interface AuthUserResult {
  user: User | null;
  error: AuthError | null;
}

export interface AuthOperationResult {
  error: AuthError | null;
}

export interface UpdatePasswordModelInput {
  userId: string;
  accessToken: string;
  refreshToken: string;
  password: string;
}

export type PasswordUpdateResult =
  | { status: 'updated'; user: User }
  | { status: 'failed'; error: AuthError }
  | { status: 'session-unusable' };

// updateUser renews sessions close to expiry, rotating tokens on the server.
const MIN_SESSION_VALIDITY_MS = 2 * 60 * 1000;

export interface AuthModelPort {
  signUp(input: SignUpInput): Promise<AuthSessionResult>;
  signIn(input: SignInInput): Promise<AuthSessionResult>;
  refresh(input: RefreshSessionInput): Promise<AuthSessionResult>;
  getUser(accessToken: string): Promise<AuthUserResult>;
  signOut(accessToken: string): Promise<AuthOperationResult>;
  requestPasswordRecovery(email: string): Promise<AuthOperationResult>;
  updatePassword(input: UpdatePasswordModelInput,): Promise<PasswordUpdateResult>;
}

type AuthClient = Pick<
  SupabaseClient['auth'],
  | 'signUp'
  | 'signInWithPassword'
  | 'refreshSession'
  | 'getUser'
  | 'resetPasswordForEmail'
  | 'setSession'
  | 'updateUser'
> & {
  admin: Pick<SupabaseClient['auth']['admin'], 'signOut'>;
};

export class SupabaseAuthModel implements AuthModelPort {
  constructor(
    private readonly createClient: () => AuthClient,
    private readonly passwordResetRedirectUrl: string,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthSessionResult> {
    const credentials = {
      email: input.email,
      password: input.password,
      ...(input.displayName !== undefined
        ? {
            options: {
              data: {
                display_name: input.displayName,
              },
            },
          }
        : {}),
    };

    const { data, error } =
      await this.createClient().signUp(credentials);

    return {
      user: data.user,
      session: data.session,
      error,
    };
  }

  async signIn(input: SignInInput): Promise<AuthSessionResult> {
    const { data, error } =
      await this.createClient().signInWithPassword({
        email: input.email,
        password: input.password,
      });

    return {
      user: data.user,
      session: data.session,
      error,
    };
  }

  async refresh(
    input: RefreshSessionInput,
  ): Promise<AuthSessionResult> {
    const { data, error } = await this.createClient().refreshSession({
      refresh_token: input.refreshToken,
    });

    return {
      user: data.user,
      session: data.session,
      error,
    };
  }

  async getUser(accessToken: string): Promise<AuthUserResult> {
    const { data, error } =
      await this.createClient().getUser(accessToken);

    return {
      user: data.user,
      error,
    };
  }

  async signOut(accessToken: string): Promise<AuthOperationResult> {
    const { error } = await this.createClient().admin.signOut(
      accessToken,
      'local',
    );

    return { error };
  }

  async requestPasswordRecovery(
    email: string,
  ): Promise<AuthOperationResult> {
    const { error } = await this.createClient().resetPasswordForEmail(
      email,
      {
        redirectTo: this.passwordResetRedirectUrl,
      },
    );

    return { error };
  }

  async updatePassword(
    input: UpdatePasswordModelInput,
  ): Promise<PasswordUpdateResult> {
    const client = this.createClient();

    const { data, error } = await client.setSession({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
    });

    if (error) {
      return { status: 'failed', error };
    }

    const expiresAt = data.session?.expires_at;

    if (
      data.user?.id !== input.userId ||
      data.session?.access_token !== input.accessToken ||
      expiresAt === undefined ||
      expiresAt * 1000 - Date.now() < MIN_SESSION_VALIDITY_MS
    ) {
      return { status: 'session-unusable' };
    }

    const result = await client.updateUser({
      password: input.password,
    });

    if (result.error) {
      return { status: 'failed', error: result.error };
    }

    return { status: 'updated', user: result.data.user };
  }
}