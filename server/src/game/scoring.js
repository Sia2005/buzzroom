export const MAX_POINTS = 1000;
export const MIN_POINTS = 500;
export const STREAK_STEP = 100;
export const STREAK_CAP = 300;
export const NETWORK_GRACE_MS = 300;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function isWithinAnswerWindow({
  receivedAt,
  startedAt,
  durationMs,
  graceMs = NETWORK_GRACE_MS,
}) {
  return receivedAt >= startedAt && receivedAt <= startedAt + durationMs + graceMs;
}

export function speedPoints(elapsedMs, durationMs) {
  if (durationMs <= 0) return MIN_POINTS;
  const elapsed = clamp(elapsedMs, 0, durationMs);
  const raw = Math.round(MAX_POINTS * (1 - elapsed / durationMs / 2));
  return clamp(raw, MIN_POINTS, MAX_POINTS);
}

export function streakBonus(streak) {
  if (streak <= 1) return 0;
  return Math.min((streak - 1) * STREAK_STEP, STREAK_CAP);
}

export function scoreAnswer({ correct, elapsedMs, durationMs, previousStreak = 0 }) {
  if (!correct) return { points: 0, streak: 0, bonus: 0 };

  const streak = previousStreak + 1;
  const bonus = streakBonus(streak);
  return { points: speedPoints(elapsedMs, durationMs) + bonus, streak, bonus };
}
