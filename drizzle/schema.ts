import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);

/** Users table for authentication and profile sessions */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

/** Projects table: core workspace projects */
export const projects = pgTable("projects", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  client: text("client").default("").notNull(),
  contact: text("contact").default("").notNull(),
  description: text("description").default("").notNull(),
  start: varchar("start", { length: 32 }).default("").notNull(),
  deadline: varchar("deadline", { length: 32 }).default("").notNull(),
  status: varchar("status", { length: 32 }).default("New").notNull(),
  priority: varchar("priority", { length: 32 }).default("Medium").notNull(),
  amount: doublePrecision("amount").default(0).notNull(),
  received: doublePrecision("received").default(0).notNull(),
  outsourced: boolean("outsourced").default(false).notNull(),
  outsourcedTo: text("outsourcedTo"),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Tasks table: tasks belonging to each project */
export const tasks = pgTable("tasks", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  done: boolean("done").default(false).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Outsourced assignments table: partner assignments linked to projects */
export const outsources = pgTable("outsources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 })
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").default("").notNull(),
  contact: text("contact").default("").notNull(),
  description: text("description").default("").notNull(),
  cost: doublePrecision("cost").default(0).notNull(),
  paid: doublePrecision("paid").default(0).notNull(),
  deadline: varchar("deadline", { length: 32 }),
  status: varchar("status", { length: 32 }).default("Not Started").notNull(),
  notes: text("notes").default("").notNull(),
  payDate: varchar("payDate", { length: 32 }),
  paidAt: varchar("paidAt", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Outsource payments table: payment milestones/history for outsourced assignments */
export const outsourcePayments = pgTable("outsource_payments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  outsourceId: varchar("outsourceId", { length: 64 })
    .notNull()
    .references(() => outsources.id, { onDelete: "cascade" }),
  amount: doublePrecision("amount").default(0).notNull(),
  date: varchar("date", { length: 32 }).default("").notNull(),
  note: text("note").default(""),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Receivables table: expected and recorded client payments linked to projects */
export const receivables = pgTable("receivables", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 })
    .references(() => projects.id, { onDelete: "cascade" }),
  received: doublePrecision("received").default(0).notNull(),
  dueDate: varchar("dueDate", { length: 32 }).default("").notNull(),
  status: varchar("status", { length: 32 }).default("Unpaid").notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Credentials table: service credentials optionally linked to projects */
export const credentials = pgTable("credentials", {
  id: varchar("id", { length: 64 }).primaryKey(),
  service: text("service").default("").notNull(),
  projectId: varchar("projectId", { length: 64 })
    .references(() => projects.id, { onDelete: "cascade" }),
  username: text("username").default("").notNull(),
  password: text("password").default("").notNull(),
  url: text("url").default("").notNull(),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Scripts table: technical scripts and snippets optionally linked to projects */
export const scripts = pgTable("scripts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").default("").notNull(),
  category: text("category").default("").notNull(),
  description: text("description").default("").notNull(),
  code: text("code").default("").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  projectId: varchar("projectId", { length: 64 })
    .references(() => projects.id, { onDelete: "cascade" }),
  notes: text("notes").default("").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Legacy fallback table type for backwards compatibility during migration */
export const worknestState = pgTable("worknest_state", {
  id: varchar("id", { length: 64 }).primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type ProjectRow = typeof projects.$inferSelect;
export type InsertProjectRow = typeof projects.$inferInsert;

export type TaskRow = typeof tasks.$inferSelect;
export type InsertTaskRow = typeof tasks.$inferInsert;

export type OutsourceRow = typeof outsources.$inferSelect;
export type InsertOutsourceRow = typeof outsources.$inferInsert;

export type OutsourcePaymentRow = typeof outsourcePayments.$inferSelect;
export type InsertOutsourcePaymentRow = typeof outsourcePayments.$inferInsert;

export type ReceivableRow = typeof receivables.$inferSelect;
export type InsertReceivableRow = typeof receivables.$inferInsert;

export type CredentialRow = typeof credentials.$inferSelect;
export type InsertCredentialRow = typeof credentials.$inferInsert;

export type ScriptRow = typeof scripts.$inferSelect;
export type InsertScriptRow = typeof scripts.$inferInsert;

export type WorknestState = typeof worknestState.$inferSelect;
export type InsertWorknestState = typeof worknestState.$inferInsert;
