import { describe, expect, it } from "vitest";
import { GET as healthHandler } from "../app/api/health/route";
import fs from "fs";
import path from "path";

describe("REST API Health & Routes Checklist", () => {
  it("GET /api/health responds with status ok and supabase metrics", async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("supabase");
    expect(data.supabase.connected).toBe(true);
  });

  it("serves valid manus-routes.json containing all primary routes", () => {
    const filePath = path.resolve(process.cwd(), "public/manus-routes.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(Array.isArray(content)).toBe(true);

    const paths = content.map((r: { path: string }) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/projects/:id");
    expect(paths).toContain("/outsourced");
    expect(paths).toContain("/receivables");
    expect(paths).toContain("/tools");
  });
});
