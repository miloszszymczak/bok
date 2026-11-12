/** Service-level errors; the web app maps them to 403 / 404 (`guard()`). */
export class Forbidden extends Error {}
export class NotFound extends Error {}
