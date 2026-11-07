// Pocket relay rules: errors are JSON, client mistakes are 4xx (paid, not retried),
// and upstream trouble is reported as 424 rather than 5xx so a correct answer
// about a third-party outage is not penalised or left unpaid.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const bad = (message, details) => new ApiError(400, 'invalid_input', message, details);
export const unprocessable = (code, message, details) => new ApiError(422, code, message, details);
export const upstream = (source, message, details) =>
  new ApiError(424, 'upstream_failed', `${source}: ${message}`, { source, ...details });
