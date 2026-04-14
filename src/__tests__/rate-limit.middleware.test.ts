import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { perKeyRateLimit, resetRateLimitBucketsForTests } from "../middleware/rate-limit.js";

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

test("rate limit blocks requests over rpm", async () => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", {
      apiKeyId: "key-rl",
      orgId: "org-1",
      scopes: ["inference"],
      mantleFilter: null,
      rateLimitRpm: 2,
    });
    await next();
  });
  app.use("*", perKeyRateLimit);
  app.get("/", (c) => c.json({ ok: true }));

  const first = await app.request("http://local.test/");
  const second = await app.request("http://local.test/");
  const third = await app.request("http://local.test/");

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
});
