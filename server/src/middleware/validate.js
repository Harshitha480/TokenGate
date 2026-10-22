const { validationError } = require('../lib/errors');

/**
 * Validates request parts against zod schemas and exposes the parsed values on
 * `req.validated`. Express 5 makes `req.query` read-only, so parsed data cannot be
 * written back onto the request itself.
 *
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
function validate(schemas) {
  return function validateRequest(req, res, next) {
    const validated = {};
    const issues = [];

    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (issues.length > 0) return next(validationError(issues));
    req.validated = validated;
    next();
  };
}

module.exports = { validate };
