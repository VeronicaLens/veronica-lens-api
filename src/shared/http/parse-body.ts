import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error.js';

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request body is invalid',
    );
  }

  return result.data;
}