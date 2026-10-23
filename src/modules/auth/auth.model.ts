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

export interface AuthModelPort {
  signUp(input: SignUpInput): Promise<AuthSessionResult>;
  signIn(input: SignInInput): Promise<AuthSessionResult>;
  refresh(input: RefreshSessionInput): Promise<AuthSessionResult>;
  getUser(accessToken: string): Promise<AuthUserResult>;
}

type AuthClient = Pick<
  SupabaseClient['auth'],
  'signUp' | 'signInWithPassword' | 'refreshSession' | 'getUser'
>;

export class SupabaseAuthModel implements AuthModelPort {
  constructor(private readonly createClient: () => AuthClient) {}

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
}