import { test } from "node:test";
import assert from "node:assert/strict";

import { Hono } from "hono";

import { createChatCompletionsRoute } from "../routes/v1/chat-completions.js";

function buildApp(overrides?: {
  resolveError?: Error;
}) {
  const usageLogs: Array<Record<string, unknown>> = [];
  const route = createChatCompletionsRoute({
    resolveMantleFromModelFn: async () => {
      if (overrides?.resolveError) throw overrides.resolveError;
      return {
        mantleFingerprint: "fp-1",
        machineId: "spark02",
        endpointUrl: "http://127.0.0.1:11434",
        backendModel: "qwen2.5:0.5b",
        runtime: "ollama",
        modelAlias: "org/qwen",
      };
    },
    proxyChatCompletionFn: async (payload) => {
      const body = payload.body as Record<string, unknown>;
      const encoded = new TextEncoder().encode(JSON.stringify({ ok: true, model: body.model }));
      return {
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        body: ReadableStream.from([encoded]),
        usage: Promise.resolve({ promptTokens: 12, completionTokens: 3 }),
      };
    },
    logUsageFn: async (entry) => {
      usageLogs.push(entry as Record<string, unknown>);
    },
  });

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("auth", {
      apiKeyId: "key-1",
      orgId: "org-1",
      scopes: ["inference"],
      mantleFilter: null,
      rateLimitRpm: 120,
    });
    await next();
  });
  app.route("/v1/chat/completions", route);
  return { app, usageLogs };
}

test("chat completions returns 400 when model missing", async () => {
  const { app } = buildApp();
  const response = await app.request("http://local.test/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(response.status, 400);
});

test("chat completions proxies request and logs usage", async () => {
  const { app, usageLogs } = buildApp();
  const response = await app.request("http://local.test/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "org/qwen",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.model, "qwen2.5:0.5b");
  assert.equal(usageLogs.length, 1);
});

test("chat completions maps resolver model_not_found to 404", async () => {
  const { app } = buildApp({ resolveError: new Error("model_not_found") });
  const response = await app.request("http://local.test/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "org/missing",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  assert.equal(response.status, 404);
});
