import { createHash } from "node:crypto";

import type { Context, Next } from "hono";

import { supabase } from "../lib/db.js";
import { openAiError } from "../lib/openai-errors.js";
import type { AuthContext } from "../types/index.js";

function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return openAiError(c, 401, "Missing API key", "invalid_api_key");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return openAiError(c, 401, "Missing API key", "invalid_api_key");
  }
  const keyHash = hashApiKey(token);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id,org_id,scopes,mantle_filter,rate_limit_rpm,expires_at,revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) {
    return openAiError(c, 401, "Invalid API key", "invalid_api_key");
  }
  if (data.revoked_at) {
    return openAiError(c, 401, "API key revoked", "invalid_api_key");
  }
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    return openAiError(c, 401, "API key expired", "invalid_api_key");
  }

  const auth: AuthContext = {
    apiKeyId: data.id,
    orgId: data.org_id,
    scopes: data.scopes ?? ["inference"],
    mantleFilter: data.mantle_filter ?? null,
    rateLimitRpm: data.rate_limit_rpm ?? 120,
  };
  c.set("auth", auth);

  void supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  await next();
}
