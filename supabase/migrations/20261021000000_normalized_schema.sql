-- ==============================================================================
-- Worknest Normalized Relational Schema & Migration
-- ==============================================================================
-- Run this migration in your Supabase SQL Editor or via Supabase CLI.
-- This replaces the single-row JSON anti-pattern with individual normalized tables,
-- foreign keys, cascading deletions, join indexes, and RLS policies.
-- ==============================================================================

-- 1. Create custom enum types safely
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE "public"."user_role" AS ENUM ('user', 'admin');
  END IF;
END $$;

-- 2. Users table (for Supabase user sessions and roles)
CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" serial PRIMARY KEY,
  "openId" varchar(64) NOT NULL UNIQUE,
  "name" text,
  "email" varchar(320),
  "loginMethod" varchar(64),
  "role" "public"."user_role" DEFAULT 'user' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Projects table (primary projects entity)
CREATE TABLE IF NOT EXISTS "public"."projects" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "client" text DEFAULT '' NOT NULL,
  "contact" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "start" varchar(32) DEFAULT '' NOT NULL,
  "deadline" varchar(32) DEFAULT '' NOT NULL,
  "status" varchar(32) DEFAULT 'New' NOT NULL,
  "priority" varchar(32) DEFAULT 'Medium' NOT NULL,
  "amount" double precision DEFAULT 0 NOT NULL,
  "received" double precision DEFAULT 0 NOT NULL,
  "outsourced" boolean DEFAULT false NOT NULL,
  "outsourcedTo" text,
  "notes" text DEFAULT '' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Tasks table (tasks belonging to each project, with foreign key)
CREATE TABLE IF NOT EXISTS "public"."tasks" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "projectId" varchar(64) NOT NULL REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. Outsourced work table (partner assignments linked to projects)
CREATE TABLE IF NOT EXISTS "public"."outsources" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "projectId" varchar(64) REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "provider" text DEFAULT '' NOT NULL,
  "contact" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "cost" double precision DEFAULT 0 NOT NULL,
  "paid" double precision DEFAULT 0 NOT NULL,
  "deadline" varchar(32),
  "status" varchar(32) DEFAULT 'Not Started' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "payDate" varchar(32),
  "paidAt" varchar(64),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. Outsource payments table (payment milestones/history for outsourced work)
CREATE TABLE IF NOT EXISTS "public"."outsource_payments" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "outsourceId" varchar(64) NOT NULL REFERENCES "public"."outsources"("id") ON DELETE CASCADE,
  "amount" double precision DEFAULT 0 NOT NULL,
  "date" varchar(32) DEFAULT '' NOT NULL,
  "note" text DEFAULT '',
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 7. Receivables table (client payment milestones linked to projects)
CREATE TABLE IF NOT EXISTS "public"."receivables" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "projectId" varchar(64) REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "received" double precision DEFAULT 0 NOT NULL,
  "dueDate" varchar(32) DEFAULT '' NOT NULL,
  "status" varchar(32) DEFAULT 'Unpaid' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 8. Credentials table (service credentials optionally linked to projects)
CREATE TABLE IF NOT EXISTS "public"."credentials" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "service" text DEFAULT '' NOT NULL,
  "projectId" varchar(64) REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "username" text DEFAULT '' NOT NULL,
  "password" text DEFAULT '' NOT NULL,
  "url" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 9. Scripts table (technical scripts optionally linked to projects)
CREATE TABLE IF NOT EXISTS "public"."scripts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "code" text DEFAULT '' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "projectId" varchar(64) REFERENCES "public"."projects"("id") ON DELETE CASCADE,
  "notes" text DEFAULT '' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 10. Performance Indexes for Foreign Key Joins
CREATE INDEX IF NOT EXISTS "idx_tasks_project_id" ON "public"."tasks"("projectId");
CREATE INDEX IF NOT EXISTS "idx_outsources_project_id" ON "public"."outsources"("projectId");
CREATE INDEX IF NOT EXISTS "idx_outsource_payments_outsource_id" ON "public"."outsource_payments"("outsourceId");
CREATE INDEX IF NOT EXISTS "idx_receivables_project_id" ON "public"."receivables"("projectId");
CREATE INDEX IF NOT EXISTS "idx_credentials_project_id" ON "public"."credentials"("projectId");
CREATE INDEX IF NOT EXISTS "idx_scripts_project_id" ON "public"."scripts"("projectId");

