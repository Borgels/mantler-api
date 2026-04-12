import type { UsageStats } from "../types/index.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function copyHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

function buildCompletionEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function extractUsageFromLine(line: string): UsageStats | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice("data:".length).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    if (!parsed.usage) return null;
    const prompt = typeof parsed.usage.prompt_tokens === "number" ? parsed.usage.prompt_tokens : null;
    const completion = typeof parsed.usage.completion_tokens === "number" ? parsed.usage.completion_tokens : null;
    return { promptTokens: prompt, completionTokens: completion };
  } catch {
    return null;
  }
}

export async function proxyChatCompletion(options: {
  endpointUrl: string;
  incomingHeaders: Headers;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{
  status: number;
  statusText: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  usage: Promise<UsageStats>;
}> {
  const upstream = await fetch(buildCompletionEndpoint(options.endpointUrl), {
    method: "POST",
    headers: copyHeaders(options.incomingHeaders),
    body: JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 300_000),
  });

  const contentType = upstream.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  let usageResolver: (usage: UsageStats) => void = () => undefined;
  const usage = new Promise<UsageStats>((resolve) => {
    usageResolver = resolve;
  });

  if (!upstream.body) {
    usageResolver({ promptTokens: null, completionTokens: null });
    return {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: copyHeaders(upstream.headers),
      body: null,
      usage,
    };
  }

  if (!isSse) {
    const clone = upstream.clone();
    void clone.json().then((json) => {
      const usageBlock = (json as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })?.usage;
      usageResolver({
        promptTokens: typeof usageBlock?.prompt_tokens === "number" ? usageBlock.prompt_tokens : null,
        completionTokens: typeof usageBlock?.completion_tokens === "number" ? usageBlock.completion_tokens : null,
      });
    }).catch(() => usageResolver({ promptTokens: null, completionTokens: null }));
    return {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: copyHeaders(upstream.headers),
      body: upstream.body,
      usage,
    };
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffered = "";
  let latestUsage: UsageStats = { promptTokens: null, completionTokens: null };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffered.trim()) {
          const finalUsage = extractUsageFromLine(buffered.trim());
          if (finalUsage) latestUsage = finalUsage;
        }
        usageResolver(latestUsage);
        controller.close();
        return;
      }
      if (value) {
        const text = decoder.decode(value, { stream: true });
        buffered += text;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const found = extractUsageFromLine(line.trim());
          if (found) latestUsage = found;
        }
        controller.enqueue(encoder.encode(text));
      }
    },
    cancel(reason) {
      usageResolver(latestUsage);
      return reader.cancel(reason);
    },
  });

  return {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyHeaders(upstream.headers),
    body: stream,
    usage,
  };
}
