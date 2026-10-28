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
          status: "In Progress" as const,
          priority: "High" as const,
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
          status: "In Progress" as const,
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
          status: "Partially Paid" as const,
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
    const loadedData = await caller.workspace.load();
    expect(loadedData).not.toBeNull();
    expect(loadedData!.projects).toHaveLength(1);
    expect(loadedData!.projects[0].name).toBe("Alpha Platform");
    expect(loadedData!.projects[0].tasks).toHaveLength(2);
    expect(loadedData!.projects[0].tasks[0].label).toBe("Initial architectural spike");
    expect(loadedData!.outsources).toHaveLength(1);
    expect(loadedData!.outsources[0].payments).toHaveLength(1);
    expect(loadedData!.receivables).toHaveLength(1);
    expect(loadedData!.credentials).toHaveLength(1);
    expect(loadedData!.scripts).toHaveLength(1);

    // Verify relational query procedures with joins
    const projectDetails = await caller.projects.listWithDetails();
    expect(projectDetails).toBeDefined();

    const singleProject = await caller.projects.getById({ id: "p_rel_1" });
    expect(singleProject).not.toBeNull();
    expect((singleProject as { name: string }).name).toBe("Alpha Platform");
  });

  it("handles granular CRUD operations for projects and tasks", async () => {
    // Create a project
    const createdProject = await caller.projects.create({
      id: "p_crud_1",
      name: "Beta Mobile App",
      client: "Beta Global",
      amount: 10000,
      priority: "Urgent",
      tasks: [{ id: "t_crud_1", label: "Initial UX wireframes", done: false }],
    });
    expect(createdProject.id).toBe("p_crud_1");
    expect(createdProject.name).toBe("Beta Mobile App");
    expect(createdProject.tasks).toHaveLength(1);

    // List projects
    const allProjects = await caller.projects.list();
    expect(allProjects.some((p) => p.id === "p_crud_1")).toBe(true);

    // Update project
    const updatedProject = await caller.projects.update({
      id: "p_crud_1",
      status: "In Progress",
      amount: 12000,
    });
    expect(updatedProject?.status).toBe("In Progress");
    expect(updatedProject?.amount).toBe(12000);

    // Create a task
    const newTask = await caller.tasks.create({
      id: "t_crud_2",
      projectId: "p_crud_1",
      label: "API endpoint schema integration",
      done: false,
    });
    expect(newTask.label).toBe("API endpoint schema integration");

    // Toggle task
    const toggledTask = await caller.tasks.toggle({
      id: "t_crud_2",
      done: true,
    });
    expect(toggledTask?.done).toBe(true);

    // Delete task
    const delTaskRes = await caller.tasks.delete({ id: "t_crud_2" });
    expect(delTaskRes.success).toBe(true);

    // Delete project
    const delProjRes = await caller.projects.delete({ id: "p_crud_1" });
    expect(delProjRes.success).toBe(true);

    const projectAfterDel = await caller.projects.getById({ id: "p_crud_1" });
    expect(projectAfterDel).toBeNull();
  });

  it("handles granular CRUD operations for outsources, receivables, credentials, and scripts", async () => {
    // Setup a parent project
    await caller.projects.create({
      id: "p_full_1",
      name: "Gamma Integration",
      client: "Gamma Logistics",
      amount: 8000,
    });

    // Outsource CRUD
    const createdOutsource = await caller.outsources.create({
      id: "o_crud_1",
      projectId: "p_full_1",
      provider: "Cloud DevOps Agency",
      cost: 2500,
      paid: 1000,
      status: "In Progress",
    });
    expect(createdOutsource.provider).toBe("Cloud DevOps Agency");

    // Add partial payment to outsource with scheduled remaining pay date
    const partialPayment = await caller.outsources.addPayment({
      outsourceId: "o_crud_1",
      amount: 500,
      note: "Partial payment 1",
      remainingPayDate: "2026-11-25",
    });
    expect(partialPayment.amount).toBe(500);

    const midOutsource = await caller.outsources.getById({ id: "o_crud_1" });
    expect(midOutsource?.paid).toBe(1500);
    expect(midOutsource?.payDate).toBe("2026-11-25");
    expect(midOutsource?.status).toBe("In Progress");

    // Final payout to complete outsource
    const payment = await caller.outsources.addPayment({
      outsourceId: "o_crud_1",
      amount: 1000,
      note: "Final delivery milestone",
    });
    expect(payment.amount).toBe(1000);

    const fetchedOutsource = await caller.outsources.getById({ id: "o_crud_1" });
    expect(fetchedOutsource?.paid).toBe(2500);
    expect(fetchedOutsource?.status).toBe("Completed");

    // Receivable CRUD
    const receivable = await caller.receivables.create({
      id: "r_crud_1",
      projectId: "p_full_1",
      dueDate: "2026-11-20",
    });
    expect(receivable.projectId).toBe("p_full_1");

    // Record receivable payment
    const paymentRec = await caller.receivables.recordPayment({
      projectId: "p_full_1",
      amount: 4000,
    });
    expect(paymentRec.project.received).toBe(4000);
    expect(paymentRec.receivable.status).toBe("Partially Paid");

    // Credential CRUD with dynamic key-value fields and client grouping
    const credential = await caller.credentials.create({
      id: "c_crud_1",
      service: "GitHub Enterprise",
      client: "Northstar Labs",
      projectId: "p_full_1",
      username: "worknest-ci",
      password: "ghp_secret_token_123",
      url: "https://github.com",
      fields: [
        { id: "f_key", key: "API Key", value: "ghp_secret_token_123", isSecret: true },
        { id: "f_url", key: "Portal URL", value: "https://github.com", isSecret: false },
        { id: "f_db", key: "Database Host", value: "db.northstar.internal", isSecret: false },
        { id: "f_port", key: "SSH Port", value: "22022", isSecret: false },
      ],
    });
    expect(credential.service).toBe("GitHub Enterprise");
    expect(credential.client).toBe("Northstar Labs");
    expect(credential.fields).toHaveLength(4);
    expect(credential.fields?.find((f) => f.key === "SSH Port")?.value).toBe("22022");
    expect(credential.fields?.find((f) => f.key === "API Key")?.isSecret).toBe(true);

    // Update credential to dynamically add another field
    const updatedCred = await caller.credentials.update({
      id: "c_crud_1",
      fields: [
        ...(credential.fields || []),
        { id: "f_webhook", key: "Webhook Secret", value: "whsec_xyz987", isSecret: true },
      ],
    });
    expect(updatedCred?.fields).toHaveLength(5);
    expect(updatedCred?.fields?.some((f) => f.key === "Webhook Secret")).toBe(true);

    const credList = await caller.credentials.list();
    const fetchedCred = credList.find((c) => c.id === "c_crud_1");
    expect(fetchedCred).toBeDefined();
    expect(fetchedCred?.fields).toHaveLength(5);
    expect(fetchedCred?.client).toBe("Northstar Labs");

    // Script CRUD
    const script = await caller.scripts.create({
      id: "s_crud_1",
      name: "Run Integration Tests",
      category: "DevOps",
      code: "pnpm test",
      tags: ["ci", "tests"],
      projectId: "p_full_1",
    });
    expect(script.name).toBe("Run Integration Tests");

    const scriptList = await caller.scripts.list();
    expect(scriptList.some((s) => s.id === "s_crud_1")).toBe(true);

    // Clean up
    await caller.outsources.delete({ id: "o_crud_1" });
    await caller.receivables.delete({ id: "r_crud_1" });
    await caller.credentials.delete({ id: "c_crud_1" });
    await caller.scripts.delete({ id: "s_crud_1" });
    await caller.projects.delete({ id: "p_full_1" });
  });

  it("synchronizes workspace state deletions properly without resurrected records", async () => {
    // 1. Save workspace with two projects
    await caller.workspace.save({
      data: {
        projects: [
          { id: "p_sync_1", name: "Keep Me", amount: 1000 },
          { id: "p_sync_2", name: "Delete Me", amount: 2000 },
        ],
        outsources: [{ id: "o_sync_1", projectId: "p_sync_1", provider: "Partner A" }],
        receivables: [{ id: "r_sync_1", projectId: "p_sync_1", received: 500 }],
        credentials: [{ id: "c_sync_1", service: "Database", username: "u", password: "p" }],
        scripts: [{ id: "s_sync_1", name: "Backup", code: "pg_dump" }],
      },
    });

    const state1 = await caller.workspace.load();
    expect(state1!.projects).toHaveLength(2);

    // 2. Save workspace without "p_sync_2"
    await caller.workspace.save({
      data: {
        projects: [{ id: "p_sync_1", name: "Keep Me", amount: 1000 }],
        outsources: [{ id: "o_sync_1", projectId: "p_sync_1", provider: "Partner A" }],
        receivables: [{ id: "r_sync_1", projectId: "p_sync_1", received: 500 }],
        credentials: [{ id: "c_sync_1", service: "Database", username: "u", password: "p" }],
        scripts: [{ id: "s_sync_1", name: "Backup", code: "pg_dump" }],
      },
    });

    const state2 = await caller.workspace.load();
    expect(state2!.projects).toHaveLength(1);
    expect(state2!.projects[0].id).toBe("p_sync_1");

    // Clean up
    await caller.workspace.save({
      data: {
        projects: [],
        outsources: [],
        receivables: [],
        credentials: [],
        scripts: [],
      },
    });

    const emptyState = await caller.workspace.load();
    expect(emptyState!.projects).toHaveLength(0);
  });
});
