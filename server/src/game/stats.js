export const OPTION_COUNT = 4;

export function encodeAnswer(choice, elapsedMs) {
  return `${choice}|${Math.max(0, Math.round(elapsedMs))}`;
}

export function decodeAnswer(raw) {
  if (typeof raw !== 'string') return null;
  const [choiceText, elapsedText] = raw.split('|');
  const choice = Number(choiceText);
  const elapsedMs = Number(elapsedText);
  if (!Number.isInteger(choice) || choice < 0 || choice >= OPTION_COUNT) return null;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  return { choice, elapsedMs };
}

export function tallyAnswers(rawAnswers, correctIndex) {
  const answerCounts = Array(OPTION_COUNT).fill(0);
  let correctCount = 0;
  let answeredCount = 0;
  let totalElapsedMs = 0;

  for (const raw of Object.values(rawAnswers)) {
    const answer = decodeAnswer(raw);
    if (!answer) continue;
    answerCounts[answer.choice] += 1;
    answeredCount += 1;
    totalElapsedMs += answer.elapsedMs;
    if (answer.choice === correctIndex) correctCount += 1;
  }

  return { answerCounts, correctCount, answeredCount, totalElapsedMs };
}

export function toQuestionStats(index, tally, playerCount) {
  const correctPct = playerCount > 0 ? (tally.correctCount / playerCount) * 100 : 0;
  const avgElapsedMs = tally.answeredCount > 0 ? tally.totalElapsedMs / tally.answeredCount : 0;
  return {
    index,
    correctPct: Math.round(correctPct * 10) / 10,
    avgElapsedMs: Math.round(avgElapsedMs),
    answerCounts: [...tally.answerCounts],
  };
}

export function buildRanking(scoreEntries, nicknames, correctCounts = {}) {
  return scoreEntries
    .filter(({ playerId }) => Object.hasOwn(nicknames, playerId))
    .map(({ playerId, score }, position) => ({
      nickname: nicknames[playerId],
      score,
      rank: position + 1,
      correctCount: Number(correctCounts[playerId] ?? 0),
    }));
}

export function hardestQuestionIndex(perQuestion) {
  if (perQuestion.length === 0) return -1;
  return perQuestion.reduce(
    (hardest, stats) => (stats.correctPct < hardest.correctPct ? stats : hardest),
    perQuestion[0],
  ).index;
}
