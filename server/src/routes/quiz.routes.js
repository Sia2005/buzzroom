import { Router } from 'express';
import { pdfUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  generateBodySchema,
  idParamsSchema,
  saveQuizBodySchema,
} from '../validation/quiz.schemas.js';

export function createQuizRouter({ controller, generateLimiter }) {
  const router = Router();

  router.post(
    '/generate',
    generateLimiter,
    pdfUpload,
    validate(generateBodySchema),
    controller.generate,
  );
  router.post('/', validate(saveQuizBodySchema), controller.create);
  router.get('/:id', validate(idParamsSchema, 'params'), controller.getById);

  return router;
}
