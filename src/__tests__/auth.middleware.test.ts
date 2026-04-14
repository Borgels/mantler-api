import { test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { createAuthMiddleware } from "../middleware/auth.js";

function createSupabaseStub(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

test("auth middleware rejects missing bearer token", async () => {
  const app = new Hono();
  app.use("*", createAuthMiddleware({
    getSupabaseClientFn: () => createSupabaseStub(null) as never,
  }));
  app.get("/", (c) => c.json({ ok: true }));

  const response = await app.request("http://local.test/");
  assert.equal(response.status, 401);
});

test("auth middleware sets auth context for valid key", async () => {
  const app = new Hono();
  app.use("*", createAuthMiddleware({
    getSupabaseClientFn: () => createSupabaseStub({
      id: "key-1",
      org_id: "org-1",
      scopes: ["inference"],
      mantle_filter: null,
      rate_limit_rpm: 15,
      expires_at: null,
      revoked_at: null,
    }) as never,
  }));
  app.get("/", (c) => c.json(c.get("auth")));

  const response = await app.request("http://local.test/", {
    headers: { authorization: "Bearer mk_live_test" },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.apiKeyId, "key-1");
  assert.equal(body.orgId, "org-1");
  assert.equal(body.rateLimitRpm, 15);
});
