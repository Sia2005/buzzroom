import { z } from 'zod';
import { optionsSchema } from './common.js';

export const aiQuestionSchema = z.object({
  question: z.string().trim().min(10).max(200),
  options: optionsSchema,
  correctIndex: z.number().int().min(0).max(3),
  evidence: z.string().trim().min(1),
});

export const aiResponseSchema = z.object({
  questions: z.array(z.unknown()),
});
