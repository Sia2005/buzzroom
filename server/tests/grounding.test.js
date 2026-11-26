import { describe, expect, it } from 'vitest';
import {
  REJECTION_REASONS,
  checkGrounding,
  dedupeQuestions,
  evidenceAppearsInSource,
  isNearDuplicate,
  meaningfulTokens,
  normalizeText,
  sharesMeaningfulWord,
  tokenOverlap,
} from '../src/services/grounding.js';

const SOURCE = `Photosynthesis takes place in the chloroplasts of plant cells.
The light-dependent reactions produce ATP and NADPH, which power the Calvin cycle.
In 1771, Joseph Priestley showed that plants restore air that a candle had "injured".`;
const NORMALIZED = normalizeText(SOURCE);

const question = (overrides = {}) => ({
  question: 'Where in plant cells does photosynthesis take place?',
  options: ['Chloroplasts', 'Mitochondria', 'Nucleus', 'Ribosomes'],
  correctIndex: 0,
  evidence: 'Photosynthesis takes place in the chloroplasts of plant cells.',
  ...overrides,
});

describe('normalizeText', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeText("  Hello,   WORLD!\n How's it  going? ")).toBe(
      'hello world how s it going',
    );
  });

  it('removes accents so equivalent text compares equal', () => {
    expect(normalizeText('Café Résumé')).toBe('cafe resume');
  });
});

describe('evidenceAppearsInSource', () => {
  it('finds exact evidence', () => {
    expect(evidenceAppearsInSource(question().evidence, NORMALIZED)).toBe(true);
  });

  it('ignores case and punctuation differences', () => {
    const evidence =
      'the LIGHT dependent reactions produce atp and nadph which power the calvin cycle';
    expect(evidenceAppearsInSource(evidence, NORMALIZED)).toBe(true);
  });

  it('rejects paraphrased evidence', () => {
    expect(
      evidenceAppearsInSource('Chloroplasts are where photosynthesis happens.', NORMALIZED),
    ).toBe(false);
  });

  it('does not match partial words at the edges', () => {
    expect(evidenceAppearsInSource('hotosynthesis takes place', NORMALIZED)).toBe(false);
  });
});

describe('checkGrounding', () => {
  it('accepts a question whose evidence is copied from the source', () => {
    expect(checkGrounding(question(), NORMALIZED)).toEqual({ ok: true });
  });

  it('rejects evidence that is missing from the source', () => {
    const verdict = checkGrounding(
      question({ evidence: 'Photosynthesis happens inside the chloroplast organelle.' }),
      NORMALIZED,
    );
    expect(verdict).toEqual({ ok: false, reason: REJECTION_REASONS.EVIDENCE_NOT_IN_SOURCE });
  });

  it('rejects evidence that is too short to prove anything', () => {
    const verdict = checkGrounding(question({ evidence: 'plant cells' }), NORMALIZED);
    expect(verdict.reason).toBe(REJECTION_REASONS.EVIDENCE_TOO_SHORT);
  });

  it('rejects a correct option that shares no word with the evidence', () => {
    const verdict = checkGrounding(question({ correctIndex: 1 }), NORMALIZED);
    expect(verdict.reason).toBe(REJECTION_REASONS.ANSWER_NOT_IN_EVIDENCE);
  });

  it('accepts numeric answers that appear in the evidence', () => {
    const verdict = checkGrounding(
      question({
        question: 'In which year did Priestley show that plants restore air?',
        options: ['1771', '1662', '1804', '1859'],
        evidence:
          'In 1771, Joseph Priestley showed that plants restore air that a candle had injured.',
      }),
      NORMALIZED,
    );
    expect(verdict.ok).toBe(true);
  });
});

describe('sharesMeaningfulWord', () => {
  it('ignores stopwords', () => {
    expect(sharesMeaningfulWord('of the', 'the history of art')).toBe(false);
  });

  it('matches simple word-form variations', () => {
    expect(sharesMeaningfulWord('Chloroplast', 'inside the chloroplasts')).toBe(true);
  });

  it('extracts meaningful tokens without stopwords', () => {
    expect(meaningfulTokens('The cell is in the leaf')).toEqual(['cell', 'leaf']);
  });
});

describe('duplicate detection', () => {
  it('treats questions differing only by case and punctuation as duplicates', () => {
    expect(isNearDuplicate('What is ATP?', 'what is atp')).toBe(true);
  });

  it('flags high token overlap as a duplicate', () => {
    expect(
      tokenOverlap(
        'Which reactions produce ATP and NADPH?',
        'Which reactions produce NADPH and ATP?',
      ),
    ).toBe(1);
  });

  it('keeps genuinely different questions', () => {
    expect(isNearDuplicate('What does the Calvin cycle need?', 'Who was Joseph Priestley?')).toBe(
      false,
    );
  });

  it('keeps the first occurrence and reports the rest', () => {
    const first = question();
    const copy = question({ question: 'Where in plant cells does photosynthesis take place' });
    const other = question({ question: 'What do the light-dependent reactions produce?' });
    const { kept, duplicates } = dedupeQuestions([first, copy, other]);
    expect(kept).toEqual([first, other]);
    expect(duplicates).toEqual([copy]);
  });
});
