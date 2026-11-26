import { formatZodError } from '../validation/common.js';
import { badRequest } from '../utils/httpError.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source] ?? {});
    if (!parsed.success) return next(badRequest('Invalid request', formatZodError(parsed.error)));
    req.validated = { ...req.validated, [source]: parsed.data };
    next();
  };
}
