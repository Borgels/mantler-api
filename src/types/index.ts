export interface AuthContext {
  apiKeyId: string;
  orgId: string;
  scopes: string[];
  mantleFilter: string[] | null;
  rateLimitRpm: number;
}

export interface MantleResolution {
  mantleFingerprint: string;
  machineId: string;
  endpointUrl: string;
  backendModel: string;
  runtime: string;
  modelAlias: string;
  clusterNodeCount?: number;
  clusterTopology?: string;
}

export interface UsageStats {
  promptTokens: number | null;
  completionTokens: number | null;
}
