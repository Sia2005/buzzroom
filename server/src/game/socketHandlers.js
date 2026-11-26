import { formatZodError } from '../validation/common.js';
import {
  hostActionSchema,
  hostCreateSchema,
  playerAnswerSchema,
  playerJoinSchema,
  playerRejoinSchema,
} from '../validation/socket.schemas.js';
import { ERROR_CODES, GameError } from './errors.js';

export function registerSocketHandlers(io, engine, logger) {
  io.on('connection', (socket) => {
    const handle = (eventName, schema, action) => {
      socket.on(eventName, async (payload, maybeAck) => {
        const receivedAt = Date.now();
        const ack = typeof maybeAck === 'function' ? maybeAck : null;

        try {
          const parsed = schema.safeParse(payload ?? {});
          if (!parsed.success) {
            const [firstIssue] = formatZodError(parsed.error);
            throw new GameError(
              firstIssue?.message ?? 'Invalid request',
              ERROR_CODES.INVALID_PAYLOAD,
            );
          }
          const data = await action(socket, parsed.data, receivedAt);
          ack?.({ ok: true, ...data });
        } catch (error) {
          const isGameError = error instanceof GameError;
          if (!isGameError) logger.error('Socket handler failed', { event: eventName, error });
          const failure = {
            message: isGameError ? error.message : 'Something went wrong. Please try again.',
            code: isGameError ? error.code : ERROR_CODES.INTERNAL,
          };
          if (ack) ack({ ok: false, error: failure });
          else socket.emit('error:game', failure);
        }
      });
    };

    handle('host:create', hostCreateSchema, engine.createRoom);
    handle('host:rejoin', hostActionSchema, engine.rejoinHost);
    handle('host:start', hostActionSchema, engine.startGame);
    handle('host:next', hostActionSchema, engine.nextQuestion);
    handle('player:join', playerJoinSchema, engine.joinPlayer);
    handle('player:rejoin', playerRejoinSchema, engine.rejoinPlayer);
    handle('player:answer', playerAnswerSchema, engine.submitAnswer);

    socket.on('time:sync', (_payload, ack) => {
      if (typeof ack === 'function') ack({ serverNow: Date.now() });
    });

    socket.on('disconnect', () => {
      engine
        .handleDisconnect(socket)
        .catch((error) => logger.error('Disconnect handling failed', { error }));
    });
  });
}
