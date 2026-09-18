export class HttpError extends Error {
  constructor(message, status = 400, details, headers) {
    super(message);
    this.status = status;
    this.details = details;
    this.headers = headers; // extra response headers, e.g. Retry-After on a 429
  }
}
