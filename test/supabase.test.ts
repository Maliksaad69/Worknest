import { describe, expect, it } from "vitest";
import { checkSupabaseHealth, getSupabaseClient } from "../lib/db";
import { createClient as createBrowserSupabase } from "../utils/supabase/client";

describe("Supabase Integration & Health", () => {
  it("initializes getSupabaseClient from environment variables", () => {
    const client = getSupabaseClient();
    expect(client).not.toBeNull();
  });

  it("initializes browser client with configured URL and Key", () => {
    const client = createBrowserSupabase();
    expect(client).toBeDefined();
    expect(client.supabaseUrl).toContain("supabase.co");
  });

  it("runs checkSupabaseHealth and reaches Supabase server", async () => {
    const health = await checkSupabaseHealth();
    expect(health.configured).toBe(true);
    expect(health.connected).toBe(true);
    expect(health.mode).toBe("supabase-js");
    // Since migration hasn't been run yet on the live project, it correctly reports table status
    expect(typeof health.tableExists).toBe("boolean");
    expect(health.message).toBeDefined();
  });
});
