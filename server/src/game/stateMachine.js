import { ERROR_CODES, GameError } from './errors.js';

export const STATES = Object.freeze({
  LOBBY: 'LOBBY',
  QUESTION: 'QUESTION',
  REVEAL: 'REVEAL',
  LEADERBOARD: 'LEADERBOARD',
  ENDED: 'ENDED',
});

const TRANSITIONS = Object.freeze({
  [STATES.LOBBY]: [STATES.QUESTION],
  [STATES.QUESTION]: [STATES.REVEAL],
  [STATES.REVEAL]: [STATES.LEADERBOARD],
  [STATES.LEADERBOARD]: [STATES.QUESTION, STATES.ENDED],
  [STATES.ENDED]: [],
});

const LIVE_STATES = [STATES.LOBBY, STATES.QUESTION, STATES.REVEAL, STATES.LEADERBOARD];

const EVENT_RULES = Object.freeze({
  'host:start': [STATES.LOBBY],
  'host:next': [STATES.LEADERBOARD],
  'host:rejoin': LIVE_STATES,
  'player:join': [STATES.LOBBY],
  'player:rejoin': LIVE_STATES,
  'player:answer': [STATES.QUESTION],
});

const REJECTION_MESSAGES = Object.freeze({
  'host:start': 'The game has already started',
  'host:next': 'Wait for the current question to finish',
  'host:rejoin': 'This game has ended',
  'player:join': 'This game has already started',
  'player:rejoin': 'This game has ended',
  'player:answer': 'Answers are closed for this question',
});

export function isValidState(state) {
  return Object.hasOwn(TRANSITIONS, state);
}

export function canTransition(from, to) {
  if (!isValidState(from) || !isValidState(to)) return false;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (canTransition(from, to)) return;
  throw new GameError(`Cannot move from ${from} to ${to}`, ERROR_CODES.NOT_ALLOWED);
}

export function isEventAllowed(state, eventName) {
  const allowed = EVENT_RULES[eventName];
  return Boolean(allowed) && allowed.includes(state);
}

export function assertEventAllowed(state, eventName) {
  if (!Object.hasOwn(EVENT_RULES, eventName)) {
    throw new GameError(`Unknown event ${eventName}`, ERROR_CODES.NOT_ALLOWED);
  }
  if (isEventAllowed(state, eventName)) return;

  const code =
    eventName === 'player:join' && state !== STATES.ENDED
      ? ERROR_CODES.GAME_STARTED
      : ERROR_CODES.NOT_ALLOWED;
  throw new GameError(REJECTION_MESSAGES[eventName], code);
}

export function nextStateAfterLeaderboard(currentIndex, totalQuestions) {
  return currentIndex + 1 < totalQuestions ? STATES.QUESTION : STATES.ENDED;
}
