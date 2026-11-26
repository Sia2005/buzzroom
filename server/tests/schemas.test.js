import { describe, expect, it } from 'vitest';
import { aiQuestionSchema, aiResponseSchema } from '../src/validation/ai.schemas.js';
import { nicknameKey, nicknameSchema, roomCodeSchema } from '../src/validation/common.js';
import { generateBodySchema, saveQuizBodySchema } from '../src/validation/quiz.schemas.js';
import {
  hostActionSchema,
  playerAnswerSchema,
  playerJoinSchema,
} from '../src/validation/socket.schemas.js';

const validAiQuestion = {
  question: 'Which organelle produces most ATP?',
  options: ['Mitochondria', 'Golgi body', 'Lysosome', 'Vacuole'],
  correctIndex: 0,
  evidence: 'Mitochondria produce most of the ATP in a cell.',
};

describe('room code validation', () => {
  it('accepts exactly six digits', () => {
    expect(roomCodeSchema.parse('482913')).toBe('482913');
  });

  it('trims surrounding whitespace', () => {
    expect(roomCodeSchema.parse(' 482913 ')).toBe('482913');
  });

  it.each(['12345', '1234567', '12a456', '', '48 913'])('rejects %j', (code) => {
    expect(roomCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('nickname validation', () => {
  it('trims and collapses whitespace', () => {
    expect(nicknameSchema.parse('   Ada    Lovelace ')).toBe('Ada Lovelace');
  });

  it('accepts 1 to 16 characters', () => {
    expect(nicknameSchema.safeParse('A').success).toBe(true);
    expect(nicknameSchema.safeParse('x'.repeat(16)).success).toBe(true);
  });

  it('rejects empty, whitespace-only and too-long nicknames', () => {
    expect(nicknameSchema.safeParse('').success).toBe(false);
    expect(nicknameSchema.safeParse('     ').success).toBe(false);
    expect(nicknameSchema.safeParse('x'.repeat(17)).success).toBe(false);
  });

  it('rejects control characters', () => {
    expect(nicknameSchema.safeParse('bad\u0000name').success).toBe(false);
  });

  it('builds a case-insensitive uniqueness key', () => {
    expect(nicknameKey('  Ada  LOVELACE ')).toBe(nicknameKey('ada lovelace'));
  });
});

describe('socket payload schemas', () => {
  it('accepts a valid join', () => {
    expect(playerJoinSchema.parse({ code: '123456', nickname: ' Sia ' })).toEqual({
      code: '123456',
      nickname: 'Sia',
    });
  });

  it('rejects an answer choice outside 0-3', () => {
    expect(
      playerAnswerSchema.safeParse({ code: '123456', questionIndex: 0, choice: 4 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer question index', () => {
    expect(
      playerAnswerSchema.safeParse({ code: '123456', questionIndex: 1.5, choice: 1 }).success,
    ).toBe(false);
  });

  it('requires a host token for host actions', () => {
    expect(hostActionSchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(hostActionSchema.safeParse({ code: '123456', hostToken: 'x'.repeat(32) }).success).toBe(
      true,
    );
  });
});

describe('AI output schemas', () => {
  it('accepts a well-formed question', () => {
    expect(aiQuestionSchema.safeParse(validAiQuestion).success).toBe(true);
  });

  it('rejects fewer than four options', () => {
    const result = aiQuestionSchema.safeParse({ ...validAiQuestion, options: ['a', 'b', 'c'] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate options regardless of case', () => {
    const options = ['Mitochondria', 'mitochondria ', 'Lysosome', 'Vacuole'];
    expect(aiQuestionSchema.safeParse({ ...validAiQuestion, options }).success).toBe(false);
  });

  it('rejects empty options', () => {
    const options = ['Mitochondria', '  ', 'Lysosome', 'Vacuole'];
    expect(aiQuestionSchema.safeParse({ ...validAiQuestion, options }).success).toBe(false);
  });

  it('rejects out-of-range correctIndex and too-short questions', () => {
    expect(aiQuestionSchema.safeParse({ ...validAiQuestion, correctIndex: 4 }).success).toBe(false);
    expect(aiQuestionSchema.safeParse({ ...validAiQuestion, question: 'Short?' }).success).toBe(
      false,
    );
  });

  it('requires a questions array in the response', () => {
    expect(aiResponseSchema.safeParse({ items: [] }).success).toBe(false);
    expect(aiResponseSchema.safeParse({ questions: [] }).success).toBe(true);
  });
});

describe('HTTP body schemas', () => {
  it('coerces the multipart question count and enforces 5-15', () => {
    expect(generateBodySchema.parse({ count: '8' }).count).toBe(8);
    expect(generateBodySchema.safeParse({ count: '4' }).success).toBe(false);
    expect(generateBodySchema.safeParse({ count: '16' }).success).toBe(false);
  });

  it('validates a saved quiz and defaults the duration', () => {
    const parsed = saveQuizBodySchema.parse({
      title: 'Cells',
      sourceType: 'text',
      questions: [{ ...validAiQuestion, text: validAiQuestion.question }],
    });
    expect(parsed.durationSec).toBe(20);
  });

  it('rejects a duration outside 10-60 seconds', () => {
    const body = { title: 'Cells', sourceType: 'text', durationSec: 5, questions: [] };
    expect(saveQuizBodySchema.safeParse(body).success).toBe(false);
  });
});
