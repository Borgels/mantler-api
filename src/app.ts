import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { logger } from "hono/logger";

import { authMiddleware } from "./middleware/auth.js";
import { perKeyRateLimit } from "./middleware/rate-limit.js";
import { openAiError } from "./lib/openai-errors.js";
import { chatCompletionsRoute } from "./routes/v1/chat-completions.js";
import { completionsRoute } from "./routes/v1/completions.js";
import { modelsRoute } from "./routes/v1/models.js";
import type { AuthContext } from "./types/index.js";

type Variables = {
  auth: AuthContext;
};

export const app = new OpenAPIHono<{ Variables: Variables }>();

app.use("*", logger());

app.get("/health", (c) => c.json({ ok: true }));

app.use("/v1/*", authMiddleware);
app.use("/v1/*", perKeyRateLimit);

app.route("/v1/models", modelsRoute);
app.route("/v1/chat/completions", chatCompletionsRoute);
app.route("/v1/completions", completionsRoute);

app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Mantler API",
    version: "0.1.0",
  },
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.notFound((c) => openAiError(c, 404, "Endpoint not found", "not_found_error"));

app.onError((error, c) => {
  console.error(error);
  return openAiError(c, 500, "Internal server error", "internal_error");
});
