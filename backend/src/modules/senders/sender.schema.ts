import { z } from 'zod';

export const createSenderSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Sender name is required'),
});

export type CreateSenderInput = z.infer<typeof createSenderSchema>;
