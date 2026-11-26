import { describe, expect, it } from 'vitest';
import {
  buildRanking,
  decodeAnswer,
  encodeAnswer,
  hardestQuestionIndex,
  tallyAnswers,
  toQuestionStats,
} from '../src/game/stats.js';

describe('answer encoding', () => {
  it('round-trips choice and elapsed time', () => {
    expect(decodeAnswer(encodeAnswer(2, 1234.6))).toEqual({ choice: 2, elapsedMs: 1235 });
  });

  it('rejects malformed stored answers', () => {
    expect(decodeAnswer('7|100')).toBeNull();
    expect(decodeAnswer('x|100')).toBeNull();
    expect(decodeAnswer(undefined)).toBeNull();
  });
});

describe('question statistics', () => {
  const answers = { a: '0|1000', b: '0|3000', c: '2|2000' };

  it('tallies answer counts and correct answers', () => {
    expect(tallyAnswers(answers, 0)).toEqual({
      answerCounts: [2, 0, 1, 0],
      correctCount: 2,
      answeredCount: 3,
      totalElapsedMs: 6000,
    });
  });

  it('computes the correct percentage over all players, including non-answers', () => {
    const stats = toQuestionStats(0, tallyAnswers(answers, 0), 4);
    expect(stats).toEqual({
      index: 0,
      correctPct: 50,
      avgElapsedMs: 2000,
      answerCounts: [2, 0, 1, 0],
    });
  });

  it('finds the hardest question by lowest correct percentage', () => {
    const perQuestion = [
      { index: 0, correctPct: 80 },
      { index: 1, correctPct: 25 },
      { index: 2, correctPct: 60 },
    ];
    expect(hardestQuestionIndex(perQuestion)).toBe(1);
    expect(hardestQuestionIndex([])).toBe(-1);
  });
});

describe('buildRanking', () => {
  it('assigns ranks in score order and attaches correct counts', () => {
    const ranking = buildRanking(
      [
        { playerId: 'p2', score: 2400 },
        { playerId: 'p1', score: 900 },
      ],
      { p1: 'Ada', p2: 'Linus' },
      { p2: '3', p1: '1' },
    );
    expect(ranking).toEqual([
      { nickname: 'Linus', score: 2400, rank: 1, correctCount: 3 },
      { nickname: 'Ada', score: 900, rank: 2, correctCount: 1 },
    ]);
  });
});
