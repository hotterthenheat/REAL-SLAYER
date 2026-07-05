import { z } from 'zod';

/**
 * Shared Zod schemas for the app's real forms. One source of truth for validation so the
 * same rules drive the inline field errors and any server-side re-check.
 */

export const emailSchema = z.string().trim().min(1, 'Email is required').email('Enter a valid email address');

// At least 8 chars, one letter and one number — surfaced as a clear requirement, not a
// silent reject.
export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const referralCodeSchema = z
  .string()
  .trim()
  .min(4, 'Codes are at least 4 characters')
  .max(24, 'Codes are at most 24 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only');

export const couponCodeSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[A-Z0-9_-]+$/, 'Uppercase letters, numbers, - and _ only');

export const couponPercentSchema = z
  .number({ message: 'Enter a percentage' })
  .int('Whole numbers only')
  .min(1, 'Minimum 1%')
  .max(100, 'Maximum 100%');

export const supportRequestSchema = z.object({
  title: z.string().trim().min(6, 'Give it a short, specific title (6+ chars)').max(120, 'Keep the title under 120 characters'),
  type: z.string().trim().min(1, 'Pick a request type'),
});
