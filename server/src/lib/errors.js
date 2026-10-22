/**
 * An error that is safe to show to API clients. Anything that is not an AppError
 * is treated as an unexpected failure and reported as a generic 500.
 */
class AppError extends Error {
  constructor(statusCode, code, message, { details, headers, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

const badRequest = (message, details) => new AppError(400, 'bad_request', message, { details });
const validationError = (details) =>
  new AppError(400, 'validation_error', 'Request validation failed', { details });
const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);
const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', message);
const notFound = (message = 'Resource not found') => new AppError(404, 'not_found', message);
const conflict = (message) => new AppError(409, 'conflict', message);

module.exports = {
  AppError,
  badRequest,
  validationError,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
