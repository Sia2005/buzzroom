import { Redis } from 'ioredis';

export function createRedisClient(url, logger, name = 'main') {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    connectionName: `buzzroom:${name}`,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });

  client.on('ready', () => logger.info('Redis ready', { connection: name }));
  client.on('error', (error) => logger.error('Redis error', { connection: name, error }));
  client.on('end', () => logger.warn('Redis connection closed', { connection: name }));

  return client;
}

export async function redisStatus(client) {
  try {
    const reply = await client.ping();
    return reply === 'PONG' ? 'connected' : 'degraded';
  } catch {
    return 'disconnected';
  }
}
