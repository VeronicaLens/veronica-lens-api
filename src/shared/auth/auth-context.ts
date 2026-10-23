import type { PublicUser } from '../../modules/auth/auth.types.js';

export interface AuthContext {
  user: PublicUser;
  accessToken: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}