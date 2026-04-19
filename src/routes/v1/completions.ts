import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { openAiError } from "../../lib/openai-errors.js";

export const completionsRoute = new OpenAPIHono();

const unsupportedCompletionsRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Completions"],
  responses: {
    400: {
      description: "Unsupported endpoint",
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({
              message: z.string(),
              type: z.string(),
              code: z.string().nullable().optional(),
            }),
          }),
        },
      },
    },
  },
});

completionsRoute.openapi(
  unsupportedCompletionsRoute,
  (c) =>
    openAiError(
      c,
      400,
      "Legacy /v1/completions is not supported. Use /v1/chat/completions.",
      "unsupported_endpoint",
    ) as Response,
);
