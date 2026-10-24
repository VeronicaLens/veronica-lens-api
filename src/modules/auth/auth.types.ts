export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface PublicSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  tokenType: 'bearer';
  expiresAt: string;
}

export interface SignUpResult {
  user: PublicUser;
  session: PublicSession | null;
  confirmationRequired: boolean;
}