import { describe, expect, it } from "vitest";
import { appRouter } from "../lib/trpc/router";

describe("Native Next.js tRPC Router & Backend", () => {
  const caller = appRouter.createCaller({ user: null });
  const authCaller = appRouter.createCaller({
    user: {
      id: "usr_test_123",
      openId: "usr_test_123",
      name: "Alex Morgan",
      email: "alex@worknest.dev",
      role: "admin",
    },
  });

  it("handles health check query with timestamp validation", async () => {
    const res = await caller.system.health({ timestamp: Date.now() });
    expect(res).toEqual({ ok: true });
  });

  it("handles supabaseStatus query and reports connection mode", async () => {
    const status = await caller.system.supabaseStatus();
    expect(status).toHaveProperty("configured");
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("mode");
    expect(status).toHaveProperty("message");
    expect(typeof status.configured).toBe("boolean");
    expect(typeof status.message).toBe("string");
  });

  it("handles auth queries safely without session", async () => {
    const user = await caller.auth.me();
    expect(user).toBeNull();

    const logout = await caller.auth.logout();
    expect(logout).toEqual({ success: true });
  });

  it("returns authenticated user details when session exists", async () => {
    const user = await authCaller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.name).toBe("Alex Morgan");
    expect(user?.email).toBe("alex@worknest.dev");
    expect(user?.role).toBe("admin");
  });

  it("supports saving and loading workspace state end-to-end", async () => {
    const sampleWorkspace = {
      projects: [
        {
          id: "p_test_1",
          name: "Alpha Platform",
          client: "Acme Corp",
          amount: 5000,
          received: 2500,
          status: "In Progress",
        },
      ],
      outsources: [],
      receivables: [],
      credentials: [],
      scripts: [],
    };

    // Save state
    const saveRes = await caller.workspace.save({ data: sampleWorkspace });
    expect(saveRes.success).toBe(true);
    expect(saveRes).toHaveProperty("mode");

    // Load state back
    const loadedData = (await caller.workspace.load()) as typeof sampleWorkspace;
    expect(loadedData).not.toBeNull();
    expect(loadedData.projects).toHaveLength(1);
    expect(loadedData.projects[0].name).toBe("Alpha Platform");
  });
});
