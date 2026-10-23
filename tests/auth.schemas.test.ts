import { describe, expect, it } from 'vitest';

import {
  signInSchema,
  signUpSchema,
} from '../src/modules/auth/auth.schemas.js';

describe('signUpSchema', () => {
  const validInput = {
    email: 'user@example.com',
    password: 'valid-password',
  };

  it('normalizes email and display name', () => {
    const result = signUpSchema.parse({
      ...validInput,
      email: ' User@Example.com ',
      displayName: '  Veronica  ',
    });

    expect(result).toEqual({
      email: 'user@example.com',
      password: 'valid-password',
      displayName: 'Veronica',
    });
  });

  it('allows registration without a display name', () => {
    expect(signUpSchema.parse(validInput)).toEqual(validInput);
  });

  it.each([8, 72])('accepts password length %i', (length) => {
    const result = signUpSchema.safeParse({
      ...validInput,
      password: 'x'.repeat(length),
    });

    expect(result.success).toBe(true);
  });

  it.each([0, 7, 73])('rejects password length %i', (length) => {
    const result = signUpSchema.safeParse({
      ...validInput,
      password: 'x'.repeat(length),
    });

    expect(result.success).toBe(false);
  });

  it('preserves spaces in passwords', () => {
    const password = '  valid-password  ';

    expect(
      signUpSchema.parse({ ...validInput, password }).password,
    ).toBe(password);
  });

  it('rejects invalid email', () => {
    expect(
      signUpSchema.safeParse({
        ...validInput,
        email: 'invalid',
      }).success,
    ).toBe(false);
  });

  it.each(['   ', 'x'.repeat(101)])(
    'rejects invalid display name',
    (displayName) => {
      expect(
        signUpSchema.safeParse({
          ...validInput,
          displayName,
        }).success,
      ).toBe(false);
    },
  );

  it('discards fields not declared in the schema', () => {
    expect(
      signUpSchema.parse({
        ...validInput,
        role: 'admin',
      }),
    ).toEqual(validInput);
  });
});

describe('signInSchema', () => {
  it('accepts a short nonempty password for login', () => {
    expect(
      signInSchema.parse({
        email: 'user@example.com',
        password: 'x',
      }),
    ).toEqual({
      email: 'user@example.com',
      password: 'x',
    });
  });

  it.each(['', 'x'.repeat(73)])(
    'rejects an invalid password',
    (password) => {
      expect(
        signInSchema.safeParse({
          email: 'user@example.com',
          password,
        }).success,
      ).toBe(false);
    },
  );
});