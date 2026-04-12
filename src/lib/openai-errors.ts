import { Context } from "hono";

export function openAiError(
  c: Context,
  status: number,
  message: string,
  code: string,
  type = code,
) {
  return c.json(
    {
      error: {
        message,
        type,
        code,
      },
    },
    status as 400 | 401 | 403 | 404 | 429 | 500 | 502,
  );
}
