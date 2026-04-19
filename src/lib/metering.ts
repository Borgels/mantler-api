import { getSupabaseClient } from "./db.js";

export interface UsageLogInput {
  orgId: string;
  apiKeyId: string;
  mantleFingerprint: string;
  machineId: string;
  modelId: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  status: number;
}

export async function logUsage(input: UsageLogInput): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from("api_usage_log").insert({
    org_id: input.orgId,
    api_key_id: input.apiKeyId,
    mantle_fingerprint: input.mantleFingerprint,
    machine_id: input.machineId,
    model_id: input.modelId,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    latency_ms: input.latencyMs,
    status: input.status,
  });
}
