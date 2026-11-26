import multer from 'multer';
import { badRequest } from '../utils/httpError.js';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) return callback(null, true);
    callback(badRequest('Only PDF files are supported'));
  },
}).single('file');
