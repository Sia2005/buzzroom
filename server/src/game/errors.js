export class GameError extends Error {
  constructor(message, code = 'GAME_ERROR') {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

export const ERROR_CODES = Object.freeze({
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  QUIZ_NOT_FOUND: 'QUIZ_NOT_FOUND',
  NOT_ALLOWED: 'NOT_ALLOWED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  GAME_STARTED: 'GAME_STARTED',
  ALREADY_ANSWERED: 'ALREADY_ANSWERED',
  TOO_LATE: 'TOO_LATE',
  WRONG_QUESTION: 'WRONG_QUESTION',
  NO_PLAYERS: 'NO_PLAYERS',
  ROOM_FULL: 'ROOM_FULL',
  INTERNAL: 'INTERNAL',
});
