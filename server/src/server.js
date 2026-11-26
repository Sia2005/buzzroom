import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeMongo, connectMongo } from './config/mongo.js';
import { createRedisClient } from './config/redis.js';
import { createGameEngine } from './game/gameEngine.js';
import { createRoomStore } from './game/roomStore.js';
import { registerSocketHandlers } from './game/socketHandlers.js';
import { createQuizGenerator } from './services/quizGenerator.js';
import { createObjectId, quizRepository, resultRepository } from './services/repositories.js';
import { createLogger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const logger = createLogger({ level: env.LOG_LEVEL });
  await connectMongo(env.MONGO_URI, logger.child('mongo'));

  const redis = createRedisClient(env.REDIS_URL, logger.child('redis'));
  const adapterClients = [];

  const generator = createQuizGenerator({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    timeoutMs: env.GEMINI_TIMEOUT_MS,
    logger: logger.child('ai'),
  });
  if (!env.GEMINI_API_KEY) logger.warn('GEMINI_API_KEY is not set; quiz generation is disabled');

  const { app, stop: stopApp } = createApp({ env, redis, generator, logger: logger.child('http') });
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins },
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  if (env.USE_REDIS_ADAPTER) {
    const pub = createRedisClient(env.REDIS_URL, logger.child('redis'), 'adapter-pub');
    const sub = pub.duplicate();
    adapterClients.push(pub, sub);
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter enabled');
  }

  const store = createRoomStore(redis, { ttlSeconds: env.ROOM_TTL_SECONDS });
  const engine = createGameEngine({
    io,
    store,
    quizzes: quizRepository,
    results: resultRepository,
    logger: logger.child('game'),
    revealMs: env.REVEAL_MS,
    createResultId: createObjectId,
  });
  registerSocketHandlers(io, engine, logger.child('socket'));

  httpServer.listen(env.PORT, () => logger.info('Server listening', { port: env.PORT }));

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    engine.shutdown();
    stopApp();
    await new Promise((resolve) => io.close(() => resolve()));
    await Promise.allSettled([
      redis.quit(),
      ...adapterClients.map((client) => client.quit()),
      closeMongo(),
    ]);
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  createLogger().error('Failed to start server', { error });
  process.exit(1);
});
