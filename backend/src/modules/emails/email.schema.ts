import { z } from 'zod';

export const scheduleEmailSchema = z.object({
  senderId: z.string().uuid('Valid senderId UUID is required'),
  subject: z.string().min(1, 'Subject cannot be empty'),
  body: z.string().min(1, 'Body cannot be empty'),
  // Support both a single string or an array of recipients (for CSV uploads / batch)
  recipients: z
    .union([
      z.string().email('Recipient must be a valid email'),
      z.array(z.string().email('Each recipient must be a valid email')).min(1, 'At least one recipient is required'),
    ])
    .transform((val) => (Array.isArray(val) ? val : [val])),
  scheduledAt: z.string().datetime({ message: 'scheduledAt must be a valid ISO 8601 string' }),
  delayMs: z.coerce.number().int().nonnegative().optional(),
  hourlyLimit: z.coerce.number().int().positive().optional(),
});

export type ScheduleEmailInput = z.infer<typeof scheduleEmailSchema>;
