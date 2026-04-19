import type { AuthContext, MantleResolution } from "../types/index.js";

import { getSupabaseClient } from "./db.js";

const runtimePorts: Record<string, number> = {
  ollama: 11434,
  vllm: 8000,
  llamacpp: 1234,
  tensorrt: 8000,
  quantcpp: 8080,
  mlx: 8080,
};

function normalizeHost(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

function buildEndpointFromMachine(
  machinePayload: Record<string, unknown>,
  runtime: string,
): string | null {
  const hostname =
    typeof machinePayload.hostname === "string" ? machinePayload.hostname.trim() : "";
  const addresses = Array.isArray(machinePayload.reportedAddresses)
    ? machinePayload.reportedAddresses.filter((value): value is string => typeof value === "string")
    : [];
  const host = hostname || addresses.find((entry) => entry.trim()) || "";
  if (!host) return null;
  const parsed = new URL(normalizeHost(host));
  parsed.port = String(runtimePorts[runtime] ?? 11434);
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function extractClusterContext(machinePayload: Record<string, unknown>): {
  clusterNodeCount?: number;
  clusterTopology?: string;
} {
  const cluster = machinePayload.cluster;
  if (!cluster || typeof cluster !== "object") {
    return {};
  }
  const clusterRecord = cluster as Record<string, unknown>;
  const nodeCountRaw = clusterRecord.nodeCount;
  const nodeCount =
    typeof nodeCountRaw === "number" && Number.isFinite(nodeCountRaw)
      ? Math.max(1, Math.trunc(nodeCountRaw))
      : undefined;
  const topologyRaw = clusterRecord.topology;
  const topology =
    typeof topologyRaw === "string" && topologyRaw.trim() ? topologyRaw.trim() : undefined;
  return {
    clusterNodeCount: nodeCount,
    clusterTopology: topology,
  };
}

function assertAllowedByFilter(
  auth: AuthContext,
  mantle: { base_fingerprint: string; slug: string },
) {
  if (!auth.mantleFilter || auth.mantleFilter.length === 0) return;
  const allowed = new Set(auth.mantleFilter.map((entry) => entry.trim()).filter(Boolean));
  if (!allowed.has(mantle.base_fingerprint) && !allowed.has(mantle.slug)) {
    throw new Error("model_not_allowed");
  }
}

export async function resolveMantleFromModel(
  model: string,
  auth: AuthContext,
): Promise<MantleResolution> {
  const supabase = getSupabaseClient();
  const trimmedModel = model.trim();
  if (!trimmedModel) throw new Error("missing_model");
  const slashIndex = trimmedModel.indexOf("/");
  const modelWithoutOrg = slashIndex >= 0 ? trimmedModel.slice(slashIndex + 1) : trimmedModel;

  const candidateValues = Array.from(
    new Set([modelWithoutOrg, trimmedModel].map((value) => value.trim()).filter(Boolean)),
  );
  let mantles: Array<{
    base_fingerprint: string;
    slug: string;
    machine_id: string | null;
    model_id: string;
    runtime: string;
  }> = [];

  for (const value of candidateValues) {
    const [slugMatch, fingerprintMatch, modelIdMatch] = await Promise.all([
      supabase
        .from("mantles")
        .select("base_fingerprint,slug,machine_id,model_id,runtime")
        .eq("org_id", auth.orgId)
        .eq("visibility", "public")
        .eq("slug", value)
        .limit(1),
      supabase
        .from("mantles")
        .select("base_fingerprint,slug,machine_id,model_id,runtime")
        .eq("org_id", auth.orgId)
        .eq("visibility", "public")
        .eq("base_fingerprint", value)
        .limit(1),
      supabase
        .from("mantles")
        .select("base_fingerprint,slug,machine_id,model_id,runtime")
        .eq("org_id", auth.orgId)
        .eq("visibility", "public")
        .eq("model_id", value)
        .limit(5),
    ]);

    const queries = [slugMatch, fingerprintMatch, modelIdMatch];
    for (const result of queries) {
      if (result.error) {
        throw new Error(`mantle_lookup_failed:${result.error.message}`);
      }
      mantles = mantles.concat((result.data ?? []) as typeof mantles);
    }
    if (mantles.length > 0) break;
  }
  if (!mantles || mantles.length === 0) throw new Error("model_not_found");
  const mantle = mantles[0]!;
  assertAllowedByFilter(auth, mantle);
  if (!mantle.machine_id) throw new Error("machine_unavailable");

  const { data: machineRow, error: machineError } = await supabase
    .from("machines")
    .select("payload")
    .eq("id", mantle.machine_id)
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (machineError || !machineRow?.payload || typeof machineRow.payload !== "object") {
    throw new Error("machine_unavailable");
  }

  const endpointUrl = buildEndpointFromMachine(
    machineRow.payload as Record<string, unknown>,
    mantle.runtime,
  );
  if (!endpointUrl) throw new Error("endpoint_unavailable");
  const clusterContext = extractClusterContext(machineRow.payload as Record<string, unknown>);

  return {
    mantleFingerprint: mantle.base_fingerprint,
    machineId: mantle.machine_id,
    endpointUrl,
    backendModel: mantle.model_id,
    runtime: mantle.runtime,
    modelAlias: modelWithoutOrg || mantle.slug,
    clusterNodeCount: clusterContext.clusterNodeCount,
    clusterTopology: clusterContext.clusterTopology,
  };
}

export async function listMantleModels(
  auth: AuthContext,
): Promise<Array<{ id: string; created: number; ownedBy: string }>> {
  const supabase = getSupabaseClient();
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", auth.orgId)
    .maybeSingle();
  const orgSlug = typeof orgRow?.slug === "string" ? orgRow.slug : "org";

  const { data, error } = await supabase
    .from("mantles")
    .select("slug,base_fingerprint,created_at")
    .eq("org_id", auth.orgId)
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`models_lookup_failed:${error.message}`);

  const rows = (data ?? []) as Array<{
    slug: string;
    base_fingerprint: string;
    created_at: string;
  }>;
  const filtered = rows.filter((entry) => {
    if (!auth.mantleFilter || auth.mantleFilter.length === 0) return true;
    const allowed = new Set(auth.mantleFilter);
    return allowed.has(entry.slug) || allowed.has(entry.base_fingerprint);
  });

  return filtered.map((entry) => ({
    id: `${orgSlug}/${entry.slug}`,
    created: Math.floor(new Date(entry.created_at).getTime() / 1000),
    ownedBy: orgSlug,
  }));
}
