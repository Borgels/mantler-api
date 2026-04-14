import { Hono } from "hono";

import { listMantleModels } from "../../lib/resolve-mantle.js";
import { openAiError } from "../../lib/openai-errors.js";
import type { AuthContext } from "../../types/index.js";

interface ModelsRouteDeps {
  listMantleModelsFn: typeof listMantleModels;
}

export function createModelsRoute(deps: ModelsRouteDeps = { listMantleModelsFn: listMantleModels }) {
  const route = new Hono();

  route.get("/", async (c) => {
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
          permission: [],
        })),
      });
    } catch (error) {
      return openAiError(
        c,
        500,
        error instanceof Error ? error.message : "Failed to list models",
        "internal_error",
      );
    }
  });

  return route;
}

export const modelsRoute = createModelsRoute();
