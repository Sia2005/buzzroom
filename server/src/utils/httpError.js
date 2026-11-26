export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details) =>
  new HttpError(400, message, details);

export const notFound = (message = 'Not found') => new HttpError(404, message);

export const tooManyRequests = (message = 'Too many requests, please slow down') =>
  new HttpError(429, message);

export const serviceUnavailable = (message = 'Service unavailable') => new HttpError(503, message);
