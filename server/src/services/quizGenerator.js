import { randomInt } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import { HttpError, badRequest, serviceUnavailable } from '../utils/httpError.js';
import { aiQuestionSchema, aiResponseSchema } from '../validation/ai.schemas.js';
import { checkGrounding, dedupeQuestions, normalizeText, REJECTION_REASONS } from './grounding.js';
import {
  MIN_SOURCE_CHARS,
  cleanSourceText,
  distributeQuestions,
  overRequestCount,
  splitIntoChunks,
} from './textChunks.js';

const SYSTEM_INSTRUCTION = `You write multiple-choice quiz questions for a live classroom game.
Rules:
- Use only facts stated in the provided source text. Never use outside knowledge.
- Each question has exactly 4 options, exactly one of which is correct.
- Wrong options must be plausible and clearly wrong according to the source.
- Never use "all of the above", "none of the above" or similar options.
- Keep each question under 200 characters and each option short.
- "evidence" must be one sentence copied word for word from the source that proves the correct answer.
- Cover different parts of the source instead of repeating the same fact.
- Do not ask about the document itself (its title, page numbers or author).`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 4, maxItems: 4 },
          correctIndex: { type: Type.INTEGER, minimum: 0, maximum: 3 },
          evidence: { type: Type.STRING },
        },
        required: ['question', 'options', 'correctIndex', 'evidence'],
        propertyOrdering: ['question', 'options', 'correctIndex', 'evidence'],
      },
    },
  },
  required: ['questions'],
};

export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } catch {
    throw badRequest('Could not read text from this PDF');
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export function shuffleOptions(question) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...question,
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

function buildPrompt(chunk, count) {
  return `Write ${count} questions from the source text below.\n\nSOURCE TEXT:\n"""\n${chunk}\n"""`;
}

export function createQuizGenerator({ apiKey, model, timeoutMs, logger, client }) {
  const ai = client ?? (apiKey ? new GoogleGenAI({ apiKey }) : null);

  async function requestQuestions(chunk, count) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: buildPrompt(chunk, count),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          abortSignal: controller.signal,
        },
      });
      const parsed = aiResponseSchema.safeParse(JSON.parse(response.text ?? ''));
      if (!parsed.success) throw new Error('Model response did not match the expected shape');
      return parsed.data.questions;
    } catch (error) {
      if (controller.signal.aborted)
        throw new HttpError(504, 'AI generation timed out. Try again.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function generate({ text, pdfBuffer, count }) {
    if (!ai) {
      throw serviceUnavailable('AI generation is not configured: GEMINI_API_KEY is missing');
    }

    const sourceType = pdfBuffer ? 'pdf' : 'text';
    const source = cleanSourceText(pdfBuffer ? await extractPdfText(pdfBuffer) : text);
    if (source.length < MIN_SOURCE_CHARS) {
      throw badRequest(`Provide at least ${MIN_SOURCE_CHARS} characters of readable text`);
    }

    const { chunks, truncated } = splitIntoChunks(source);
    const allocations = distributeQuestions(
      overRequestCount(count),
      chunks.map((chunk) => chunk.length),
    );

    const settled = await Promise.allSettled(
      chunks.map((chunk, i) =>
        allocations[i] > 0 ? requestQuestions(chunk, allocations[i]) : Promise.resolve([]),
      ),
    );

    const failures = settled.filter((outcome) => outcome.status === 'rejected');
    if (failures.length === settled.length) {
      const timeout = failures.find((f) => f.reason instanceof HttpError);
      if (timeout) throw timeout.reason;
      logger.error('Gemini generation failed', { error: failures[0].reason });
      throw new HttpError(502, 'AI generation failed. Try again in a moment.');
    }
    for (const failure of failures) {
      logger.warn('One source chunk failed to generate', { error: failure.reason });
    }

    const normalizedSource = normalizeText(source);
    const rawQuestions = settled.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : [],
    );
    const rejected = [];
    const schemaValid = [];

    for (const raw of rawQuestions) {
      const parsed = aiQuestionSchema.safeParse(raw);
      if (parsed.success) {
        schemaValid.push(parsed.data);
        continue;
      }
      rejected.push({
        reason: `invalid_shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        question: typeof raw?.question === 'string' ? raw.question : '',
      });
    }

    const grounded = [];
    for (const question of schemaValid) {
      const verdict = checkGrounding(question, normalizedSource);
      if (verdict.ok) grounded.push(question);
      else rejected.push({ reason: verdict.reason, question: question.question });
    }

    const { kept: unique, duplicates } = dedupeQuestions(grounded);
    for (const duplicate of duplicates) {
      rejected.push({ reason: REJECTION_REASONS.DUPLICATE, question: duplicate.question });
    }

    const kept = unique.slice(0, count).map((question) =>
      shuffleOptions({
        text: question.question,
        options: question.options,
        correctIndex: question.correctIndex,
        evidence: question.evidence,
      }),
    );

    return {
      sourceType,
      questions: kept,
      report: {
        requested: count,
        generated: rawQuestions.length,
        passedSchema: schemaValid.length,
        passedGrounding: grounded.length,
        kept: kept.length,
        surplus: Math.max(0, unique.length - count),
        truncatedSource: truncated,
        rejected,
      },
    };
  }

  return { generate };
}
