import { Hono } from "hono";

import { openAiError } from "../../lib/openai-errors.js";

export const completionsRoute = new Hono();

completionsRoute.post("/", (c) =>
  openAiError(
    c,
    400,
    "Legacy /v1/completions is not supported. Use /v1/chat/completions.",
    "unsupported_endpoint",
  ));
