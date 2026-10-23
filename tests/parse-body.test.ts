import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../src/shared/errors/app-error.js';
import { parseBody } from '../src/shared/http/parse-body.js';

describe('parseBody', () => {
  const schema = z.object({
    name: z.string().trim().min(1),
  });

  it('returns parsed and transformed data', () => {
    expect(parseBody(schema, { name: '  Veronica  ' })).toEqual({
      name: 'Veronica',
    });
  });

  it('throws a standard application error for invalid input', () => {
    let thrown: unknown;

    try {
      parseBody(schema, { name: '' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);

    if (!(thrown instanceof AppError)) {
      throw new Error('Expected an AppError');
    }

    expect(thrown.statusCode).toBe(400);
    expect(thrown.code).toBe('VALIDATION_ERROR');
    expect(thrown.message).toBe('Request body is invalid');
  });

  it('rejects an absent request body', () => {
    expect(() => parseBody(schema, undefined)).toThrow(AppError);
  });
});