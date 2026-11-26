import { describe, expect, it } from 'vitest';
import { ERROR_CODES, GameError } from '../src/game/errors.js';
import {
  STATES,
  assertEventAllowed,
  assertTransition,
  canTransition,
  nextStateAfterLeaderboard,
} from '../src/game/stateMachine.js';

describe('canTransition', () => {
  it.each([
    [STATES.LOBBY, STATES.QUESTION],
    [STATES.QUESTION, STATES.REVEAL],
    [STATES.REVEAL, STATES.LEADERBOARD],
    [STATES.LEADERBOARD, STATES.QUESTION],
    [STATES.LEADERBOARD, STATES.ENDED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    [STATES.LOBBY, STATES.REVEAL],
    [STATES.LOBBY, STATES.ENDED],
    [STATES.QUESTION, STATES.LEADERBOARD],
    [STATES.QUESTION, STATES.QUESTION],
    [STATES.REVEAL, STATES.QUESTION],
    [STATES.ENDED, STATES.LOBBY],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('rejects unknown states', () => {
    expect(canTransition('PAUSED', STATES.QUESTION)).toBe(false);
    expect(canTransition(STATES.LOBBY, 'PAUSED')).toBe(false);
  });

  it('throws a GameError for an illegal transition', () => {
    expect(() => assertTransition(STATES.ENDED, STATES.QUESTION)).toThrow(GameError);
  });
});

describe('assertEventAllowed', () => {
  it('allows answers only during a question', () => {
    expect(() => assertEventAllowed(STATES.QUESTION, 'player:answer')).not.toThrow();
    for (const state of [STATES.LOBBY, STATES.REVEAL, STATES.LEADERBOARD, STATES.ENDED]) {
      expect(() => assertEventAllowed(state, 'player:answer')).toThrow(/closed/);
    }
  });

  it('reports GAME_STARTED when joining after the lobby', () => {
    try {
      assertEventAllowed(STATES.QUESTION, 'player:join');
      expect.unreachable();
    } catch (error) {
      expect(error.code).toBe(ERROR_CODES.GAME_STARTED);
    }
  });

  it('only lets the host start from the lobby and advance from the leaderboard', () => {
    expect(() => assertEventAllowed(STATES.LOBBY, 'host:start')).not.toThrow();
    expect(() => assertEventAllowed(STATES.QUESTION, 'host:start')).toThrow();
    expect(() => assertEventAllowed(STATES.LEADERBOARD, 'host:next')).not.toThrow();
    expect(() => assertEventAllowed(STATES.REVEAL, 'host:next')).toThrow();
  });

  it('allows rejoining in every live state but not after the game ends', () => {
    for (const state of [STATES.LOBBY, STATES.QUESTION, STATES.REVEAL, STATES.LEADERBOARD]) {
      expect(() => assertEventAllowed(state, 'player:rejoin')).not.toThrow();
      expect(() => assertEventAllowed(state, 'host:rejoin')).not.toThrow();
    }
    expect(() => assertEventAllowed(STATES.ENDED, 'player:rejoin')).toThrow();
  });

  it('rejects unknown events', () => {
    expect(() => assertEventAllowed(STATES.LOBBY, 'player:cheat')).toThrow(/Unknown event/);
  });
});

describe('nextStateAfterLeaderboard', () => {
  it('moves to the next question while questions remain', () => {
    expect(nextStateAfterLeaderboard(0, 3)).toBe(STATES.QUESTION);
    expect(nextStateAfterLeaderboard(1, 3)).toBe(STATES.QUESTION);
  });

  it('ends the game after the last question', () => {
    expect(nextStateAfterLeaderboard(2, 3)).toBe(STATES.ENDED);
  });
});
