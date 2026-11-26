import { z } from 'zod';
import { nicknameSchema, objectIdSchema, roomCodeSchema, tokenSchema } from './common.js';

export const hostCreateSchema = z.object({
  quizId: objectIdSchema,
});

export const hostActionSchema = z.object({
  code: roomCodeSchema,
  hostToken: tokenSchema,
});

export const playerJoinSchema = z.object({
  code: roomCodeSchema,
  nickname: nicknameSchema,
});

export const playerRejoinSchema = z.object({
  code: roomCodeSchema,
  playerToken: tokenSchema,
});

export const playerAnswerSchema = z.object({
  code: roomCodeSchema,
  questionIndex: z.number().int().min(0).max(100),
  choice: z.number().int().min(0).max(3),
});

export const timeSyncSchema = z.object({}).optional();
