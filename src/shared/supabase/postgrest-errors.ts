import type { PostgrestError } from '@supabase/supabase-js';

import { AppError } from '../errors/app-error.js';

// PostgREST JWT errors: missing, invalid or expired token.
const TOKEN_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

export function throwIfTokenRejected(error: PostgrestError): void {
  if (TOKEN_ERROR_CODES.has(error.code)) {
    throw new AppError(
      401,
      'AUTH_TOKEN_INVALID',
      'Authentication token is invalid or expired',
    );
  }
}
