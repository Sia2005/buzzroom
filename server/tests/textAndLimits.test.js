import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/middleware/rateLimit.js';
import { shuffleOptions } from '../src/services/quizGenerator.js';
import {
  cleanSourceText,
  distributeQuestions,
  overRequestCount,
  splitIntoChunks,
} from '../src/services/textChunks.js';
import { generateRoomCode, tokensMatch } from '../src/utils/tokens.js';

describe('source text chunking', () => {
  it('keeps short text in a single chunk', () => {
    expect(splitIntoChunks('Short text.', 100)).toEqual({
      chunks: ['Short text.'],
      truncated: false,
    });
  });

  it('splits long text on sentence boundaries', () => {
    const sentence = 'This is a sentence about cells. ';
    const { chunks } = splitIntoChunks(sentence.repeat(10), 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      expect(chunk.endsWith('.')).toBe(true);
    }
  });

  it('caps the number of chunks and reports truncation', () => {
    const { chunks, truncated } = splitIntoChunks('word '.repeat(200), 50, 2);
    expect(chunks).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('normalises line endings and blank lines', () => {
    expect(cleanSourceText('a\r\n\r\n\r\n\r\nb   c')).toBe('a\n\nb c');
  });

  it('spreads questions across chunks in proportion to their length', () => {
    expect(distributeQuestions(10, [30000, 30000])).toEqual([5, 5]);
    expect(distributeQuestions(10, [30000, 10000])).toEqual([8, 2]);
    expect(distributeQuestions(7, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('over-requests to survive rejected questions', () => {
    expect(overRequestCount(10)).toBe(14);
    expect(overRequestCount(15)).toBe(21);
  });
});

describe('shuffleOptions', () => {
  it('keeps the correct answer attached to the same option text', () => {
    const question = { text: 'Q?', options: ['right', 'w1', 'w2', 'w3'], correctIndex: 0 };
    for (let i = 0; i < 20; i += 1) {
      const shuffled = shuffleOptions(question);
      expect(shuffled.options[shuffled.correctIndex]).toBe('right');
      expect([...shuffled.options].sort()).toEqual([...question.options].sort());
    }
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit and then blocks until the window passes', () => {
    let time = 0;
    const limiter = createRateLimiter({ windowMs: 60000, max: 5, now: () => time });
    for (let i = 0; i < 5; i += 1) expect(limiter.consume('ip').allowed).toBe(true);
    expect(limiter.consume('ip').allowed).toBe(false);
    expect(limiter.consume('other-ip').allowed).toBe(true);
    time = 60001;
    expect(limiter.consume('ip').allowed).toBe(true);
    limiter.stop();
  });
});

describe('tokens and room codes', () => {
  it('generates six-digit room codes without a leading zero', () => {
    for (let i = 0; i < 100; i += 1) expect(generateRoomCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it('compares tokens safely', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('abc', undefined)).toBe(false);
  });
});
