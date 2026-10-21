CREATE TABLE "credentials" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"projectId" varchar(64),
	"username" text DEFAULT '' NOT NULL,
	"password" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outsource_payments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"outsourceId" varchar(64) NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"date" varchar(32) DEFAULT '' NOT NULL,
	"note" text DEFAULT '',
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outsources" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"projectId" varchar(64),
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
--> statement-breakpoint
CREATE TABLE "projects" (
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
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"projectId" varchar(64),
	"received" double precision DEFAULT 0 NOT NULL,
	"dueDate" varchar(32) DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'Unpaid' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"projectId" varchar(64),
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"projectId" varchar(64) NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsource_payments" ADD CONSTRAINT "outsource_payments_outsourceId_outsources_id_fk" FOREIGN KEY ("outsourceId") REFERENCES "public"."outsources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsources" ADD CONSTRAINT "outsources_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;