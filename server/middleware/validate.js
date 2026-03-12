import { ZodError } from "zod";

/**
 * Express middleware factory: validates req.body against a Zod schema.
 * Returns 400 with field-level errors on failure, calls next() on success.
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
        return res.status(400).json({ error: "Validation failed", details: messages });
      }
      next(err);
    }
  };
}

/**
 * Sanitise database/Supabase errors before sending to client.
 * Logs the real error server-side, returns a generic message to the client.
 */
export function dbError(res, error, context = "Operation") {
  console.error(`DB error (${context}):`, error.message || error);
  return res.status(400).json({ error: `${context} failed. Please try again.` });
}