-- 11. Migrate Existing Data from legacy worknest_state (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worknest_state') THEN
    -- Migrate projects
    INSERT INTO "public"."projects" (
      "id", "name", "client", "contact", "description", "start", "deadline",
      "status", "priority", "amount", "received", "outsourced", "outsourcedTo", "notes", "createdAt", "updatedAt"
    )
    SELECT
      p->>'id' AS "id",
      COALESCE(p->>'name', 'Untitled Project') AS "name",
      COALESCE(p->>'client', '') AS "client",
      COALESCE(p->>'contact', '') AS "contact",
      COALESCE(p->>'description', '') AS "description",
      COALESCE(p->>'start', '') AS "start",
      COALESCE(p->>'deadline', '') AS "deadline",
      COALESCE(p->>'status', 'New') AS "status",
      COALESCE(p->>'priority', 'Medium') AS "priority",
      COALESCE((p->>'amount')::double precision, 0) AS "amount",
      COALESCE((p->>'received')::double precision, 0) AS "received",
      COALESCE((p->>'outsourced')::boolean, false) AS "outsourced",
      p->>'outsourcedTo' AS "outsourcedTo",
      COALESCE(p->>'notes', '') AS "notes",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'projects') = 'array' THEN w.data->'projects' ELSE '[]'::jsonb END) p
    WHERE p->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate tasks from projects
    INSERT INTO "public"."tasks" ("id", "projectId", "label", "done", "position", "createdAt", "updatedAt")
    SELECT
      COALESCE(t->>'id', gen_random_uuid()::text) AS "id",
      p->>'id' AS "projectId",
      COALESCE(t->>'label', '') AS "label",
      COALESCE((t->>'done')::boolean, false) AS "done",
      COALESCE((t->>'position')::integer, row_number() OVER (PARTITION BY p->>'id')) AS "position",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'projects') = 'array' THEN w.data->'projects' ELSE '[]'::jsonb END) p,
         jsonb_array_elements(CASE WHEN jsonb_typeof(p->'tasks') = 'array' THEN p->'tasks' ELSE '[]'::jsonb END) t
    WHERE p->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate outsources
    INSERT INTO "public"."outsources" (
      "id", "projectId", "provider", "contact", "description",
      "cost", "paid", "deadline", "status", "notes", "payDate", "paidAt", "createdAt", "updatedAt"
    )
    SELECT
      o->>'id' AS "id",
      CASE WHEN NULLIF(o->>'projectId', '') IN (SELECT "id" FROM "public"."projects") THEN NULLIF(o->>'projectId', '') ELSE NULL END AS "projectId",
      COALESCE(o->>'provider', '') AS "provider",
      COALESCE(o->>'contact', '') AS "contact",
      COALESCE(o->>'description', '') AS "description",
      COALESCE((o->>'cost')::double precision, 0) AS "cost",
      COALESCE((o->>'paid')::double precision, 0) AS "paid",
      o->>'deadline' AS "deadline",
      COALESCE(o->>'status', 'Not Started') AS "status",
      COALESCE(o->>'notes', '') AS "notes",
      o->>'payDate' AS "payDate",
      o->>'paidAt' AS "paidAt",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'outsources') = 'array' THEN w.data->'outsources' ELSE '[]'::jsonb END) o
    WHERE o->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate outsource payments
    INSERT INTO "public"."outsource_payments" ("id", "outsourceId", "amount", "date", "note", "createdAt")
    SELECT
      COALESCE(pm->>'id', gen_random_uuid()::text) AS "id",
      o->>'id' AS "outsourceId",
      COALESCE((pm->>'amount')::double precision, 0) AS "amount",
      COALESCE(pm->>'date', '') AS "date",
      COALESCE(pm->>'note', '') AS "note",
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'outsources') = 'array' THEN w.data->'outsources' ELSE '[]'::jsonb END) o,
         jsonb_array_elements(CASE WHEN jsonb_typeof(o->'payments') = 'array' THEN o->'payments' ELSE '[]'::jsonb END) pm
    WHERE o->>'id' IN (SELECT "id" FROM "public"."outsources")
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate receivables
    INSERT INTO "public"."receivables" ("id", "projectId", "received", "dueDate", "status", "notes", "createdAt", "updatedAt")
    SELECT
      r->>'id' AS "id",
      CASE WHEN NULLIF(r->>'projectId', '') IN (SELECT "id" FROM "public"."projects") THEN NULLIF(r->>'projectId', '') ELSE NULL END AS "projectId",
      COALESCE((r->>'received')::double precision, 0) AS "received",
      COALESCE(r->>'dueDate', '') AS "dueDate",
      COALESCE(r->>'status', 'Unpaid') AS "status",
      COALESCE(r->>'notes', '') AS "notes",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'receivables') = 'array' THEN w.data->'receivables' ELSE '[]'::jsonb END) r
    WHERE r->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate credentials
    INSERT INTO "public"."credentials" ("id", "service", "projectId", "username", "password", "url", "notes", "createdAt", "updatedAt")
    SELECT
      c->>'id' AS "id",
      COALESCE(c->>'service', '') AS "service",
      CASE WHEN NULLIF(c->>'projectId', '') IN (SELECT "id" FROM "public"."projects") THEN NULLIF(c->>'projectId', '') ELSE NULL END AS "projectId",
      COALESCE(c->>'username', '') AS "username",
      COALESCE(c->>'password', '') AS "password",
      COALESCE(c->>'url', '') AS "url",
      COALESCE(c->>'notes', '') AS "notes",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'credentials') = 'array' THEN w.data->'credentials' ELSE '[]'::jsonb END) c
    WHERE c->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Migrate scripts
    INSERT INTO "public"."scripts" ("id", "name", "category", "description", "code", "tags", "projectId", "notes", "createdAt", "updatedAt")
    SELECT
      s->>'id' AS "id",
      COALESCE(s->>'name', '') AS "name",
      COALESCE(s->>'category', '') AS "category",
      COALESCE(s->>'description', '') AS "description",
      COALESCE(s->>'code', '') AS "code",
      COALESCE(s->'tags', '[]'::jsonb) AS "tags",
      CASE WHEN NULLIF(s->>'projectId', '') IN (SELECT "id" FROM "public"."projects") THEN NULLIF(s->>'projectId', '') ELSE NULL END AS "projectId",
      COALESCE(s->>'notes', '') AS "notes",
      now(),
      now()
    FROM "public"."worknest_state" w,
         jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'scripts') = 'array' THEN w.data->'scripts' ELSE '[]'::jsonb END) s
    WHERE s->>'id' IS NOT NULL
    ON CONFLICT ("id") DO NOTHING;

    -- Drop legacy worknest_state table now that data is migrated into individual tables
    DROP TABLE IF EXISTS "public"."worknest_state" CASCADE;
  END IF;
END $$;

-- 12. Enable Row Level Security (RLS) on all tables
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."outsources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."outsource_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."receivables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scripts" ENABLE ROW LEVEL SECURITY;

-- 13. Create RLS Policies for Anon and Authenticated Access
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users',
      'projects',
      'tasks',
      'outsources',
      'outsource_payments',
      'receivables',
      'credentials',
      'scripts'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow anon and auth read on %I" ON "public".%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow anon and auth read on %I" ON "public".%I FOR SELECT TO anon, authenticated USING (true);', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Allow anon and auth insert on %I" ON "public".%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow anon and auth insert on %I" ON "public".%I FOR INSERT TO anon, authenticated WITH CHECK (true);', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Allow anon and auth update on %I" ON "public".%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow anon and auth update on %I" ON "public".%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Allow anon and auth delete on %I" ON "public".%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow anon and auth delete on %I" ON "public".%I FOR DELETE TO anon, authenticated USING (true);', tbl, tbl);
  END LOOP;
END $$;

-- 14. Grant Schema & Table Privileges to anon, authenticated, and service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."users" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."projects" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."tasks" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."outsources" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."outsource_payments" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."receivables" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."credentials" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."scripts" TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
