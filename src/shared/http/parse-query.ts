import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error.js';

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);

  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Query parameters are invalid',
    );
  }

  return result.data;
}
