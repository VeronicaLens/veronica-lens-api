import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .pipe(z.email().max(254))
  .transform((value) => value.toLowerCase());

export const signUpSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(100).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export const refreshSessionSchema = z.object({
  refreshToken: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
});

export type RefreshSessionInput = z.infer<
  typeof refreshSessionSchema
>;