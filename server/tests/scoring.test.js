import { describe, expect, it } from 'vitest';
import {
  MAX_POINTS,
  MIN_POINTS,
  NETWORK_GRACE_MS,
  STREAK_CAP,
  isWithinAnswerWindow,
  scoreAnswer,
  speedPoints,
  streakBonus,
} from '../src/game/scoring.js';

const DURATION = 20000;

describe('speedPoints', () => {
  it('awards the maximum for an instant answer', () => {
    expect(speedPoints(0, DURATION)).toBe(MAX_POINTS);
  });

  it('awards the minimum for a last-second answer', () => {
    expect(speedPoints(DURATION, DURATION)).toBe(MIN_POINTS);
  });

  it('scales linearly in between', () => {
    expect(speedPoints(DURATION / 2, DURATION)).toBe(750);
    expect(speedPoints(5000, DURATION)).toBe(875);
  });

  it('clamps answers that arrive inside the grace window to the minimum', () => {
    expect(speedPoints(DURATION + NETWORK_GRACE_MS, DURATION)).toBe(MIN_POINTS);
  });

  it('clamps negative elapsed time to the maximum', () => {
    expect(speedPoints(-50, DURATION)).toBe(MAX_POINTS);
  });
});

describe('streakBonus', () => {
  it('gives nothing for the first correct answer', () => {
    expect(streakBonus(1)).toBe(0);
  });

  it('adds 100 per consecutive correct answer', () => {
    expect(streakBonus(2)).toBe(100);
    expect(streakBonus(3)).toBe(200);
  });

  it('caps the bonus at 300', () => {
    expect(streakBonus(4)).toBe(STREAK_CAP);
    expect(streakBonus(20)).toBe(STREAK_CAP);
  });
});

describe('scoreAnswer', () => {
  it('gives zero and resets the streak for a wrong answer', () => {
    expect(
      scoreAnswer({ correct: false, elapsedMs: 0, durationMs: DURATION, previousStreak: 5 }),
    ).toEqual({ points: 0, streak: 0, bonus: 0 });
  });

  it('combines speed points with the streak bonus', () => {
    const result = scoreAnswer({
      correct: true,
      elapsedMs: 0,
      durationMs: DURATION,
      previousStreak: 2,
    });
    expect(result).toEqual({ points: 1200, streak: 3, bonus: 200 });
  });

  it('never exceeds 1000 + cap for a long streak', () => {
    const result = scoreAnswer({
      correct: true,
      elapsedMs: 0,
      durationMs: DURATION,
      previousStreak: 9,
    });
    expect(result.points).toBe(MAX_POINTS + STREAK_CAP);
  });
});

describe('isWithinAnswerWindow', () => {
  const startedAt = 1_000_000;

  it('accepts an answer before the deadline', () => {
    expect(
      isWithinAnswerWindow({ receivedAt: startedAt + 100, startedAt, durationMs: DURATION }),
    ).toBe(true);
  });

  it('accepts an answer inside the 300 ms grace period', () => {
    const receivedAt = startedAt + DURATION + NETWORK_GRACE_MS;
    expect(isWithinAnswerWindow({ receivedAt, startedAt, durationMs: DURATION })).toBe(true);
  });

  it('rejects a late answer after the grace period', () => {
    const receivedAt = startedAt + DURATION + NETWORK_GRACE_MS + 1;
    expect(isWithinAnswerWindow({ receivedAt, startedAt, durationMs: DURATION })).toBe(false);
  });

  it('rejects an answer received before the question started', () => {
    expect(
      isWithinAnswerWindow({ receivedAt: startedAt - 1, startedAt, durationMs: DURATION }),
    ).toBe(false);
  });
});
