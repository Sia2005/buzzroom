import { tooManyRequests } from '../utils/httpError.js';

export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const hits = new Map();

  function consume(key) {
    const current = now();
    const recent = (hits.get(key) ?? []).filter((time) => current - time < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return { allowed: false, retryAfterMs: windowMs - (current - recent[0]) };
    }
    recent.push(current);
    hits.set(key, recent);
    return { allowed: true, remaining: max - recent.length };
  }

  function prune() {
    const current = now();
    for (const [key, times] of hits) {
      if (times.every((time) => current - time >= windowMs)) hits.delete(key);
    }
  }

  const sweeper = setInterval(prune, windowMs);
  sweeper.unref();

  function middleware(req, res, next) {
    const verdict = consume(req.ip ?? 'unknown');
    if (verdict.allowed) return next();
    res.set('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
    next(tooManyRequests());
  }

  return { consume, prune, middleware, stop: () => clearInterval(sweeper) };
}
