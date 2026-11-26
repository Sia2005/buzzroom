import cors from 'cors';
import express from 'express';
import { mongoStatus } from './config/mongo.js';
import { redisStatus } from './config/redis.js';
import { createQuizController } from './controllers/quiz.controller.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createQuizRouter } from './routes/quiz.routes.js';
import { createResultsRouter } from './routes/results.routes.js';

export function createApp({ env, redis, generator, logger }) {
  const app = express();
  const generateLimiter = createRateLimiter({ windowMs: 60_000, max: env.GENERATE_RATE_LIMIT });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (req, res) => {
    const mongo = mongoStatus();
    const redisState = await redisStatus(redis);
    const healthy = mongo === 'connected' && redisState === 'connected';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      mongo,
      redis: redisState,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.use(
    '/api/quizzes',
    createQuizRouter({
      controller: createQuizController({ generator }),
      generateLimiter: generateLimiter.middleware,
    }),
  );
  app.use('/api/results', createResultsRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return { app, stop: () => generateLimiter.stop() };
}
