import { createClient } from "@supabase/supabase-js";

type GenericDatabase = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: never[];
    }>;
    Views: Record<string, {
      Row: Record<string, unknown>;
      Relationships: never[];
    }>;
    Functions: Record<string, {
      Args: Record<string, unknown>;
      Returns: unknown;
    }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
};

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let client: ReturnType<typeof createClient<GenericDatabase>> | null = null;

export function getSupabaseClient() {
  if (!client) {
    client = createClient<GenericDatabase>(
      readEnv("SUPABASE_URL"),
      readEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return client;
}
