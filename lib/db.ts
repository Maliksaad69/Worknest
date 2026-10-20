import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { worknestState, type InsertWorknestState } from "../drizzle/schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;
let _supabaseClient: SupabaseClient | null = null;

// In-memory fallback cache (used when DB table is not yet migrated or during tests)
let _inMemoryState: unknown = null;

const WORKSPACE_ID = "default";

/**
 * Returns a Supabase JS client instance if keys are configured.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_supabaseClient) return _supabaseClient;

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_PUBBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    try {
      _supabaseClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      return _supabaseClient;
    } catch (err) {
      console.warn("[Database] Failed to initialize Supabase JS client:", err);
      return null;
    }
  }

  return null;
}

/**
 * Returns a Drizzle DB instance connected to Supabase Postgres.
 * Reads SUPABASE_DATABASE_URL or DATABASE_URL from environment variables.
 */
export function getDb() {
  const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!_db && url) {
    try {
      const needsSsl =
        url.includes("sslmode=require") ||
        url.includes("supabase.co") ||
        url.includes("supabase.com");

      _client = postgres(url, {
        prepare: false,
        max: 5,
        ...(needsSsl ? { ssl: "require" } : {}),
      });
      _db = drizzle(_client);
      console.log("[Database] Connected to Supabase Postgres via Drizzle");
    } catch (error) {
      console.warn("[Database] Failed to initialize Supabase Postgres connection:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Checks connection status to Supabase (via REST client or Postgres direct connection).
 */
export async function checkSupabaseHealth() {
  const supabase = getSupabaseClient();
  const db = getDb();

  const result = {
    configured: Boolean(supabase || db),
    connected: false,
    tableExists: false,
    mode: (db ? "drizzle" : supabase ? "supabase-js" : "none") as "drizzle" | "supabase-js" | "none",
    message: "",
  };

  if (db) {
    try {
      const rows = await db
        .select()
        .from(worknestState)
        .where(eq(worknestState.id, WORKSPACE_ID))
        .limit(1);
      result.connected = true;
      result.tableExists = true;
      result.message = "Connected to Supabase Postgres via Drizzle ORM.";
      return result;
    } catch (err: unknown) {
      result.connected = true;
      result.tableExists = false;
      result.message = `Direct DB connected, but table error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("worknest_state")
        .select("id")
        .limit(1);

      if (error) {
        if (error.code === "PGRST205") {
          // Table not found in schema cache
          result.connected = true;
          result.tableExists = false;
          result.message = "Connected to Supabase project, but 'worknest_state' table has not been created yet. Please apply the migration SQL.";
        } else {
          result.connected = true;
          result.message = `Supabase responded: ${error.message}`;
        }
      } else {
        result.connected = true;
        result.tableExists = true;
        result.message = "Connected to Supabase successfully via PostgREST API.";
      }
      return result;
    } catch (err: unknown) {
      result.connected = false;
      result.message = `Supabase request failed: ${err instanceof Error ? err.message : String(err)}`;
      return result;
    }
  }

  result.message = "No Supabase credentials or database connection URL configured.";
  return result;
}

/**
 * Loads the current Worknest workspace state snapshot from Supabase.
 * Checks Drizzle first, then Supabase JS client, and falls back to in-memory cache.
 */
export async function getWorkspaceState() {
  const db = getDb();
  if (db) {
    try {
      const result = await db
        .select()
        .from(worknestState)
        .where(eq(worknestState.id, WORKSPACE_ID))
        .limit(1);

      if (result[0]?.data) {
        _inMemoryState = result[0].data;
        return result[0].data;
      }
    } catch (error) {
      console.warn("[Database] Drizzle query error:", error);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("worknest_state")
        .select("data")
        .eq("id", WORKSPACE_ID)
        .maybeSingle();

      if (!error && data?.data) {
        _inMemoryState = data.data;
        return data.data;
      }

      if (error && error.code !== "PGRST205") {
        console.warn("[Database] Supabase query notice:", error.message);
      }
    } catch (error) {
      console.warn("[Database] Supabase client error:", error);
    }
  }

  return _inMemoryState ?? undefined;
}

/**
 * Persists the Worknest workspace state snapshot into Supabase.
 * Attempts persist via Drizzle or Supabase JS client, and updates in-memory cache.
 */
export async function saveWorkspaceState(data: unknown): Promise<{ success: boolean; mode: string }> {
  _inMemoryState = data;
  let savedToDb = false;
  let mode = "in-memory";

  const db = getDb();
  if (db) {
    try {
      const values: InsertWorknestState = { id: WORKSPACE_ID, data };
      await db
        .insert(worknestState)
        .values(values)
        .onConflictDoUpdate({
          target: worknestState.id,
          set: { data, updatedAt: new Date() },
        });
      savedToDb = true;
      mode = "drizzle";
    } catch (error) {
      console.warn("[Database] Failed to persist via Drizzle:", error);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase && !savedToDb) {
    try {
      const { error } = await supabase
        .from("worknest_state")
        .upsert(
          {
            id: WORKSPACE_ID,
            data,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) {
        if (error.code === "PGRST205") {
          console.warn("[Database] 'worknest_state' table not yet migrated in Supabase. Data cached in-memory.");
        } else {
          console.warn("[Database] Supabase upsert notice:", error.message);
        }
      } else {
        savedToDb = true;
        mode = "supabase-js";
      }
    } catch (error) {
      console.warn("[Database] Supabase persist error:", error);
    }
  }

  return { success: true, mode };
}
