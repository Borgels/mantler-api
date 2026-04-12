import { Hono } from "hono";
import { z } from "zod";

import { logUsage } from "../../lib/metering.js";
import { openAiError } from "../../lib/openai-errors.js";
import { proxyChatCompletion } from "../../lib/proxy.js";
import { resolveMantleFromModel } from "../../lib/resolve-mantle.js";
import type { AuthContext } from "../../types/index.js";

const requestSchema = z.object({
  model: z.string().trim().min(1),
}).passthrough();

export const chatCompletionsRoute = new Hono();

chatCompletionsRoute.post("/", async (c) => {
  const startedAt = Date.now();
  const auth = (c as unknown as { get: (key: string) => AuthContext }).get("auth");
  let statusForLog = 500;
  let resolution:
    | Awaited<ReturnType<typeof resolveMantleFromModel>>
    | null = null;

  try {
    const body = await c.req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return openAiError(c, 400, "Missing model in request body", "invalid_request_error");
    }
    resolution = await resolveMantleFromModel(parsed.data.model, auth);
    const proxied = await proxyChatCompletion({
      endpointUrl: resolution.endpointUrl,
      incomingHeaders: c.req.raw.headers,
      body: {
        ...parsed.data,
        model: resolution.backendModel,
      },
    });
    statusForLog = proxied.status;
    const usage = await proxied.usage;
    void logUsage({
      orgId: auth.orgId,
      apiKeyId: auth.apiKeyId,
      mantleFingerprint: resolution.mantleFingerprint,
      machineId: resolution.machineId,
      modelId: resolution.backendModel,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs: Date.now() - startedAt,
      status: proxied.status,
    });

    return new Response(proxied.body, {
      status: proxied.status,
      statusText: proxied.statusText,
      headers: proxied.headers,
    });
  } catch (error) {
    if (resolution) {
      void logUsage({
        orgId: auth.orgId,
        apiKeyId: auth.apiKeyId,
        mantleFingerprint: resolution.mantleFingerprint,
        machineId: resolution.machineId,
        modelId: resolution.backendModel,
        promptTokens: null,
        completionTokens: null,
        latencyMs: Date.now() - startedAt,
        status: statusForLog,
      });
    }
    const message = error instanceof Error ? error.message : "Inference request failed";
    if (message === "missing_model") return openAiError(c, 400, "Missing model in request body", "invalid_request_error");
    if (message === "model_not_found") return openAiError(c, 404, "Model not found", "model_not_found");
    if (message === "model_not_allowed") return openAiError(c, 403, "Model is not allowed for this key", "forbidden");
    if (message === "machine_unavailable" || message === "endpoint_unavailable") {
      return openAiError(c, 502, "Model endpoint unavailable", "upstream_unavailable");
    }
    return openAiError(c, 502, message, "upstream_error");
  }
});
