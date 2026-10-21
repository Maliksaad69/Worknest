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

  it("supports saving and loading workspace state with separate normalized rows and relations", async () => {
    const sampleWorkspace = {
      projects: [
        {
          id: "p_rel_1",
          name: "Alpha Platform",
          client: "Acme Corp",
          amount: 5000,
          received: 2500,
          status: "In Progress",
          priority: "High",
          tasks: [
            { id: "t_rel_1", label: "Initial architectural spike", done: true },
            { id: "t_rel_2", label: "Relational database joins", done: false },
          ],
        },
      ],
      outsources: [
        {
          id: "o_rel_1",
          projectId: "p_rel_1",
          provider: "Studio Design Co",
          cost: 1200,
          paid: 600,
          status: "In Progress",
          payments: [
            { id: "pm_rel_1", amount: 600, date: "2026-10-21", note: "Milestone 1" },
          ],
        },
      ],
      receivables: [
        {
          id: "r_rel_1",
          projectId: "p_rel_1",
          received: 2500,
          dueDate: "2026-11-01",
          status: "Partially Paid",
          notes: "First milestone paid",
        },
      ],
      credentials: [
        {
          id: "c_rel_1",
          service: "AWS Production Bastion",
          projectId: "p_rel_1",
          username: "admin",
          password: "secure-key-123",
          url: "https://aws.amazon.com",
          notes: "Primary cluster access",
        },
      ],
      scripts: [
        {
          id: "s_rel_1",
          name: "Deploy Canary",
          category: "Deployment",
          description: "Deploys canary container",
          code: "docker compose up -d canary",
          tags: ["docker", "deploy"],
          projectId: "p_rel_1",
          notes: "",
        },
      ],
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
    expect(loadedData.projects[0].tasks).toHaveLength(2);
    expect(loadedData.projects[0].tasks[0].label).toBe("Initial architectural spike");
    expect(loadedData.outsources).toHaveLength(1);
    expect(loadedData.outsources[0].payments).toHaveLength(1);
    expect(loadedData.receivables).toHaveLength(1);
    expect(loadedData.credentials).toHaveLength(1);
    expect(loadedData.scripts).toHaveLength(1);

    // Verify relational query procedures with joins
    const projectDetails = await caller.projects.listWithDetails();
    expect(projectDetails).toBeDefined();

    const singleProject = await caller.projects.getById({ id: "p_rel_1" });
    expect(singleProject).not.toBeNull();
    expect((singleProject as { name: string }).name).toBe("Alpha Platform");
  });
});
