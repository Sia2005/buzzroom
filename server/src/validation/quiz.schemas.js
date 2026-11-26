import { z } from 'zod';
import { objectIdSchema, optionsSchema } from './common.js';

export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 15;
export const MAX_TEXT_INPUT = 200000;

export const generateBodySchema = z.object({
  text: z.string().trim().max(MAX_TEXT_INPUT).optional(),
  count: z.coerce.number().int().min(MIN_QUESTIONS).max(MAX_QUESTIONS).default(10),
});

export const questionInputSchema = z.object({
  text: z.string().trim().min(10, 'Question must be at least 10 characters').max(200),
  options: optionsSchema,
  correctIndex: z.number().int().min(0).max(3),
  evidence: z.string().trim().max(1000).optional().default(''),
});

export const saveQuizBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  sourceType: z.enum(['pdf', 'text']),
  durationSec: z.number().int().min(10).max(60).default(20),
  questions: z.array(questionInputSchema).min(1, 'Add at least one question').max(30),
});

export const idParamsSchema = z.object({
  id: objectIdSchema,
});
