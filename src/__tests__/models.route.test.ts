import { test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { createModelsRoute } from "../routes/v1/models.js";

test("models route returns OpenAI-compatible model list", async () => {
  const route = createModelsRoute({
    listMantleModelsFn: async () => [
      {
        id: "org/demo-model",
        created: 1_776_000_000,
        ownedBy: "org",
      },
    ],
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", {
      apiKeyId: "key",
      orgId: "org",
      scopes: ["inference"],
      mantleFilter: null,
      rateLimitRpm: 100,
    });
    await next();
  });
  app.route("/v1/models", route);

  const response = await app.request("http://local.test/v1/models");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object, "list");
  assert.equal(body.data[0].id, "org/demo-model");
  assert.equal(body.data[0].object, "model");
});

test("models route returns 500 when listing fails", async () => {
  const route = createModelsRoute({
    listMantleModelsFn: async () => {
      throw new Error("catalog unavailable");
    },
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", {
      apiKeyId: "key",
      orgId: "org",
      scopes: ["inference"],
      mantleFilter: null,
      rateLimitRpm: 100,
    });
    await next();
  });
  app.route("/v1/models", route);

  const response = await app.request("http://local.test/v1/models");
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error?.type, "internal_error");
  assert.match(String(body.error?.message ?? ""), /catalog unavailable/);
});
