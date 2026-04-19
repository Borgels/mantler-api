import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { logUsage } from "../../lib/metering.js";
import { openAiError } from "../../lib/openai-errors.js";
import { proxyChatCompletion } from "../../lib/proxy.js";
import { resolveMantleFromModel } from "../../lib/resolve-mantle.js";
import type { AuthContext } from "../../types/index.js";

const requestSchema = z
  .object({
    model: z.string().trim().min(1),
  })
  .passthrough();

interface ChatCompletionsRouteDeps {
  resolveMantleFromModelFn: typeof resolveMantleFromModel;
  proxyChatCompletionFn: typeof proxyChatCompletion;
  logUsageFn: typeof logUsage;
}

export function createChatCompletionsRoute(
  deps: ChatCompletionsRouteDeps = {
    resolveMantleFromModelFn: resolveMantleFromModel,
    proxyChatCompletionFn: proxyChatCompletion,
    logUsageFn: logUsage,
  },
) {
  const route = new OpenAPIHono();

  const chatCompletionsOpenApiRoute = createRoute({
    method: "post",
    path: "/",
    tags: ["Completions"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: requestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Proxied completion response",
      },
    },
  });

  route.openapi(chatCompletionsOpenApiRoute, async (c) => {
    const startedAt = Date.now();
    const auth = (c as unknown as { get: (key: string) => AuthContext }).get("auth");
    let statusForLog = 500;
    let resolution: Awaited<ReturnType<typeof resolveMantleFromModel>> | null = null;

    try {
      const body = await c.req.json().catch(() => null);
      const parsed = requestSchema.safeParse(body);
      if (!parsed.success) {
        return openAiError(
          c,
          400,
          "Missing model in request body",
          "invalid_request_error",
        ) as Response;
      }
      resolution = await deps.resolveMantleFromModelFn(parsed.data.model, auth);
      const proxied = await deps.proxyChatCompletionFn({
        endpointUrl: resolution.endpointUrl,
        incomingHeaders: c.req.raw.headers,
        forwardHeaders: {
          "x-mantler-cluster-node-count": resolution.clusterNodeCount?.toString(),
          "x-mantler-cluster-topology": resolution.clusterTopology,
        },
        body: {
          ...parsed.data,
          model: resolution.backendModel,
        },
      });
      statusForLog = proxied.status;
      const usage = await proxied.usage;
      void deps.logUsageFn({
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

      const responseHeaders = new Headers(proxied.headers);
      if (typeof resolution.clusterNodeCount === "number") {
        responseHeaders.set("x-mantler-cluster-node-count", String(resolution.clusterNodeCount));
      }
      if (resolution.clusterTopology) {
        responseHeaders.set("x-mantler-cluster-topology", resolution.clusterTopology);
      }

      return new Response(proxied.body, {
        status: proxied.status,
        statusText: proxied.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      if (resolution) {
        void deps.logUsageFn({
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
      if (message === "missing_model")
        return openAiError(
          c,
          400,
          "Missing model in request body",
          "invalid_request_error",
        ) as Response;
      if (message === "model_not_found")
        return openAiError(c, 404, "Model not found", "model_not_found") as Response;
      if (message === "model_not_allowed")
        return openAiError(c, 403, "Model is not allowed for this key", "forbidden") as Response;
      if (message === "machine_unavailable" || message === "endpoint_unavailable") {
        return openAiError(
          c,
          502,
          "Model endpoint unavailable",
          "upstream_unavailable",
        ) as Response;
      }
      return openAiError(c, 502, message, "upstream_error") as Response;
    }
  });

  return route;
}

export const chatCompletionsRoute = createChatCompletionsRoute();
