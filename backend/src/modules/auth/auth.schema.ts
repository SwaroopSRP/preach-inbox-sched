import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email address is required').transform((val) => val.trim().toLowerCase()),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(1, 'Name is required').transform((val) => val.trim()),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Valid email address is required').transform((val) => val.trim().toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
