import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export function generateToken() {
  return randomBytes(24).toString('base64url');
}

export function generatePlayerId() {
  return randomUUID();
}

export function generateRoomCode() {
  return String(randomInt(100000, 1000000));
}

export function tokensMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
