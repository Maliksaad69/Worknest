-- Worknest Initial Schema & Supabase Configuration Migration
-- Run this migration in your Supabase SQL Editor or via Supabase CLI.

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

-- 3. Worknest Workspace State table (persisting projects, outsourced work, receivables, tools)
CREATE TABLE IF NOT EXISTS "public"."worknest_state" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "data" jsonb NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."worknest_state" ENABLE ROW LEVEL SECURITY;

-- 5. Set up RLS Policies for worknest_state
-- Allow read access to anon and authenticated clients
DROP POLICY IF EXISTS "Allow anon and auth read on worknest_state" ON "public"."worknest_state";
CREATE POLICY "Allow anon and auth read on worknest_state"
  ON "public"."worknest_state"
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow insert/write access
DROP POLICY IF EXISTS "Allow anon and auth insert on worknest_state" ON "public"."worknest_state";
CREATE POLICY "Allow anon and auth insert on worknest_state"
  ON "public"."worknest_state"
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow update access
DROP POLICY IF EXISTS "Allow anon and auth update on worknest_state" ON "public"."worknest_state";
CREATE POLICY "Allow anon and auth update on worknest_state"
  ON "public"."worknest_state"
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Allow delete access
DROP POLICY IF EXISTS "Allow anon and auth delete on worknest_state" ON "public"."worknest_state";
CREATE POLICY "Allow anon and auth delete on worknest_state"
  ON "public"."worknest_state"
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- 6. Set up RLS Policies for users table
DROP POLICY IF EXISTS "Allow anon and auth read on users" ON "public"."users";
CREATE POLICY "Allow anon and auth read on users"
  ON "public"."users"
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anon and auth modify on users" ON "public"."users";
CREATE POLICY "Allow anon and auth modify on users"
  ON "public"."users"
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 7. Grant Schema & Table Privileges to anon, authenticated, and service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."users" TO anon, authenticated, service_role;
GRANT ALL ON TABLE "public"."worknest_state" TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 8. Seed Default Workspace Snapshot if not already present
INSERT INTO "public"."worknest_state" ("id", "data", "updatedAt")
VALUES (
  'default',
  '{
    "projects": [
      {
        "id": "p1",
        "name": "Atlas Commerce",
        "client": "Northstar Labs",
        "contact": "Maya Chen · maya@northstar.io",
        "description": "Rework the commerce dashboard into a clear, faster workspace for the operations team.",
        "start": "2026-09-02",
        "deadline": "2026-10-22",
        "status": "In Progress",
        "priority": "High",
        "amount": 4200,
        "received": 2100,
        "outsourced": true,
        "outsourcedTo": "John Malik",
        "notes": "Weekly review on Thursdays. Keep the reporting surface lightweight.",
        "tasks": [
          { "id": "t1", "label": "Approve dashboard structure", "done": true },
          { "id": "t2", "label": "Finish order management flow", "done": false },
          { "id": "t3", "label": "QA responsive states", "done": false }
        ]
      },
      {
        "id": "p2",
        "name": "Lumen Launch",
        "client": "Lumen Studio",
        "contact": "Ava Reed · ava@lumen.studio",
        "description": "Launch a focused landing page and a small campaign toolkit for the autumn release.",
        "start": "2026-09-18",
        "deadline": "2026-10-27",
        "status": "Waiting",
        "priority": "Medium",
        "amount": 1800,
        "received": 1800,
        "outsourced": false,
        "notes": "Waiting on final copy and product photography.",
        "tasks": [
          { "id": "t4", "label": "Landing page build", "done": true },
          { "id": "t5", "label": "Campaign handoff", "done": false }
        ]
      },
      {
        "id": "p3",
        "name": "Harbor Ops",
        "client": "Harbor & Co.",
        "contact": "Owen Blake · owen@harbor.co",
        "description": "Automate a weekly operations report and clean up the handoff documentation.",
        "start": "2026-10-01",
        "deadline": "2026-11-05",
        "status": "New",
        "priority": "Urgent",
        "amount": 2650,
        "received": 0,
        "outsourced": false,
        "notes": "Kickoff call booked for Monday.",
        "tasks": [
          { "id": "t6", "label": "Confirm data sources", "done": false },
          { "id": "t7", "label": "Draft workflow map", "done": false }
        ]
      },
      {
        "id": "p4",
        "name": "Orchard Retainer",
        "client": "Orchard Health",
        "contact": "Sam Patel · sam@orchard.health",
        "description": "Monthly product design and technical support retainer.",
        "start": "2026-08-01",
        "deadline": "2026-10-10",
        "status": "Completed",
        "priority": "Low",
        "amount": 3200,
        "received": 3200,
        "outsourced": false,
        "notes": "Archive after final invoice is reconciled.",
        "tasks": [
          { "id": "t8", "label": "Close monthly report", "done": true }
        ]
      }
    ],
    "outsources": [
      {
        "id": "o1",
        "projectId": "p1",
        "provider": "John Malik",
        "contact": "john@malik.dev",
        "description": "Frontend implementation for the order management flow.",
        "cost": 1400,
        "paid": 900,
        "deadline": "2026-10-20",
        "status": "In Progress",
        "notes": "Share build every Friday."
      },
      {
        "id": "o2",
        "projectId": "p4",
        "provider": "Studio Koi",
        "contact": "hello@studiokoi.co",
        "description": "Illustration support for the monthly product report.",
        "cost": 500,
        "paid": 500,
        "deadline": "2026-10-06",
        "status": "Completed",
        "notes": "Final assets are in the shared folder."
      }
    ],
    "receivables": [
      {
        "id": "r1",
        "projectId": "p1",
        "received": 2100,
        "dueDate": "2026-10-28",
        "status": "Partially Paid",
        "notes": "Second milestone invoice sent."
      },
      {
        "id": "r2",
        "projectId": "p2",
        "received": 1800,
        "dueDate": "2026-10-13",
        "status": "Paid",
        "notes": "Paid in full."
      },
      {
        "id": "r3",
        "projectId": "p3",
        "received": 0,
        "dueDate": "2026-11-03",
        "status": "Unpaid",
        "notes": "Invoice to be issued after kickoff."
      }
    ],
    "credentials": [
      {
        "id": "c1",
        "service": "Northstar staging",
        "projectId": "p1",
        "username": "maya@northstar.io",
        "password": "Atlas-staging-2026",
        "url": "https://staging.northstar.io",
        "notes": "Use the staging workspace for QA."
      },
      {
        "id": "c2",
        "service": "Lumen CMS",
        "projectId": "p2",
        "username": "ava@lumen.studio",
        "password": "LumenLaunch!",
        "url": "https://cms.lumen.studio",
        "notes": "Editor access only."
      },
      {
        "id": "c3",
        "service": "Harbor AWS",
        "projectId": "p3",
        "username": "ops@harbor.co",
        "password": "Harbor-ops-key",
        "url": "https://console.aws.amazon.com",
        "notes": "Temporary credentials; rotate after handoff."
      }
    ],
    "scripts": [
      {
        "id": "s1",
        "name": "Tail logs safely",
        "category": "Linux",
        "description": "Follow the latest application logs while preserving timestamps.",
        "code": "journalctl -u app.service -f -n 200 --output=short-iso",
        "tags": ["logs", "debug"],
        "projectId": "p1",
        "notes": "Useful during staged deploys."
      },
      {
        "id": "s2",
        "name": "Backup Postgres",
        "category": "Database",
        "description": "Create a compressed database backup with a timestamped filename.",
        "code": "pg_dump \"$DATABASE_URL\" | gzip > backup-$(date +%Y%m%d-%H%M).sql.gz",
        "tags": ["backup", "postgres"],
        "projectId": "p3",
        "notes": "Run from the production bastion."
      },
      {
        "id": "s3",
        "name": "Deploy checklist",
        "category": "Deployment",
        "description": "A small preflight reminder for client releases.",
        "code": "pnpm check && pnpm test && pnpm build\ngit status --short\ngit push origin main",
        "tags": ["release", "quality"],
        "projectId": "",
        "notes": "Keep the release flow boring."
      }
    ]
  }'::jsonb,
  now()
)
ON CONFLICT ("id") DO NOTHING;
