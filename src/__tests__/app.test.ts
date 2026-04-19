import { test } from "node:test";
import assert from "node:assert/strict";

import { app } from "../app.js";

test("app serves OpenAPI 3.1 schema", async () => {
  const response = await app.request("http://local.test/openapi.json");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.ok(body.paths?.["/v1/models"]);
  assert.ok(body.paths?.["/v1/chat/completions"]);
  assert.ok(body.paths?.["/v1/completions"]);
});

test("app serves swagger docs page", async () => {
  const response = await app.request("http://local.test/docs");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /SwaggerUI/i);
});

test("v1 endpoints require auth header", async () => {
  const response = await app.request("http://local.test/v1/models");
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error?.type, "invalid_api_key");
});

test("unknown endpoint returns OpenAI-style 404", async () => {
  const response = await app.request("http://local.test/nope");
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error?.type, "not_found_error");
});
