import type { Context, Next } from "hono";

import { openAiError } from "../lib/openai-errors.js";
import type { AuthContext } from "../types/index.js";

const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; windowStart: number }>();

export async function perKeyRateLimit(c: Context, next: Next) {
  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth) {
    return openAiError(c, 500, "Missing auth context", "internal_error");
  }
  const now = Date.now();
  const current = buckets.get(auth.apiKeyId);
  if (!current || now - current.windowStart >= WINDOW_MS) {
    buckets.set(auth.apiKeyId, { count: 1, windowStart: now });
    await next();
    return;
  }
  if (current.count >= auth.rateLimitRpm) {
    return openAiError(c, 429, "Rate limit exceeded", "rate_limit_exceeded");
  }
  current.count += 1;
  buckets.set(auth.apiKeyId, current);
  await next();
}
