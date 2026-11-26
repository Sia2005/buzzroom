import { Router } from 'express';
import { getResult } from '../controllers/results.controller.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validation/quiz.schemas.js';

export function createResultsRouter() {
  const router = Router();
  router.get('/:id', validate(idParamsSchema, 'params'), getResult);
  return router;
}
