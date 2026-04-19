import { createHash } from "node:crypto";

import type { Context, Next } from "hono";

import { getSupabaseClient } from "../lib/db.js";
import { openAiError } from "../lib/openai-errors.js";
import type { AuthContext } from "../types/index.js";

function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

interface AuthMiddlewareDeps {
  getSupabaseClientFn: typeof getSupabaseClient;
}

export function createAuthMiddleware(
  deps: AuthMiddlewareDeps = { getSupabaseClientFn: getSupabaseClient },
) {
  return async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return openAiError(c, 401, "Missing API key", "invalid_api_key");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return openAiError(c, 401, "Missing API key", "invalid_api_key");
    }
    if (!token.startsWith("mk_")) {
      return openAiError(c, 401, "Invalid API key", "invalid_api_key");
    }
    let supabase;
    try {
      supabase = deps.getSupabaseClientFn();
    } catch {
      return openAiError(c, 503, "Gateway is not configured", "service_unavailable");
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
    const row = data as {
      id: string;
      org_id: string;
      scopes: string[] | null;
      mantle_filter: string[] | null;
      rate_limit_rpm: number | null;
      expires_at: string | null;
      revoked_at: string | null;
    };

    if (row.revoked_at) {
      return openAiError(c, 401, "API key revoked", "invalid_api_key");
    }
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      return openAiError(c, 401, "API key expired", "invalid_api_key");
    }

    const auth: AuthContext = {
      apiKeyId: row.id,
      orgId: row.org_id,
      scopes: row.scopes ?? ["inference"],
      mantleFilter: row.mantle_filter ?? null,
      rateLimitRpm: row.rate_limit_rpm ?? 120,
    };
    c.set("auth", auth);

    void supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
    await next();
  };
}

export const authMiddleware = createAuthMiddleware();
