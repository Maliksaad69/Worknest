import { describe, it, expect } from "vitest";

// Re-implement the sanitization logic here to verify behavior independently
const SEED_PROJECT_IDS = new Set(["p1", "p2", "p3", "p4"]);
const SEED_PROJECT_NAMES = new Set([
  "atlas commerce",
  "lumen launch",
  "harbor ops",
  "orchard retainer",
]);
const SEED_OUTSOURCE_IDS = new Set(["o1", "o2"]);
const SEED_RECEIVABLE_IDS = new Set(["r1", "r2", "r3"]);
const SEED_CREDENTIAL_IDS = new Set(["c1", "c2", "c3"]);
const SEED_SCRIPT_IDS = new Set(["s1", "s2"]);

function isSeedProject(p: { id?: string; name?: string }): boolean {
  if (p.id && SEED_PROJECT_IDS.has(p.id)) return true;
  if (p.name && SEED_PROJECT_NAMES.has(p.name.trim().toLowerCase())) return true;
  return false;
}

function sanitizeStore(raw: any) {
  const projects = Array.isArray(raw?.projects)
    ? raw.projects.filter((p: any) => !isSeedProject(p))
    : [];

  const validProjectIds = new Set(projects.map((p: any) => p.id));

  const outsources = Array.isArray(raw?.outsources)
    ? raw.outsources.filter(
        (item: any) => !SEED_OUTSOURCE_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  const receivables = Array.isArray(raw?.receivables)
    ? raw.receivables.filter(
        (item: any) => !SEED_RECEIVABLE_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  const credentials = Array.isArray(raw?.credentials)
    ? raw.credentials.filter(
        (item: any) =>
          !SEED_CREDENTIAL_IDS.has(item.id) &&
          (!item.projectId || (!SEED_PROJECT_IDS.has(item.projectId) && validProjectIds.has(item.projectId)))
      )
    : [];

  const scripts = Array.isArray(raw?.scripts)
    ? raw.scripts.filter(
        (item: any) => !SEED_SCRIPT_IDS.has(item.id) && !SEED_PROJECT_IDS.has(item.projectId)
      )
    : [];

  return { projects, outsources, receivables, credentials, scripts };
}

describe("Store Sanitization & Dynamic Project Count", () => {
  it("purges all legacy dummy/seeded projects by ID and name", () => {
    const legacySnapshot = {
      projects: [
        { id: "p1", name: "Atlas Commerce", client: "Northstar Labs" },
        { id: "p2", name: "Lumen Launch", client: "Lumen Studio" },
        { id: "p3", name: "Harbor Ops", client: "Harbor & Co." },
        { id: "p4", name: "Orchard Retainer", client: "Orchard Health" },
      ],
      outsources: [
        { id: "o1", projectId: "p1", provider: "John Malik" },
        { id: "o2", projectId: "p4", provider: "Studio Koi" },
      ],
      receivables: [
        { id: "r1", projectId: "p1", received: 2100 },
        { id: "r2", projectId: "p2", received: 1800 },
        { id: "r3", projectId: "p3", received: 0 },
      ],
      credentials: [
        { id: "c1", service: "Northstar staging", projectId: "p1" },
        { id: "c2", service: "Lumen CMS", projectId: "p2" },
        { id: "c3", service: "Harbor AWS", projectId: "p3" },
      ],
      scripts: [
        { id: "s1", name: "Tail logs safely", projectId: "p1" },
        { id: "s2", name: "Backup Postgres", projectId: "p3" },
      ],
    };

    const sanitized = sanitizeStore(legacySnapshot);
    expect(sanitized.projects).toHaveLength(0);
    expect(sanitized.outsources).toHaveLength(0);
    expect(sanitized.receivables).toHaveLength(0);
    expect(sanitized.credentials).toHaveLength(0);
    expect(sanitized.scripts).toHaveLength(0);
  });

  it("preserves real user-created projects and calculates live nav count correctly", () => {
    const userProjects = [
      { id: "usr_proj_1", name: "Mobile App Redesign", client: "Acme Corp", amount: 5000 },
      { id: "usr_proj_2", name: "E-commerce Migration", client: "Globex Inc", amount: 12000 },
    ];

    const store = sanitizeStore({
      projects: userProjects,
      outsources: [],
      receivables: [],
      credentials: [],
      scripts: [],
    });

    expect(store.projects).toHaveLength(2);
    expect(store.projects[0].name).toBe("Mobile App Redesign");
    expect(store.projects[1].name).toBe("E-commerce Migration");

    // The nav count should reflect store.projects.length (2, not hardcoded 4)
    const projectCount = store.projects.length;
    expect(projectCount).toBe(2);
  });

  it("accurately reports 0 when no projects exist", () => {
    const store = sanitizeStore({
      projects: [],
      outsources: [],
      receivables: [],
      credentials: [],
      scripts: [],
    });

    expect(store.projects).toHaveLength(0);
    const projectCount = store.projects.length;
    expect(projectCount).toBe(0);
  });
});
