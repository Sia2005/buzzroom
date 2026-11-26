export const CHUNK_SIZE = 30000;
export const MAX_CHUNKS = 4;
export const MIN_SOURCE_CHARS = 200;

export function cleanSourceText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findBreakPoint(text, limit) {
  const minimum = Math.floor(limit * 0.5);
  const paragraph = text.lastIndexOf('\n\n', limit);
  if (paragraph >= minimum) return paragraph + 2;
  const sentence = Math.max(
    text.lastIndexOf('. ', limit),
    text.lastIndexOf('? ', limit),
    text.lastIndexOf('! ', limit),
  );
  if (sentence >= minimum) return sentence + 2;
  const space = text.lastIndexOf(' ', limit);
  return space >= minimum ? space + 1 : limit;
}

export function splitIntoChunks(text, chunkSize = CHUNK_SIZE, maxChunks = MAX_CHUNKS) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0 && chunks.length < maxChunks) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining.trim());
      remaining = '';
      break;
    }
    const cut = findBreakPoint(remaining, chunkSize);
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut);
  }
  return { chunks: chunks.filter(Boolean), truncated: remaining.trim().length > 0 };
}

export function distributeQuestions(total, chunkLengths) {
  if (chunkLengths.length === 0) return [];
  const totalLength = chunkLengths.reduce((sum, length) => sum + length, 0);
  const exact = chunkLengths.map((length) => (total * length) / totalLength);
  const counts = exact.map(Math.floor);
  let leftover = total - counts.reduce((sum, n) => sum + n, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (leftover === 0) break;
    counts[index] += 1;
    leftover -= 1;
  }
  return counts;
}

export function overRequestCount(count) {
  return Math.min(count + Math.ceil(count * 0.4), 25);
}
