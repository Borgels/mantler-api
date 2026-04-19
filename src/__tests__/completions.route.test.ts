import { test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { completionsRoute } from "../routes/v1/completions.js";

test("completions route rejects legacy endpoint", async () => {
  const app = new Hono();
  app.route("/v1/completions", completionsRoute);

  const response = await app.request("http://local.test/v1/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "org/demo", prompt: "hello" }),
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error?.type, "unsupported_endpoint");
});
