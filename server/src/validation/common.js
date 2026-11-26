import { z } from 'zod';

export const ROOM_CODE_PATTERN = /^\d{6}$/;
export const NICKNAME_MAX_LENGTH = 16;

export const roomCodeSchema = z
  .string()
  .trim()
  .regex(ROOM_CODE_PATTERN, 'Room code must be 6 digits');

export const nicknameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Nickname is required')
      .max(NICKNAME_MAX_LENGTH, `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters`)
      .regex(/^[^\p{C}]+$/u, 'Nickname contains invalid characters'),
  );

export const tokenSchema = z.string().min(16).max(128);

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export function nicknameKey(nickname) {
  return nickname.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeOption(option) {
  return option.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const optionsSchema = z
  .array(z.string().trim().min(1, 'Options cannot be empty').max(120))
  .length(4, 'Exactly 4 options are required')
  .refine((options) => new Set(options.map(normalizeOption)).size === 4, {
    message: 'Options must be distinct',
  });

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
