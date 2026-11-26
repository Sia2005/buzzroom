import { Quiz } from '../models/Quiz.js';
import { badRequest, notFound } from '../utils/httpError.js';

const PDF_SIGNATURE = '%PDF-';

function looksLikePdf(buffer) {
  return buffer.subarray(0, PDF_SIGNATURE.length).toString('latin1') === PDF_SIGNATURE;
}

export function createQuizController({ generator }) {
  async function generate(req, res) {
    const { text, count } = req.validated.body;
    const pdfBuffer = req.file?.buffer;

    if (pdfBuffer && !looksLikePdf(pdfBuffer)) throw badRequest('That file is not a valid PDF');
    if (!pdfBuffer && !text) throw badRequest('Upload a PDF or paste some text');

    const result = await generator.generate({ text, pdfBuffer, count });
    res.json(result);
  }

  async function create(req, res) {
    const quiz = await Quiz.create(req.validated.body);
    res.status(201).json({ id: String(quiz._id) });
  }

  async function getById(req, res) {
    const quiz = await Quiz.findById(req.validated.params.id).lean();
    if (!quiz) throw notFound('Quiz not found');
    const { _id, __v, ...rest } = quiz;
    res.json({ id: String(_id), ...rest });
  }

  return { generate, create, getById };
}
