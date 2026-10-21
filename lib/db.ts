import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as schema from "../drizzle/schema";
import * as relations from "../drizzle/relations";
import {
  projects,
  tasks,
  outsources,
  outsourcePayments,
  receivables,
  credentials,
  scripts,
  worknestState,
  type InsertProjectRow,
  type InsertTaskRow,
  type InsertOutsourceRow,
  type InsertOutsourcePaymentRow,
  type InsertReceivableRow,
  type InsertCredentialRow,
  type InsertScriptRow,
} from "../drizzle/schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema & typeof relations>> | null = null;
let _supabaseClient: SupabaseClient | null = null;

// In-memory fallback cache (used when DB table is not yet migrated or during tests)
let _inMemoryState: {
  projects: unknown[];
  outsources: unknown[];
  receivables: unknown[];
  credentials: unknown[];
  scripts: unknown[];
} = {
  projects: [],
  outsources: [],
  receivables: [],
  credentials: [],
  scripts: [],
};

const fullSchema = { ...schema, ...relations };

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
      _db = drizzle(_client, { schema: fullSchema });
      console.log("[Database] Connected to Supabase Postgres via Drizzle (Relational ORM)");
    } catch (error) {
      console.warn("[Database] Failed to initialize Supabase Postgres connection:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Checks connection status to Supabase (via REST client or Postgres direct connection).
 * Verifies relational tables exist.
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
      await db.select().from(projects).limit(1);
      result.connected = true;
      result.tableExists = true;
      result.message = "Connected to Supabase Postgres via Drizzle ORM (relational tables active).";
      return result;
    } catch (err: unknown) {
      result.connected = true;
      result.tableExists = false;
      result.message = `Direct DB connected, but relational tables error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (supabase) {
    try {
      const { error } = await supabase
        .from("projects")
        .select("id")
        .limit(1);

      if (error) {
        if (error.code === "PGRST205") {
          // Relational projects table not found in schema cache yet
          // Check if legacy worknest_state exists
          const { error: legacyErr } = await supabase
            .from("worknest_state")
            .select("id")
            .limit(1);

          result.connected = true;
          result.tableExists = !legacyErr;
          result.message = legacyErr
            ? "Connected to Supabase project, but relational tables have not been created yet. Please apply the migration SQL in the Supabase SQL editor."
            : "Connected to Supabase. Legacy 'worknest_state' table found; run migration SQL to upgrade to normalized tables with joins.";
        } else {
          result.connected = true;
          result.message = `Supabase responded: ${error.message}`;
        }
      } else {
        result.connected = true;
        result.tableExists = true;
        result.message = "Connected to Supabase successfully via PostgREST API (relational tables verified).";
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
 * Normalizes an array of projects with tasks.
 */
function assembleProjects(
  projectRows: Array<Record<string, unknown>>,
  taskRows?: Array<Record<string, unknown>>
) {
  const tasksByProject = new Map<string, Array<{ id: string; label: string; done: boolean }>>();

  if (taskRows) {
    for (const t of taskRows) {
      const pId = String(t.projectId || "");
      if (!pId) continue;
      const list = tasksByProject.get(pId) || [];
      list.push({
        id: String(t.id),
        label: String(t.label || ""),
        done: Boolean(t.done),
      });
      tasksByProject.set(pId, list);
    }
  }

  return projectRows.map((p) => {
    const rawTasks = Array.isArray(p.tasks)
      ? (p.tasks as Array<{ id: string; label: string; done: boolean }>)
      : tasksByProject.get(String(p.id)) || [];

    return {
      id: String(p.id),
      name: String(p.name || ""),
      client: String(p.client || ""),
      contact: String(p.contact || ""),
      description: String(p.description || ""),
      start: String(p.start || ""),
      deadline: String(p.deadline || ""),
      status: String(p.status || "New"),
      priority: String(p.priority || "Medium"),
      amount: Number(p.amount) || 0,
      received: Number(p.received) || 0,
      outsourced: Boolean(p.outsourced),
      outsourcedTo: p.outsourcedTo ? String(p.outsourcedTo) : undefined,
      notes: String(p.notes || ""),
      tasks: rawTasks.map((t) => ({
        id: String(t.id),
        label: String(t.label || ""),
        done: Boolean(t.done),
      })),
    };
  });
}

/**
 * Normalizes outsources with payments.
 */
function assembleOutsources(
  outsourceRows: Array<Record<string, unknown>>,
  paymentRows?: Array<Record<string, unknown>>
) {
  const paymentsByOutsource = new Map<
    string,
    Array<{ id: string; amount: number; date: string; note?: string }>
  >();

  if (paymentRows) {
    for (const pm of paymentRows) {
      const oId = String(pm.outsourceId || "");
      if (!oId) continue;
      const list = paymentsByOutsource.get(oId) || [];
      list.push({
        id: String(pm.id),
        amount: Number(pm.amount) || 0,
        date: String(pm.date || ""),
        note: pm.note ? String(pm.note) : undefined,
      });
      paymentsByOutsource.set(oId, list);
    }
  }

  return outsourceRows.map((o) => {
    const embeddedPayments = Array.isArray(o.outsource_payments)
      ? (o.outsource_payments as Array<Record<string, unknown>>)
      : Array.isArray(o.payments)
      ? (o.payments as Array<Record<string, unknown>>)
      : paymentsByOutsource.get(String(o.id)) || [];

    const payments = embeddedPayments.map((pm) => ({
      id: String(pm.id),
      amount: Number(pm.amount) || 0,
      date: String(pm.date || ""),
      note: pm.note ? String(pm.note) : undefined,
    }));

    return {
      id: String(o.id),
      projectId: String(o.projectId || ""),
      provider: String(o.provider || ""),
      contact: String(o.contact || ""),
      description: String(o.description || ""),
      cost: Number(o.cost) || 0,
      paid: Number(o.paid) || 0,
      deadline: o.deadline ? String(o.deadline) : undefined,
      status: String(o.status || "Not Started"),
      notes: String(o.notes || ""),
      payDate: o.payDate ? String(o.payDate) : undefined,
      paidAt: o.paidAt ? String(o.paidAt) : undefined,
      payments,
    };
  });
}

/**
 * Normalizes receivables.
 */
function assembleReceivables(receivableRows: Array<Record<string, unknown>>) {
  return receivableRows.map((r) => ({
    id: String(r.id),
    projectId: String(r.projectId || ""),
    received: Number(r.received) || 0,
    dueDate: String(r.dueDate || ""),
    status: String(r.status || "Unpaid"),
    notes: String(r.notes || ""),
  }));
}

/**
 * Normalizes credentials.
 */
function assembleCredentials(credentialRows: Array<Record<string, unknown>>) {
  return credentialRows.map((c) => ({
    id: String(c.id),
    service: String(c.service || ""),
    projectId: String(c.projectId || ""),
    username: String(c.username || ""),
    password: String(c.password || ""),
    url: String(c.url || ""),
    notes: String(c.notes || ""),
  }));
}

/**
 * Normalizes scripts.
 */
function assembleScripts(scriptRows: Array<Record<string, unknown>>) {
  return scriptRows.map((s) => ({
    id: String(s.id),
    name: String(s.name || ""),
    category: String(s.category || ""),
    description: String(s.description || ""),
    code: String(s.code || ""),
    tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
    projectId: String(s.projectId || ""),
    notes: String(s.notes || ""),
  }));
}

/**
 * Loads the current Worknest workspace state by performing relational joins across tables.
 * Falls back gracefully to in-memory state or legacy table if migration has not run yet.
 */
export async function getWorkspaceState() {
  const db = getDb();
  if (db) {
    try {
      // Query normalized tables using Drizzle relational joins
      const [projectRows, outsourceRows, receivableRows, credentialRows, scriptRows] =
        await Promise.all([
          db.query.projects.findMany({
            with: {
              tasks: {
                orderBy: (t, { asc }) => [asc(t.position), asc(t.createdAt)],
              },
            },
          }),
          db.query.outsources.findMany({
            with: {
              payments: true,
            },
          }),
          db.query.receivables.findMany(),
          db.query.credentials.findMany(),
          db.query.scripts.findMany(),
        ]);

      const state = {
        projects: assembleProjects(projectRows as unknown as Array<Record<string, unknown>>),
        outsources: assembleOutsources(outsourceRows as unknown as Array<Record<string, unknown>>),
        receivables: assembleReceivables(receivableRows as unknown as Array<Record<string, unknown>>),
        credentials: assembleCredentials(credentialRows as unknown as Array<Record<string, unknown>>),
        scripts: assembleScripts(scriptRows as unknown as Array<Record<string, unknown>>),
      };

      _inMemoryState = state;
      return state;
    } catch (error) {
      console.warn("[Database] Drizzle relational query notice:", error);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // PostgREST embedded joins: projects with tasks, outsources with payments
      const [pRes, oRes, rRes, cRes, sRes] = await Promise.all([
        supabase.from("projects").select("*, tasks(*)").order("createdAt", { ascending: true }),
        supabase.from("outsources").select("*, outsource_payments(*)").order("createdAt", { ascending: true }),
        supabase.from("receivables").select("*").order("createdAt", { ascending: true }),
        supabase.from("credentials").select("*").order("createdAt", { ascending: true }),
        supabase.from("scripts").select("*").order("createdAt", { ascending: true }),
      ]);

      if (!pRes.error && !oRes.error && !rRes.error && !cRes.error && !sRes.error) {
        const state = {
          projects: assembleProjects(pRes.data || []),
          outsources: assembleOutsources(oRes.data || []),
          receivables: assembleReceivables(rRes.data || []),
          credentials: assembleCredentials(cRes.data || []),
          scripts: assembleScripts(sRes.data || []),
        };
        _inMemoryState = state;
        return state;
      }

      // If normalized tables don't exist yet (PGRST205), try legacy worknest_state
      if (pRes.error?.code === "PGRST205") {
        const { data: legacyData, error: legacyErr } = await supabase
          .from("worknest_state")
          .select("data")
          .eq("id", "default")
          .maybeSingle();

        if (!legacyErr && legacyData?.data) {
          _inMemoryState = legacyData.data as typeof _inMemoryState;
          return legacyData.data;
        }
      }
    } catch (error) {
      console.warn("[Database] Supabase relational query notice:", error);
    }
  }

  return _inMemoryState;
}

/**
 * Retrieves projects with all linked relational details via SQL joins.
 */
export async function getProjectsWithDetails() {
  const db = getDb();
  if (db) {
    try {
      return await db.query.projects.findMany({
        with: {
          tasks: true,
          outsources: {
            with: {
              payments: true,
            },
          },
          receivables: true,
          credentials: true,
          scripts: true,
        },
      });
    } catch (err) {
      console.warn("[Database] Drizzle getProjectsWithDetails error:", err);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "*, tasks(*), outsources(*, outsource_payments(*)), receivables(*), credentials(*), scripts(*)"
        )
        .order("createdAt", { ascending: true });

      if (!error && data) return data;
    } catch (err) {
      console.warn("[Database] Supabase getProjectsWithDetails error:", err);
    }
  }

  const state = await getWorkspaceState();
  return state.projects;
}

/**
 * Retrieves a single project by ID with all linked child entities joined.
 */
export async function getProjectById(projectId: string) {
  const db = getDb();
  if (db) {
    try {
      return await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        with: {
          tasks: true,
          outsources: {
            with: {
              payments: true,
            },
          },
          receivables: true,
          credentials: true,
          scripts: true,
        },
      });
    } catch (err) {
      console.warn("[Database] Drizzle getProjectById error:", err);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select(
          "*, tasks(*), outsources(*, outsource_payments(*)), receivables(*), credentials(*), scripts(*)"
        )
        .eq("id", projectId)
        .maybeSingle();

      if (!error && data) return data;
    } catch (err) {
      console.warn("[Database] Supabase getProjectById error:", err);
    }
  }

  const state = await getWorkspaceState();
  return (state.projects as Array<{ id: string }>).find((p) => p.id === projectId) ?? null;
}

/**
 * Persists workspace entities into individual normalized tables as separate rows.
 */
export async function saveWorkspaceState(raw: unknown): Promise<{ success: boolean; mode: string }> {
  const data = (raw && typeof raw === "object" ? raw : {}) as {
    projects?: Array<Record<string, unknown>>;
    outsources?: Array<Record<string, unknown>>;
    receivables?: Array<Record<string, unknown>>;
    credentials?: Array<Record<string, unknown>>;
    scripts?: Array<Record<string, unknown>>;
  };

  const incomingProjects = Array.isArray(data.projects) ? data.projects : [];
  const incomingOutsources = Array.isArray(data.outsources) ? data.outsources : [];
  const incomingReceivables = Array.isArray(data.receivables) ? data.receivables : [];
  const incomingCredentials = Array.isArray(data.credentials) ? data.credentials : [];
  const incomingScripts = Array.isArray(data.scripts) ? data.scripts : [];

  _inMemoryState = {
    projects: incomingProjects,
    outsources: incomingOutsources,
    receivables: incomingReceivables,
    credentials: incomingCredentials,
    scripts: incomingScripts,
  };

  let savedToDb = false;
  let mode = "in-memory";

  // 1. Try persisting via Drizzle ORM
  const db = getDb();
  if (db) {
    try {
      // Upsert projects
      if (incomingProjects.length > 0) {
        const projectRows: InsertProjectRow[] = incomingProjects.map((p) => ({
          id: String(p.id),
          name: String(p.name || "Untitled Project"),
          client: String(p.client || ""),
          contact: String(p.contact || ""),
          description: String(p.description || ""),
          start: String(p.start || ""),
          deadline: String(p.deadline || ""),
          status: String(p.status || "New"),
          priority: String(p.priority || "Medium"),
          amount: Number(p.amount) || 0,
          received: Number(p.received) || 0,
          outsourced: Boolean(p.outsourced),
          outsourcedTo: p.outsourcedTo ? String(p.outsourcedTo) : null,
          notes: String(p.notes || ""),
          updatedAt: new Date(),
        }));

        for (const row of projectRows) {
          await db
            .insert(projects)
            .values(row)
            .onConflictDoUpdate({
              target: projects.id,
              set: {
                name: row.name,
                client: row.client,
                contact: row.contact,
                description: row.description,
                start: row.start,
                deadline: row.deadline,
                status: row.status,
                priority: row.priority,
                amount: row.amount,
                received: row.received,
                outsourced: row.outsourced,
                outsourcedTo: row.outsourcedTo,
                notes: row.notes,
                updatedAt: new Date(),
              },
            });
        }

        // Upsert tasks
        for (const p of incomingProjects) {
          const pId = String(p.id);
          const pTasks = Array.isArray(p.tasks) ? (p.tasks as Array<Record<string, unknown>>) : [];
          for (let i = 0; i < pTasks.length; i++) {
            const t = pTasks[i];
            const taskRow: InsertTaskRow = {
              id: String(t.id),
              projectId: pId,
              label: String(t.label || ""),
              done: Boolean(t.done),
              position: i,
              updatedAt: new Date(),
            };
            await db
              .insert(tasks)
              .values(taskRow)
              .onConflictDoUpdate({
                target: tasks.id,
                set: {
                  label: taskRow.label,
                  done: taskRow.done,
                  position: taskRow.position,
                  updatedAt: new Date(),
                },
              });
          }
        }
      }

      // Upsert outsources
      if (incomingOutsources.length > 0) {
        for (const o of incomingOutsources) {
          const oRow: InsertOutsourceRow = {
            id: String(o.id),
            projectId: o.projectId ? String(o.projectId) : null,
            provider: String(o.provider || ""),
            contact: String(o.contact || ""),
            description: String(o.description || ""),
            cost: Number(o.cost) || 0,
            paid: Number(o.paid) || 0,
            deadline: o.deadline ? String(o.deadline) : null,
            status: String(o.status || "Not Started"),
            notes: String(o.notes || ""),
            payDate: o.payDate ? String(o.payDate) : null,
            paidAt: o.paidAt ? String(o.paidAt) : null,
            updatedAt: new Date(),
          };
          await db
            .insert(outsources)
            .values(oRow)
            .onConflictDoUpdate({
              target: outsources.id,
              set: {
                projectId: oRow.projectId,
                provider: oRow.provider,
                contact: oRow.contact,
                description: oRow.description,
                cost: oRow.cost,
                paid: oRow.paid,
                deadline: oRow.deadline,
                status: oRow.status,
                notes: oRow.notes,
                payDate: oRow.payDate,
                paidAt: oRow.paidAt,
                updatedAt: new Date(),
              },
            });

          const pms = Array.isArray(o.payments) ? (o.payments as Array<Record<string, unknown>>) : [];
          for (const pm of pms) {
            const pmRow: InsertOutsourcePaymentRow = {
              id: String(pm.id),
              outsourceId: String(o.id),
              amount: Number(pm.amount) || 0,
              date: String(pm.date || ""),
              note: pm.note ? String(pm.note) : "",
            };
            await db
              .insert(outsourcePayments)
              .values(pmRow)
              .onConflictDoUpdate({
                target: outsourcePayments.id,
                set: {
                  amount: pmRow.amount,
                  date: pmRow.date,
                  note: pmRow.note,
                },
              });
          }
        }
      }

      // Upsert receivables
      if (incomingReceivables.length > 0) {
        for (const r of incomingReceivables) {
          const rRow: InsertReceivableRow = {
            id: String(r.id),
            projectId: r.projectId ? String(r.projectId) : null,
            received: Number(r.received) || 0,
            dueDate: String(r.dueDate || ""),
            status: String(r.status || "Unpaid"),
            notes: String(r.notes || ""),
            updatedAt: new Date(),
          };
          await db
            .insert(receivables)
            .values(rRow)
            .onConflictDoUpdate({
              target: receivables.id,
              set: {
                projectId: rRow.projectId,
                received: rRow.received,
                dueDate: rRow.dueDate,
                status: rRow.status,
                notes: rRow.notes,
                updatedAt: new Date(),
              },
            });
        }
      }

      // Upsert credentials
      if (incomingCredentials.length > 0) {
        for (const c of incomingCredentials) {
          const cRow: InsertCredentialRow = {
            id: String(c.id),
            service: String(c.service || ""),
            projectId: c.projectId ? String(c.projectId) : null,
            username: String(c.username || ""),
            password: String(c.password || ""),
            url: String(c.url || ""),
            notes: String(c.notes || ""),
            updatedAt: new Date(),
          };
          await db
            .insert(credentials)
            .values(cRow)
            .onConflictDoUpdate({
              target: credentials.id,
              set: {
                service: cRow.service,
                projectId: cRow.projectId,
                username: cRow.username,
                password: cRow.password,
                url: cRow.url,
                notes: cRow.notes,
                updatedAt: new Date(),
              },
            });
        }
      }

      // Upsert scripts
      if (incomingScripts.length > 0) {
        for (const s of incomingScripts) {
          const sRow: InsertScriptRow = {
            id: String(s.id),
            name: String(s.name || ""),
            category: String(s.category || ""),
            description: String(s.description || ""),
            code: String(s.code || ""),
            tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
            projectId: s.projectId ? String(s.projectId) : null,
            notes: String(s.notes || ""),
            updatedAt: new Date(),
          };
          await db
            .insert(scripts)
            .values(sRow)
            .onConflictDoUpdate({
              target: scripts.id,
              set: {
                name: sRow.name,
                category: sRow.category,
                description: sRow.description,
                code: sRow.code,
                tags: sRow.tags,
                projectId: sRow.projectId,
                notes: sRow.notes,
                updatedAt: new Date(),
              },
            });
        }
      }

      savedToDb = true;
      mode = "drizzle";
    } catch (error) {
      console.warn("[Database] Failed to persist via Drizzle:", error);
    }
  }

  // 2. Try persisting via Supabase JS client
  const supabase = getSupabaseClient();
  if (supabase && !savedToDb) {
    try {
      // Upsert projects
      if (incomingProjects.length > 0) {
        const projectRows = incomingProjects.map((p) => ({
          id: String(p.id),
          name: String(p.name || "Untitled Project"),
          client: String(p.client || ""),
          contact: String(p.contact || ""),
          description: String(p.description || ""),
          start: String(p.start || ""),
          deadline: String(p.deadline || ""),
          status: String(p.status || "New"),
          priority: String(p.priority || "Medium"),
          amount: Number(p.amount) || 0,
          received: Number(p.received) || 0,
          outsourced: Boolean(p.outsourced),
          outsourcedTo: p.outsourcedTo ? String(p.outsourcedTo) : null,
          notes: String(p.notes || ""),
          updatedAt: new Date().toISOString(),
        }));

        const { error: pErr } = await supabase
          .from("projects")
          .upsert(projectRows, { onConflict: "id" });

        if (pErr) {
          if (pErr.code === "PGRST205") {
            // Relational tables not yet applied, fallback to legacy worknest_state
            const { error: legacyErr } = await supabase.from("worknest_state").upsert(
              {
                id: "default",
                data: _inMemoryState,
                updatedAt: new Date().toISOString(),
              },
              { onConflict: "id" }
            );
            if (!legacyErr) {
              return { success: true, mode: "supabase-legacy" };
            }
          }
          console.warn("[Database] Supabase projects upsert error:", pErr.message);
        } else {
          // Upsert tasks
          const allTasks: Array<Record<string, unknown>> = [];
          for (const p of incomingProjects) {
            const pId = String(p.id);
            const pTasks = Array.isArray(p.tasks) ? (p.tasks as Array<Record<string, unknown>>) : [];
            for (let i = 0; i < pTasks.length; i++) {
              allTasks.push({
                id: String(pTasks[i].id),
                projectId: pId,
                label: String(pTasks[i].label || ""),
                done: Boolean(pTasks[i].done),
                position: i,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          if (allTasks.length > 0) {
            await supabase.from("tasks").upsert(allTasks, { onConflict: "id" });
          }
        }
      }

      // Upsert outsources & payments
      if (incomingOutsources.length > 0) {
        const outsourceRows = incomingOutsources.map((o) => ({
          id: String(o.id),
          projectId: o.projectId ? String(o.projectId) : null,
          provider: String(o.provider || ""),
          contact: String(o.contact || ""),
          description: String(o.description || ""),
          cost: Number(o.cost) || 0,
          paid: Number(o.paid) || 0,
          deadline: o.deadline ? String(o.deadline) : null,
          status: String(o.status || "Not Started"),
          notes: String(o.notes || ""),
          payDate: o.payDate ? String(o.payDate) : null,
          paidAt: o.paidAt ? String(o.paidAt) : null,
          updatedAt: new Date().toISOString(),
        }));

        await supabase.from("outsources").upsert(outsourceRows, { onConflict: "id" });

        const allPayments: Array<Record<string, unknown>> = [];
        for (const o of incomingOutsources) {
          const oId = String(o.id);
          const pms = Array.isArray(o.payments) ? (o.payments as Array<Record<string, unknown>>) : [];
          for (const pm of pms) {
            allPayments.push({
              id: String(pm.id),
              outsourceId: oId,
              amount: Number(pm.amount) || 0,
              date: String(pm.date || ""),
              note: pm.note ? String(pm.note) : "",
            });
          }
        }
        if (allPayments.length > 0) {
          await supabase.from("outsource_payments").upsert(allPayments, { onConflict: "id" });
        }
      }

      // Upsert receivables
      if (incomingReceivables.length > 0) {
        const receivableRows = incomingReceivables.map((r) => ({
          id: String(r.id),
          projectId: r.projectId ? String(r.projectId) : null,
          received: Number(r.received) || 0,
          dueDate: String(r.dueDate || ""),
          status: String(r.status || "Unpaid"),
          notes: String(r.notes || ""),
          updatedAt: new Date().toISOString(),
        }));
        await supabase.from("receivables").upsert(receivableRows, { onConflict: "id" });
      }

      // Upsert credentials
      if (incomingCredentials.length > 0) {
        const credentialRows = incomingCredentials.map((c) => ({
          id: String(c.id),
          service: String(c.service || ""),
          projectId: c.projectId ? String(c.projectId) : null,
          username: String(c.username || ""),
          password: String(c.password || ""),
          url: String(c.url || ""),
          notes: String(c.notes || ""),
          updatedAt: new Date().toISOString(),
        }));
        await supabase.from("credentials").upsert(credentialRows, { onConflict: "id" });
      }

      // Upsert scripts
      if (incomingScripts.length > 0) {
        const scriptRows = incomingScripts.map((s) => ({
          id: String(s.id),
          name: String(s.name || ""),
          category: String(s.category || ""),
          description: String(s.description || ""),
          code: String(s.code || ""),
          tags: Array.isArray(s.tags) ? (s.tags as string[]) : [],
          projectId: s.projectId ? String(s.projectId) : null,
          notes: String(s.notes || ""),
          updatedAt: new Date().toISOString(),
        }));
        await supabase.from("scripts").upsert(scriptRows, { onConflict: "id" });
      }

      savedToDb = true;
      mode = "supabase-js";
    } catch (error) {
      console.warn("[Database] Supabase persist error:", error);
    }
  }

  return { success: true, mode };
}
