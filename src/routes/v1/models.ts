import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { listMantleModels } from "../../lib/resolve-mantle.js";
import { openAiError } from "../../lib/openai-errors.js";
import type { AuthContext } from "../../types/index.js";

interface ModelsRouteDeps {
  listMantleModelsFn: typeof listMantleModels;
}

export function createModelsRoute(
  deps: ModelsRouteDeps = { listMantleModelsFn: listMantleModels },
) {
  const route = new OpenAPIHono();

  const modelSchema = z.object({
    id: z.string(),
    object: z.literal("model"),
    created: z.number().int(),
    owned_by: z.string(),
    permission: z.array(z.unknown()),
  });

  const listModelsRoute = createRoute({
    method: "get",
    path: "/",
    tags: ["Models"],
    responses: {
      200: {
        description: "List models",
        content: {
          "application/json": {
            schema: z.object({
              object: z.literal("list"),
              data: z.array(modelSchema),
            }),
          },
        },
      },
    },
  });

  route.openapi(listModelsRoute, async (c) => {
    try {
      const auth = (c as unknown as { get: (key: string) => AuthContext }).get("auth");
      const models = await deps.listMantleModelsFn(auth);
      return c.json({
        object: "list",
        data: models.map((entry) => ({
          id: entry.id,
          object: "model",
          created: entry.created,
          owned_by: entry.ownedBy,
          permission: [] as unknown[],
        })),
      });
    } catch (error) {
      return openAiError(
        c,
        500,
        error instanceof Error ? error.message : "Failed to list models",
        "internal_error",
      ) as Response;
    }
  });

  return route;
}

export const modelsRoute = createModelsRoute();
