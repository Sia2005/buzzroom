const STOPWORDS = new Set(
  `a an the and or but if then else of in on at to for from by with without about into onto over
  under between among through during before after above below is are was were be been being am do
  does did done has have had having it its this that these those there here which who whom whose what
  when where why how all any both each few more most other some such no nor not only own same so than
  too very can could should would will shall may might must also just as per via upon within while
  their they them we our you your he she his her him i me my mine us one two`
    .split(/\s+/)
    .filter(Boolean),
);

export const MIN_EVIDENCE_CHARS = 20;
export const DUPLICATE_OVERLAP_THRESHOLD = 0.8;
const STEM_PREFIX_LENGTH = 5;

export const REJECTION_REASONS = Object.freeze({
  EVIDENCE_TOO_SHORT: 'evidence_too_short',
  EVIDENCE_NOT_IN_SOURCE: 'evidence_not_in_source',
  ANSWER_NOT_IN_EVIDENCE: 'answer_not_supported_by_evidence',
  DUPLICATE: 'duplicate',
});

export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function meaningfulTokens(text) {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token && !STOPWORDS.has(token) && (token.length >= 3 || /\d/.test(token)));
}

function tokensRelated(a, b) {
  if (a === b) return true;
  return (
    a.length >= STEM_PREFIX_LENGTH &&
    b.length >= STEM_PREFIX_LENGTH &&
    a.slice(0, STEM_PREFIX_LENGTH) === b.slice(0, STEM_PREFIX_LENGTH)
  );
}

export function evidenceAppearsInSource(evidence, normalizedSource) {
  const needle = normalizeText(evidence);
  if (!needle) return false;
  return ` ${normalizedSource} `.includes(` ${needle} `);
}

export function sharesMeaningfulWord(answer, evidence) {
  const answerTokens = meaningfulTokens(answer);
  const evidenceTokens = meaningfulTokens(evidence);
  return answerTokens.some((token) => evidenceTokens.some((other) => tokensRelated(token, other)));
}

export function checkGrounding(question, normalizedSource) {
  const evidence = normalizeText(question.evidence);
  if (evidence.length < MIN_EVIDENCE_CHARS) {
    return { ok: false, reason: REJECTION_REASONS.EVIDENCE_TOO_SHORT };
  }
  if (!evidenceAppearsInSource(question.evidence, normalizedSource)) {
    return { ok: false, reason: REJECTION_REASONS.EVIDENCE_NOT_IN_SOURCE };
  }
  const correctOption = question.options[question.correctIndex];
  if (!sharesMeaningfulWord(correctOption, question.evidence)) {
    return { ok: false, reason: REJECTION_REASONS.ANSWER_NOT_IN_EVIDENCE };
  }
  return { ok: true };
}

export function tokenOverlap(a, b) {
  const setA = new Set(meaningfulTokens(a));
  const setB = new Set(meaningfulTokens(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

export function isNearDuplicate(a, b, threshold = DUPLICATE_OVERLAP_THRESHOLD) {
  if (normalizeText(a) === normalizeText(b)) return true;
  return tokenOverlap(a, b) >= threshold;
}

export function dedupeQuestions(questions, threshold = DUPLICATE_OVERLAP_THRESHOLD) {
  const kept = [];
  const duplicates = [];
  for (const question of questions) {
    const clash = kept.some((existing) =>
      isNearDuplicate(existing.question, question.question, threshold),
    );
    (clash ? duplicates : kept).push(question);
  }
  return { kept, duplicates };
}
