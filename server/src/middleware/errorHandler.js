import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'PDF must be 5 MB or smaller',
  LIMIT_UNEXPECTED_FILE: 'Upload a single file in the "file" field',
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

export function createErrorHandler(logger) {
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    if (error instanceof multer.MulterError) {
      const message = MULTER_MESSAGES[error.code] ?? 'Invalid upload';
      return res.status(400).json({ error: { message } });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'Malformed JSON body' } });
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: { message: 'Request body is too large' } });
    }

    if (error instanceof HttpError) {
      if (error.status >= 500) logger.error('Request failed', { path: req.path, error });
      return res.status(error.status).json({
        error: { message: error.message, ...(error.details && { details: error.details }) },
      });
    }

    logger.error('Unhandled request error', { method: req.method, path: req.path, error });
    res.status(500).json({ error: { message: 'Something went wrong' } });
  };
}
