import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .pipe(z.email().max(254))
  .transform((value) => value.toLowerCase());

const newPasswordSchema = z.string().min(8).max(72);

const refreshTokenSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  displayName: z.string().trim().min(1).max(100).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export const refreshSessionSchema = z.object({
  refreshToken: refreshTokenSchema,
});

export type RefreshSessionInput = z.infer<
  typeof refreshSessionSchema
>;

export const passwordRecoverySchema = z.object({
  email: emailSchema,
});

export type PasswordRecoveryInput = z.infer<
  typeof passwordRecoverySchema
>;

export const updatePasswordSchema = z.object({
  password: newPasswordSchema,
  refreshToken: refreshTokenSchema,
});

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;