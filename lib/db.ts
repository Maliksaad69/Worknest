import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
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
import type {
  Project,
  Task,
  Outsource,
  OutsourcePayment,
  Receivable,
  Credential,
  Script,
  Store,
  ProjectStatus,
  Priority,
  OutsourceStatus,
  ReceivableStatus,
} from "../shared/types";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema & typeof relations>> | null = null;
let _supabaseClient: SupabaseClient | null = null;
let _hasRelationalTables: boolean | null = null;

const uid = () => Math.random().toString(36).slice(2, 10);

// In-memory fallback cache (used when DB table is not yet migrated or during tests)
let _inMemoryState: Store = {
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
          _hasRelationalTables = false;
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
        _hasRelationalTables = true;
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
): Project[] {
  const tasksByProject = new Map<string, Array<{ id: string; label: string; done: boolean; position?: number }>>();

  if (taskRows) {
    for (const t of taskRows) {
      const pId = String(t.projectId || "");
      if (!pId) continue;
      const list = tasksByProject.get(pId) || [];
      list.push({
        id: String(t.id),
        label: String(t.label || ""),
        done: Boolean(t.done),
        position: typeof t.position === "number" ? t.position : undefined,
      });
      tasksByProject.set(pId, list);
    }
  }

  return projectRows.map((p) => {
    const rawTasks = Array.isArray(p.tasks)
      ? (p.tasks as Array<{ id: string; label: string; done: boolean; position?: number }>)
      : tasksByProject.get(String(p.id)) || [];

    return {
      id: String(p.id),
      name: String(p.name || ""),
      client: String(p.client || ""),
      contact: String(p.contact || ""),
      description: String(p.description || ""),
      start: String(p.start || ""),
      deadline: String(p.deadline || ""),
      status: (String(p.status || "New")) as ProjectStatus,
      priority: (String(p.priority || "Medium")) as Priority,
      amount: Number(p.amount) || 0,
      received: Number(p.received) || 0,
      outsourced: Boolean(p.outsourced),
      outsourcedTo: p.outsourcedTo ? String(p.outsourcedTo) : undefined,
      notes: String(p.notes || ""),
      tasks: rawTasks.map((t) => ({
        id: String(t.id),
        label: String(t.label || ""),
        done: Boolean(t.done),
        position: typeof t.position === "number" ? t.position : undefined,
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
): Outsource[] {
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
      status: (String(o.status || "Not Started")) as OutsourceStatus,
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
function assembleReceivables(receivableRows: Array<Record<string, unknown>>): Receivable[] {
  return receivableRows.map((r) => ({
    id: String(r.id),
    projectId: String(r.projectId || ""),
    received: Number(r.received) || 0,
    dueDate: String(r.dueDate || ""),
    status: (String(r.status || "Unpaid")) as ReceivableStatus,
    notes: String(r.notes || ""),
  }));
}

/**
 * Normalizes credentials.
 */
function assembleCredentials(credentialRows: Array<Record<string, unknown>>): Credential[] {
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
function assembleScripts(scriptRows: Array<Record<string, unknown>>): Script[] {
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
export async function getWorkspaceState(): Promise<Store> {
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

      const state: Store = {
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
      if (_hasRelationalTables === false) {
        const { data: legacyData, error: legacyErr } = await supabase
          .from("worknest_state")
          .select("data")
          .eq("id", "default")
          .maybeSingle();

        if (!legacyErr && legacyData?.data) {
          _inMemoryState = legacyData.data as Store;
          return legacyData.data as Store;
        }
        return _inMemoryState;
      }

      // PostgREST embedded joins: projects with tasks, outsources with payments
      const [pRes, oRes, rRes, cRes, sRes] = await Promise.all([
        supabase.from("projects").select("*, tasks(*)").order("createdAt", { ascending: true }),
        supabase.from("outsources").select("*, outsource_payments(*)").order("createdAt", { ascending: true }),
        supabase.from("receivables").select("*").order("createdAt", { ascending: true }),
        supabase.from("credentials").select("*").order("createdAt", { ascending: true }),
        supabase.from("scripts").select("*").order("createdAt", { ascending: true }),
      ]);

      if (!pRes.error && !oRes.error && !rRes.error && !cRes.error && !sRes.error) {
        _hasRelationalTables = true;
        const state: Store = {
          projects: assembleProjects(pRes.data || []),
          outsources: assembleOutsources(oRes.data || []),
          receivables: assembleReceivables(rRes.data || []),
          credentials: assembleCredentials(cRes.data || []),
          scripts: assembleScripts(sRes.data || []),
        };
        _inMemoryState = state;
        return state;
      }

      if (pRes.error?.code === "PGRST205") {
        _hasRelationalTables = false;
        const { data: legacyData, error: legacyErr } = await supabase
          .from("worknest_state")
          .select("data")
          .eq("id", "default")
          .maybeSingle();

        if (!legacyErr && legacyData?.data) {
          _inMemoryState = legacyData.data as Store;
          return legacyData.data as Store;
        }
      }
    } catch (error) {
      console.warn("[Database] Supabase relational query notice:", error);
    }
  }

  return _inMemoryState;
}

/**
 * Persists workspace entities into individual normalized tables with full deletion sync.
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

  const assembledState: Store = {
    projects: assembleProjects(incomingProjects),
    outsources: assembleOutsources(incomingOutsources),
    receivables: assembleReceivables(incomingReceivables),
    credentials: assembleCredentials(incomingCredentials),
    scripts: assembleScripts(incomingScripts),
  };

  _inMemoryState = assembledState;

  let savedToDb = false;
  let mode = "in-memory";

  const incomingProjectIds = incomingProjects.map((p) => String(p.id));
  const incomingOutsourceIds = incomingOutsources.map((o) => String(o.id));
  const incomingReceivableIds = incomingReceivables.map((r) => String(r.id));
  const incomingCredentialIds = incomingCredentials.map((c) => String(c.id));
  const incomingScriptIds = incomingScripts.map((s) => String(s.id));

  // 1. Try persisting via Drizzle ORM
  const db = getDb();
  if (db) {
    try {
      // --- Projects & Tasks ---
      if (incomingProjectIds.length > 0) {
        for (const p of incomingProjects) {
          const row: InsertProjectRow = {
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
          };

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

          const pTasks = Array.isArray(p.tasks) ? (p.tasks as Array<Record<string, unknown>>) : [];
          const taskIds = pTasks.map((t) => String(t.id));

          for (let i = 0; i < pTasks.length; i++) {
            const t = pTasks[i];
            const taskRow: InsertTaskRow = {
              id: String(t.id),
              projectId: String(p.id),
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

          if (taskIds.length > 0) {
            await db
              .delete(tasks)
              .where(and(eq(tasks.projectId, String(p.id)), notInArray(tasks.id, taskIds)));
          } else {
            await db.delete(tasks).where(eq(tasks.projectId, String(p.id)));
          }
        }

        await db.delete(projects).where(notInArray(projects.id, incomingProjectIds));
      } else {
        await db.delete(projects);
      }

      // --- Outsources & Payments ---
      if (incomingOutsourceIds.length > 0) {
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
          const pmIds = pms.map((pm) => String(pm.id));

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

          if (pmIds.length > 0) {
            await db
              .delete(outsourcePayments)
              .where(
                and(
                  eq(outsourcePayments.outsourceId, String(o.id)),
                  notInArray(outsourcePayments.id, pmIds)
                )
              );
          } else {
            await db.delete(outsourcePayments).where(eq(outsourcePayments.outsourceId, String(o.id)));
          }
        }

        await db.delete(outsources).where(notInArray(outsources.id, incomingOutsourceIds));
      } else {
        await db.delete(outsources);
      }

      // --- Receivables ---
      if (incomingReceivableIds.length > 0) {
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
        await db.delete(receivables).where(notInArray(receivables.id, incomingReceivableIds));
      } else {
        await db.delete(receivables);
      }

      // --- Credentials ---
      if (incomingCredentialIds.length > 0) {
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
        await db.delete(credentials).where(notInArray(credentials.id, incomingCredentialIds));
      } else {
        await db.delete(credentials);
      }

      // --- Scripts ---
      if (incomingScriptIds.length > 0) {
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
        await db.delete(scripts).where(notInArray(scripts.id, incomingScriptIds));
      } else {
        await db.delete(scripts);
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
      if (_hasRelationalTables === false) {
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

      if (incomingProjectIds.length > 0) {
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
            _hasRelationalTables = false;
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
          _hasRelationalTables = true;

          // Delete projects no longer in incoming
          await supabase
            .from("projects")
            .delete()
            .not("id", "in", `(${incomingProjectIds.map((id) => `"${id}"`).join(",")})`);

          // Sync tasks
          const allTasks: Array<Record<string, unknown>> = [];
          for (const p of incomingProjects) {
            const pId = String(p.id);
            const pTasks = Array.isArray(p.tasks) ? (p.tasks as Array<Record<string, unknown>>) : [];
            const taskIds = pTasks.map((t) => String(t.id));

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

            if (taskIds.length > 0) {
              await supabase
                .from("tasks")
                .delete()
                .eq("projectId", pId)
                .not("id", "in", `(${taskIds.map((id) => `"${id}"`).join(",")})`);
            } else {
              await supabase.from("tasks").delete().eq("projectId", pId);
            }
          }

          if (allTasks.length > 0) {
            await supabase.from("tasks").upsert(allTasks, { onConflict: "id" });
          }
        }
      } else {
        // incomingProjectIds is empty
        if (_hasRelationalTables !== false) {
          await supabase.from("projects").delete().neq("id", "");
        }
        await supabase.from("worknest_state").upsert(
          {
            id: "default",
            data: _inMemoryState,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      }

      // Sync outsources & payments
      if (incomingOutsourceIds.length > 0) {
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
        await supabase
          .from("outsources")
          .delete()
          .not("id", "in", `(${incomingOutsourceIds.map((id) => `"${id}"`).join(",")})`);

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
      } else {
        await supabase.from("outsources").delete().neq("id", "");
      }

      // Sync receivables
      if (incomingReceivableIds.length > 0) {
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
        await supabase
          .from("receivables")
          .delete()
          .not("id", "in", `(${incomingReceivableIds.map((id) => `"${id}"`).join(",")})`);
      } else {
        await supabase.from("receivables").delete().neq("id", "");
      }

      // Sync credentials
      if (incomingCredentialIds.length > 0) {
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
        await supabase
          .from("credentials")
          .delete()
          .not("id", "in", `(${incomingCredentialIds.map((id) => `"${id}"`).join(",")})`);
      } else {
        await supabase.from("credentials").delete().neq("id", "");
      }

      // Sync scripts
      if (incomingScriptIds.length > 0) {
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
        await supabase
          .from("scripts")
          .delete()
          .not("id", "in", `(${incomingScriptIds.map((id) => `"${id}"`).join(",")})`);
      } else {
        await supabase.from("scripts").delete().neq("id", "");
      }

      savedToDb = true;
      mode = "supabase-js";
    } catch (error) {
      console.warn("[Database] Supabase persist error:", error);
    }
  }

  return { success: true, mode };
}

// ==============================================================================
// Granular CRUD Operations for Relational Schema
// ==============================================================================

/**
 * Lists all projects.
 */
export async function listProjects(): Promise<Project[]> {
  const state = await getWorkspaceState();
  return state.projects;
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
  return state.projects.find((p) => p.id === projectId) ?? null;
}

/**
 * Creates a project record with optional tasks.
 */
export async function createProject(
  input: Omit<Partial<Project>, "tasks"> & {
    id?: string;
    name: string;
    tasks?: Array<{ id?: string; label: string; done?: boolean; position?: number }>;
  }
): Promise<Project> {
  const newId = input.id || uid();
  const newProject: Project = {
    id: newId,
    name: input.name,
    client: input.client || "",
    contact: input.contact || "",
    description: input.description || "",
    start: input.start || new Date().toISOString().slice(0, 10),
    deadline: input.deadline || new Date().toISOString().slice(0, 10),
    status: (input.status as ProjectStatus) || "New",
    priority: (input.priority as Priority) || "Medium",
    amount: Number(input.amount) || 0,
    received: Number(input.received) || 0,
    outsourced: Boolean(input.outsourced),
    outsourcedTo: input.outsourcedTo,
    notes: input.notes || "",
    tasks: Array.isArray(input.tasks)
      ? input.tasks.map((t, idx) => ({
          id: t.id || uid(),
          label: t.label,
          done: Boolean(t.done),
          position: typeof t.position === "number" ? t.position : idx,
        }))
      : [],
  };

  _inMemoryState.projects = [newProject, ..._inMemoryState.projects.filter((p) => p.id !== newId)];

  const db = getDb();
  if (db) {
    try {
      await db.insert(projects).values({
        id: newProject.id,
        name: newProject.name,
        client: newProject.client,
        contact: newProject.contact,
        description: newProject.description,
        start: newProject.start,
        deadline: newProject.deadline,
        status: newProject.status,
        priority: newProject.priority,
        amount: newProject.amount,
        received: newProject.received,
        outsourced: newProject.outsourced,
        outsourcedTo: newProject.outsourcedTo ?? null,
        notes: newProject.notes,
      });

      for (const t of newProject.tasks) {
        await db.insert(tasks).values({
          id: t.id,
          projectId: newProject.id,
          label: t.label,
          done: t.done,
          position: t.position ?? 0,
        });
      }
      return newProject;
    } catch (e) {
      console.warn("[Database] Drizzle createProject error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("projects").upsert({
          id: newProject.id,
          name: newProject.name,
          client: newProject.client,
          contact: newProject.contact,
          description: newProject.description,
          start: newProject.start,
          deadline: newProject.deadline,
          status: newProject.status,
          priority: newProject.priority,
          amount: newProject.amount,
          received: newProject.received,
          outsourced: newProject.outsourced,
          outsourcedTo: newProject.outsourcedTo ?? null,
          notes: newProject.notes,
        });

        if (newProject.tasks.length > 0) {
          await supabase.from("tasks").upsert(
            newProject.tasks.map((t) => ({
              id: t.id,
              projectId: newProject.id,
              label: t.label,
              done: t.done,
              position: t.position ?? 0,
            }))
          );
        }
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createProject error:", e);
    }
  }

  return newProject;
}

/**
 * Updates an existing project.
 */
export async function updateProject(
  projectId: string,
  update: Partial<Project>
): Promise<Project | null> {
  const idx = _inMemoryState.projects.findIndex((p) => p.id === projectId);
  if (idx !== -1) {
    _inMemoryState.projects[idx] = {
      ..._inMemoryState.projects[idx],
      ...update,
      id: projectId,
    };
  }

  const db = getDb();
  if (db) {
    try {
      const updateData: Partial<InsertProjectRow> = { updatedAt: new Date() };
      if (update.name !== undefined) updateData.name = update.name;
      if (update.client !== undefined) updateData.client = update.client;
      if (update.contact !== undefined) updateData.contact = update.contact;
      if (update.description !== undefined) updateData.description = update.description;
      if (update.start !== undefined) updateData.start = update.start;
      if (update.deadline !== undefined) updateData.deadline = update.deadline;
      if (update.status !== undefined) updateData.status = update.status;
      if (update.priority !== undefined) updateData.priority = update.priority;
      if (update.amount !== undefined) updateData.amount = update.amount;
      if (update.received !== undefined) updateData.received = update.received;
      if (update.outsourced !== undefined) updateData.outsourced = update.outsourced;
      if (update.outsourcedTo !== undefined) updateData.outsourcedTo = update.outsourcedTo ?? null;
      if (update.notes !== undefined) updateData.notes = update.notes;

      await db.update(projects).set(updateData).where(eq(projects.id, projectId));
    } catch (e) {
      console.warn("[Database] Drizzle updateProject error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (update.name !== undefined) updateData.name = update.name;
        if (update.client !== undefined) updateData.client = update.client;
        if (update.contact !== undefined) updateData.contact = update.contact;
        if (update.description !== undefined) updateData.description = update.description;
        if (update.start !== undefined) updateData.start = update.start;
        if (update.deadline !== undefined) updateData.deadline = update.deadline;
        if (update.status !== undefined) updateData.status = update.status;
        if (update.priority !== undefined) updateData.priority = update.priority;
        if (update.amount !== undefined) updateData.amount = update.amount;
        if (update.received !== undefined) updateData.received = update.received;
        if (update.outsourced !== undefined) updateData.outsourced = update.outsourced;
        if (update.outsourcedTo !== undefined) updateData.outsourcedTo = update.outsourcedTo ?? null;
        if (update.notes !== undefined) updateData.notes = update.notes;

        await supabase.from("projects").update(updateData).eq("id", projectId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateProject error:", e);
    }
  }

  return _inMemoryState.projects.find((p) => p.id === projectId) ?? null;
}

/**
 * Deletes a project by ID and cascades.
 */
export async function deleteProject(projectId: string): Promise<{ success: boolean }> {
  _inMemoryState.projects = _inMemoryState.projects.filter((p) => p.id !== projectId);
  _inMemoryState.outsources = _inMemoryState.outsources.filter((o) => o.projectId !== projectId);
  _inMemoryState.receivables = _inMemoryState.receivables.filter((r) => r.projectId !== projectId);
  _inMemoryState.credentials = _inMemoryState.credentials.filter((c) => c.projectId !== projectId);
  _inMemoryState.scripts = _inMemoryState.scripts.filter((s) => s.projectId !== projectId);

  const db = getDb();
  if (db) {
    try {
      await db.delete(projects).where(eq(projects.id, projectId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteProject error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("projects").delete().eq("id", projectId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteProject error:", e);
    }
  }

  return { success: true };
}

// --- Tasks CRUD ---

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  const p = _inMemoryState.projects.find((pr) => pr.id === projectId);
  return p?.tasks || [];
}

export async function createTask(input: {
  id?: string;
  projectId: string;
  label: string;
  done?: boolean;
  position?: number;
}): Promise<Task> {
  const newTask: Task = {
    id: input.id || uid(),
    label: input.label,
    done: Boolean(input.done),
    position: typeof input.position === "number" ? input.position : 0,
  };

  const project = _inMemoryState.projects.find((p) => p.id === input.projectId);
  if (project) {
    project.tasks.push(newTask);
  }

  const db = getDb();
  if (db) {
    try {
      await db.insert(tasks).values({
        id: newTask.id,
        projectId: input.projectId,
        label: newTask.label,
        done: newTask.done,
        position: newTask.position ?? 0,
      });
    } catch (e) {
      console.warn("[Database] Drizzle createTask error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("tasks").insert({
          id: newTask.id,
          projectId: input.projectId,
          label: newTask.label,
          done: newTask.done,
          position: newTask.position ?? 0,
        });
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createTask error:", e);
    }
  }

  return newTask;
}

export async function updateTask(
  taskId: string,
  update: { label?: string; done?: boolean; position?: number }
): Promise<Task | null> {
  let foundTask: Task | null = null;
  for (const project of _inMemoryState.projects) {
    const task = project.tasks.find((t) => t.id === taskId);
    if (task) {
      if (update.label !== undefined) task.label = update.label;
      if (update.done !== undefined) task.done = update.done;
      if (update.position !== undefined) task.position = update.position;
      foundTask = task;
      break;
    }
  }

  const db = getDb();
  if (db) {
    try {
      await db.update(tasks).set({ ...update, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    } catch (e) {
      console.warn("[Database] Drizzle updateTask error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase
          .from("tasks")
          .update({ ...update, updatedAt: new Date().toISOString() })
          .eq("id", taskId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateTask error:", e);
    }
  }

  return foundTask;
}

export async function toggleTask(taskId: string, done: boolean): Promise<Task | null> {
  return await updateTask(taskId, { done });
}

export async function deleteTask(taskId: string): Promise<{ success: boolean }> {
  for (const project of _inMemoryState.projects) {
    const idx = project.tasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      project.tasks.splice(idx, 1);
      break;
    }
  }

  const db = getDb();
  if (db) {
    try {
      await db.delete(tasks).where(eq(tasks.id, taskId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteTask error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("tasks").delete().eq("id", taskId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteTask error:", e);
    }
  }

  return { success: true };
}

// --- Outsources CRUD ---

export async function listOutsources(): Promise<Outsource[]> {
  const state = await getWorkspaceState();
  return state.outsources;
}

export async function getOutsourceById(outsourceId: string): Promise<Outsource | null> {
  const state = await getWorkspaceState();
  return state.outsources.find((o) => o.id === outsourceId) ?? null;
}

export async function createOutsource(input: {
  id?: string;
  projectId: string;
  provider: string;
  contact?: string;
  description?: string;
  cost?: number;
  paid?: number;
  deadline?: string;
  status?: string;
  notes?: string;
  payDate?: string;
  paidAt?: string;
  payments?: Array<{ id?: string; amount: number; date: string; note?: string }>;
}): Promise<Outsource> {
  const newId = input.id || uid();
  const payments: OutsourcePayment[] = Array.isArray(input.payments)
    ? input.payments.map((p) => ({
        id: p.id || uid(),
        amount: Number(p.amount) || 0,
        date: p.date,
        note: p.note,
      }))
    : [];

  const newOutsource: Outsource = {
    id: newId,
    projectId: input.projectId,
    provider: input.provider,
    contact: input.contact || "",
    description: input.description || "",
    cost: Number(input.cost) || 0,
    paid: Number(input.paid) || 0,
    deadline: input.deadline,
    status: (input.status as OutsourceStatus) || "Not Started",
    notes: input.notes || "",
    payDate: input.payDate,
    paidAt: input.paidAt,
    payments,
  };

  _inMemoryState.outsources = [newOutsource, ..._inMemoryState.outsources.filter((o) => o.id !== newId)];

  if (input.projectId) {
    const project = _inMemoryState.projects.find((p) => p.id === input.projectId);
    if (project) {
      project.outsourced = true;
      project.outsourcedTo = input.provider;
    }
  }

  const db = getDb();
  if (db) {
    try {
      await db.insert(outsources).values({
        id: newOutsource.id,
        projectId: newOutsource.projectId,
        provider: newOutsource.provider,
        contact: newOutsource.contact,
        description: newOutsource.description,
        cost: newOutsource.cost,
        paid: newOutsource.paid,
        deadline: newOutsource.deadline ?? null,
        status: newOutsource.status,
        notes: newOutsource.notes,
        payDate: newOutsource.payDate ?? null,
        paidAt: newOutsource.paidAt ?? null,
      });

      for (const pm of payments) {
        await db.insert(outsourcePayments).values({
          id: pm.id,
          outsourceId: newOutsource.id,
          amount: pm.amount,
          date: pm.date,
          note: pm.note ?? null,
        });
      }
      return newOutsource;
    } catch (e) {
      console.warn("[Database] Drizzle createOutsource error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("outsources").insert({
          id: newOutsource.id,
          projectId: newOutsource.projectId,
          provider: newOutsource.provider,
          contact: newOutsource.contact,
          description: newOutsource.description,
          cost: newOutsource.cost,
          paid: newOutsource.paid,
          deadline: newOutsource.deadline ?? null,
          status: newOutsource.status,
          notes: newOutsource.notes,
          payDate: newOutsource.payDate ?? null,
          paidAt: newOutsource.paidAt ?? null,
        });

        if (payments.length > 0) {
          await supabase.from("outsource_payments").insert(
            payments.map((pm) => ({
              id: pm.id,
              outsourceId: newOutsource.id,
              amount: pm.amount,
              date: pm.date,
              note: pm.note ?? null,
            }))
          );
        }
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createOutsource error:", e);
    }
  }

  return newOutsource;
}

export async function updateOutsource(
  outsourceId: string,
  update: Partial<Outsource>
): Promise<Outsource | null> {
  const idx = _inMemoryState.outsources.findIndex((o) => o.id === outsourceId);
  if (idx !== -1) {
    _inMemoryState.outsources[idx] = {
      ..._inMemoryState.outsources[idx],
      ...update,
      id: outsourceId,
    };
  }

  const db = getDb();
  if (db) {
    try {
      const updateData: Partial<InsertOutsourceRow> = { updatedAt: new Date() };
      if (update.provider !== undefined) updateData.provider = update.provider;
      if (update.contact !== undefined) updateData.contact = update.contact;
      if (update.description !== undefined) updateData.description = update.description;
      if (update.cost !== undefined) updateData.cost = update.cost;
      if (update.paid !== undefined) updateData.paid = update.paid;
      if (update.deadline !== undefined) updateData.deadline = update.deadline ?? null;
      if (update.status !== undefined) updateData.status = update.status;
      if (update.notes !== undefined) updateData.notes = update.notes;
      if (update.payDate !== undefined) updateData.payDate = update.payDate ?? null;
      if (update.paidAt !== undefined) updateData.paidAt = update.paidAt ?? null;

      await db.update(outsources).set(updateData).where(eq(outsources.id, outsourceId));
    } catch (e) {
      console.warn("[Database] Drizzle updateOutsource error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (update.provider !== undefined) updateData.provider = update.provider;
        if (update.contact !== undefined) updateData.contact = update.contact;
        if (update.description !== undefined) updateData.description = update.description;
        if (update.cost !== undefined) updateData.cost = update.cost;
        if (update.paid !== undefined) updateData.paid = update.paid;
        if (update.deadline !== undefined) updateData.deadline = update.deadline ?? null;
        if (update.status !== undefined) updateData.status = update.status;
        if (update.notes !== undefined) updateData.notes = update.notes;
        if (update.payDate !== undefined) updateData.payDate = update.payDate ?? null;
        if (update.paidAt !== undefined) updateData.paidAt = update.paidAt ?? null;

        await supabase.from("outsources").update(updateData).eq("id", outsourceId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateOutsource error:", e);
    }
  }

  return _inMemoryState.outsources.find((o) => o.id === outsourceId) ?? null;
}

export async function deleteOutsource(outsourceId: string): Promise<{ success: boolean }> {
  _inMemoryState.outsources = _inMemoryState.outsources.filter((o) => o.id !== outsourceId);

  const db = getDb();
  if (db) {
    try {
      await db.delete(outsources).where(eq(outsources.id, outsourceId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteOutsource error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("outsources").delete().eq("id", outsourceId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteOutsource error:", e);
    }
  }

  return { success: true };
}

export async function addOutsourcePayment(input: {
  id?: string;
  outsourceId: string;
  amount: number;
  date?: string;
  note?: string;
}): Promise<OutsourcePayment> {
  const payment: OutsourcePayment = {
    id: input.id || uid(),
    amount: Number(input.amount) || 0,
    date: input.date || new Date().toISOString().slice(0, 10),
    note: input.note,
  };

  const outsource = _inMemoryState.outsources.find((o) => o.id === input.outsourceId);
  if (outsource) {
    if (!outsource.payments) outsource.payments = [];
    outsource.payments.push(payment);
    outsource.paid = (outsource.paid || 0) + payment.amount;
    if (outsource.paid >= outsource.cost && outsource.cost > 0) {
      outsource.status = "Completed";
      outsource.paidAt = payment.date;
    }
  }

  const db = getDb();
  if (db) {
    try {
      await db.insert(outsourcePayments).values({
        id: payment.id,
        outsourceId: input.outsourceId,
        amount: payment.amount,
        date: payment.date,
        note: payment.note ?? null,
      });

      if (outsource) {
        await db
          .update(outsources)
          .set({ paid: outsource.paid, status: outsource.status, paidAt: outsource.paidAt ?? null })
          .where(eq(outsources.id, input.outsourceId));
      }
    } catch (e) {
      console.warn("[Database] Drizzle addOutsourcePayment error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("outsource_payments").insert({
          id: payment.id,
          outsourceId: input.outsourceId,
          amount: payment.amount,
          date: payment.date,
          note: payment.note ?? null,
        });

        if (outsource) {
          await supabase
            .from("outsources")
            .update({ paid: outsource.paid, status: outsource.status, paidAt: outsource.paidAt ?? null })
            .eq("id", input.outsourceId);
        }
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase addOutsourcePayment error:", e);
    }
  }

  return payment;
}

export async function deleteOutsourcePayment(paymentId: string): Promise<{ success: boolean }> {
  for (const o of _inMemoryState.outsources) {
    if (o.payments) {
      const idx = o.payments.findIndex((p) => p.id === paymentId);
      if (idx !== -1) {
        const removed = o.payments.splice(idx, 1)[0];
        o.paid = Math.max(0, (o.paid || 0) - removed.amount);
        break;
      }
    }
  }

  const db = getDb();
  if (db) {
    try {
      await db.delete(outsourcePayments).where(eq(outsourcePayments.id, paymentId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteOutsourcePayment error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("outsource_payments").delete().eq("id", paymentId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteOutsourcePayment error:", e);
    }
  }

  return { success: true };
}

// --- Receivables CRUD ---

export async function listReceivables(): Promise<Receivable[]> {
  const state = await getWorkspaceState();
  return state.receivables;
}

export async function getReceivableById(receivableId: string): Promise<Receivable | null> {
  const state = await getWorkspaceState();
  return state.receivables.find((r) => r.id === receivableId) ?? null;
}

export async function createReceivable(input: {
  id?: string;
  projectId: string;
  received?: number;
  dueDate?: string;
  status?: string;
  notes?: string;
}): Promise<Receivable> {
  const newId = input.id || uid();
  const newReceivable: Receivable = {
    id: newId,
    projectId: input.projectId,
    received: Number(input.received) || 0,
    dueDate: input.dueDate || new Date().toISOString().slice(0, 10),
    status: (input.status as ReceivableStatus) || "Unpaid",
    notes: input.notes || "",
  };

  _inMemoryState.receivables = [
    newReceivable,
    ..._inMemoryState.receivables.filter((r) => r.id !== newId),
  ];

  const db = getDb();
  if (db) {
    try {
      await db.insert(receivables).values({
        id: newReceivable.id,
        projectId: newReceivable.projectId,
        received: newReceivable.received,
        dueDate: newReceivable.dueDate,
        status: newReceivable.status,
        notes: newReceivable.notes,
      });
      return newReceivable;
    } catch (e) {
      console.warn("[Database] Drizzle createReceivable error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("receivables").insert({
          id: newReceivable.id,
          projectId: newReceivable.projectId,
          received: newReceivable.received,
          dueDate: newReceivable.dueDate,
          status: newReceivable.status,
          notes: newReceivable.notes,
        });
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createReceivable error:", e);
    }
  }

  return newReceivable;
}

export async function updateReceivable(
  receivableId: string,
  update: Partial<Receivable>
): Promise<Receivable | null> {
  const idx = _inMemoryState.receivables.findIndex((r) => r.id === receivableId);
  if (idx !== -1) {
    _inMemoryState.receivables[idx] = {
      ..._inMemoryState.receivables[idx],
      ...update,
      id: receivableId,
    };
  }

  const db = getDb();
  if (db) {
    try {
      const updateData: Partial<InsertReceivableRow> = { updatedAt: new Date() };
      if (update.received !== undefined) updateData.received = update.received;
      if (update.dueDate !== undefined) updateData.dueDate = update.dueDate;
      if (update.status !== undefined) updateData.status = update.status;
      if (update.notes !== undefined) updateData.notes = update.notes;

      await db.update(receivables).set(updateData).where(eq(receivables.id, receivableId));
    } catch (e) {
      console.warn("[Database] Drizzle updateReceivable error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (update.received !== undefined) updateData.received = update.received;
        if (update.dueDate !== undefined) updateData.dueDate = update.dueDate;
        if (update.status !== undefined) updateData.status = update.status;
        if (update.notes !== undefined) updateData.notes = update.notes;

        await supabase.from("receivables").update(updateData).eq("id", receivableId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateReceivable error:", e);
    }
  }

  return _inMemoryState.receivables.find((r) => r.id === receivableId) ?? null;
}

export async function deleteReceivable(receivableId: string): Promise<{ success: boolean }> {
  _inMemoryState.receivables = _inMemoryState.receivables.filter((r) => r.id !== receivableId);

  const db = getDb();
  if (db) {
    try {
      await db.delete(receivables).where(eq(receivables.id, receivableId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteReceivable error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("receivables").delete().eq("id", receivableId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteReceivable error:", e);
    }
  }

  return { success: true };
}

export async function recordReceivablePayment(params: {
  projectId: string;
  amount: number;
  dueDate?: string;
}): Promise<{ receivable: Receivable; project: Project }> {
  const project = _inMemoryState.projects.find((p) => p.id === params.projectId);
  if (!project) throw new Error(`Project ${params.projectId} not found`);

  project.received = Math.min(project.amount, (project.received || 0) + params.amount);

  let receivable = _inMemoryState.receivables.find((r) => r.projectId === params.projectId);
  if (receivable) {
    receivable.received = Math.min(project.amount, (receivable.received || 0) + params.amount);
    receivable.status =
      receivable.received >= project.amount
        ? "Paid"
        : receivable.received > 0
        ? "Partially Paid"
        : "Unpaid";
  } else {
    receivable = {
      id: uid(),
      projectId: params.projectId,
      received: params.amount,
      dueDate: params.dueDate || project.deadline || new Date().toISOString().slice(0, 10),
      status: params.amount >= project.amount ? "Paid" : "Partially Paid",
      notes: "Auto-created from payment recording.",
    };
    _inMemoryState.receivables.push(receivable);
  }

  const db = getDb();
  if (db) {
    try {
      await db
        .update(projects)
        .set({ received: project.received, updatedAt: new Date() })
        .where(eq(projects.id, params.projectId));

      await db
        .insert(receivables)
        .values({
          id: receivable.id,
          projectId: receivable.projectId,
          received: receivable.received,
          dueDate: receivable.dueDate,
          status: receivable.status,
          notes: receivable.notes,
        })
        .onConflictDoUpdate({
          target: receivables.id,
          set: {
            received: receivable.received,
            status: receivable.status,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      console.warn("[Database] Drizzle recordReceivablePayment error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase
          .from("projects")
          .update({ received: project.received, updatedAt: new Date().toISOString() })
          .eq("id", params.projectId);

        await supabase.from("receivables").upsert(
          {
            id: receivable.id,
            projectId: receivable.projectId,
            received: receivable.received,
            dueDate: receivable.dueDate,
            status: receivable.status,
            notes: receivable.notes,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase recordReceivablePayment error:", e);
    }
  }

  return { receivable, project };
}

// --- Credentials CRUD ---

export async function listCredentials(): Promise<Credential[]> {
  const state = await getWorkspaceState();
  return state.credentials;
}

export async function getCredentialById(credentialId: string): Promise<Credential | null> {
  const state = await getWorkspaceState();
  return state.credentials.find((c) => c.id === credentialId) ?? null;
}

export async function createCredential(input: {
  id?: string;
  service: string;
  projectId?: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
}): Promise<Credential> {
  const newCredential: Credential = {
    id: input.id || uid(),
    service: input.service,
    projectId: input.projectId || "",
    username: input.username,
    password: input.password,
    url: input.url || "",
    notes: input.notes || "",
  };

  _inMemoryState.credentials = [
    newCredential,
    ..._inMemoryState.credentials.filter((c) => c.id !== newCredential.id),
  ];

  const db = getDb();
  if (db) {
    try {
      await db.insert(credentials).values({
        id: newCredential.id,
        service: newCredential.service,
        projectId: newCredential.projectId ? newCredential.projectId : null,
        username: newCredential.username,
        password: newCredential.password,
        url: newCredential.url,
        notes: newCredential.notes,
      });
      return newCredential;
    } catch (e) {
      console.warn("[Database] Drizzle createCredential error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("credentials").insert({
          id: newCredential.id,
          service: newCredential.service,
          projectId: newCredential.projectId ? newCredential.projectId : null,
          username: newCredential.username,
          password: newCredential.password,
          url: newCredential.url,
          notes: newCredential.notes,
        });
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createCredential error:", e);
    }
  }

  return newCredential;
}

export async function updateCredential(
  credentialId: string,
  update: Partial<Credential>
): Promise<Credential | null> {
  const idx = _inMemoryState.credentials.findIndex((c) => c.id === credentialId);
  if (idx !== -1) {
    _inMemoryState.credentials[idx] = {
      ..._inMemoryState.credentials[idx],
      ...update,
      id: credentialId,
    };
  }

  const db = getDb();
  if (db) {
    try {
      const updateData: Partial<InsertCredentialRow> = { updatedAt: new Date() };
      if (update.service !== undefined) updateData.service = update.service;
      if (update.projectId !== undefined) updateData.projectId = update.projectId ? update.projectId : null;
      if (update.username !== undefined) updateData.username = update.username;
      if (update.password !== undefined) updateData.password = update.password;
      if (update.url !== undefined) updateData.url = update.url;
      if (update.notes !== undefined) updateData.notes = update.notes;

      await db.update(credentials).set(updateData).where(eq(credentials.id, credentialId));
    } catch (e) {
      console.warn("[Database] Drizzle updateCredential error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (update.service !== undefined) updateData.service = update.service;
        if (update.projectId !== undefined) updateData.projectId = update.projectId ? update.projectId : null;
        if (update.username !== undefined) updateData.username = update.username;
        if (update.password !== undefined) updateData.password = update.password;
        if (update.url !== undefined) updateData.url = update.url;
        if (update.notes !== undefined) updateData.notes = update.notes;

        await supabase.from("credentials").update(updateData).eq("id", credentialId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateCredential error:", e);
    }
  }

  return _inMemoryState.credentials.find((c) => c.id === credentialId) ?? null;
}

export async function deleteCredential(credentialId: string): Promise<{ success: boolean }> {
  _inMemoryState.credentials = _inMemoryState.credentials.filter((c) => c.id !== credentialId);

  const db = getDb();
  if (db) {
    try {
      await db.delete(credentials).where(eq(credentials.id, credentialId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteCredential error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("credentials").delete().eq("id", credentialId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteCredential error:", e);
    }
  }

  return { success: true };
}

// --- Scripts CRUD ---

export async function listScripts(): Promise<Script[]> {
  const state = await getWorkspaceState();
  return state.scripts;
}

export async function getScriptById(scriptId: string): Promise<Script | null> {
  const state = await getWorkspaceState();
  return state.scripts.find((s) => s.id === scriptId) ?? null;
}

export async function createScript(input: {
  id?: string;
  name: string;
  category?: string;
  description?: string;
  code: string;
  tags?: string[];
  projectId?: string;
  notes?: string;
}): Promise<Script> {
  const newScript: Script = {
    id: input.id || uid(),
    name: input.name,
    category: input.category || "Other",
    description: input.description || "",
    code: input.code,
    tags: Array.isArray(input.tags) ? input.tags : [],
    projectId: input.projectId || "",
    notes: input.notes || "",
  };

  _inMemoryState.scripts = [newScript, ..._inMemoryState.scripts.filter((s) => s.id !== newScript.id)];

  const db = getDb();
  if (db) {
    try {
      await db.insert(scripts).values({
        id: newScript.id,
        name: newScript.name,
        category: newScript.category,
        description: newScript.description,
        code: newScript.code,
        tags: newScript.tags,
        projectId: newScript.projectId ? newScript.projectId : null,
        notes: newScript.notes,
      });
      return newScript;
    } catch (e) {
      console.warn("[Database] Drizzle createScript error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("scripts").insert({
          id: newScript.id,
          name: newScript.name,
          category: newScript.category,
          description: newScript.description,
          code: newScript.code,
          tags: newScript.tags,
          projectId: newScript.projectId ? newScript.projectId : null,
          notes: newScript.notes,
        });
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase createScript error:", e);
    }
  }

  return newScript;
}

export async function updateScript(
  scriptId: string,
  update: Partial<Script>
): Promise<Script | null> {
  const idx = _inMemoryState.scripts.findIndex((s) => s.id === scriptId);
  if (idx !== -1) {
    _inMemoryState.scripts[idx] = {
      ..._inMemoryState.scripts[idx],
      ...update,
      id: scriptId,
    };
  }

  const db = getDb();
  if (db) {
    try {
      const updateData: Partial<InsertScriptRow> = { updatedAt: new Date() };
      if (update.name !== undefined) updateData.name = update.name;
      if (update.category !== undefined) updateData.category = update.category;
      if (update.description !== undefined) updateData.description = update.description;
      if (update.code !== undefined) updateData.code = update.code;
      if (update.tags !== undefined) updateData.tags = update.tags;
      if (update.projectId !== undefined) updateData.projectId = update.projectId ? update.projectId : null;
      if (update.notes !== undefined) updateData.notes = update.notes;

      await db.update(scripts).set(updateData).where(eq(scripts.id, scriptId));
    } catch (e) {
      console.warn("[Database] Drizzle updateScript error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (update.name !== undefined) updateData.name = update.name;
        if (update.category !== undefined) updateData.category = update.category;
        if (update.description !== undefined) updateData.description = update.description;
        if (update.code !== undefined) updateData.code = update.code;
        if (update.tags !== undefined) updateData.tags = update.tags;
        if (update.projectId !== undefined) updateData.projectId = update.projectId ? update.projectId : null;
        if (update.notes !== undefined) updateData.notes = update.notes;

        await supabase.from("scripts").update(updateData).eq("id", scriptId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase updateScript error:", e);
    }
  }

  return _inMemoryState.scripts.find((s) => s.id === scriptId) ?? null;
}

export async function deleteScript(scriptId: string): Promise<{ success: boolean }> {
  _inMemoryState.scripts = _inMemoryState.scripts.filter((s) => s.id !== scriptId);

  const db = getDb();
  if (db) {
    try {
      await db.delete(scripts).where(eq(scripts.id, scriptId));
    } catch (e) {
      console.warn("[Database] Drizzle deleteScript error:", e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (_hasRelationalTables !== false) {
        await supabase.from("scripts").delete().eq("id", scriptId);
      } else {
        await saveWorkspaceState(_inMemoryState);
      }
    } catch (e) {
      console.warn("[Database] Supabase deleteScript error:", e);
    }
  }

  return { success: true };
}
