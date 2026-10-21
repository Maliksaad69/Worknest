import { relations } from "drizzle-orm";
import {
  credentials,
  outsourcePayments,
  outsources,
  projects,
  receivables,
  scripts,
  tasks,
} from "./schema";

/**
 * Projects relations:
 * A project has many tasks, outsources, receivables, credentials, and scripts.
 */
export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
  outsources: many(outsources),
  receivables: many(receivables),
  credentials: many(credentials),
  scripts: many(scripts),
}));

/**
 * Tasks relations:
 * Each task belongs to a single project.
 */
export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
}));

/**
 * Outsources relations:
 * An outsource record belongs to an optional project and has many payment records.
 */
export const outsourcesRelations = relations(outsources, ({ one, many }) => ({
  project: one(projects, {
    fields: [outsources.projectId],
    references: [projects.id],
  }),
  payments: many(outsourcePayments),
}));

/**
 * Outsource payments relations:
 * Each payment belongs to an outsourced assignment.
 */
export const outsourcePaymentsRelations = relations(outsourcePayments, ({ one }) => ({
  outsource: one(outsources, {
    fields: [outsourcePayments.outsourceId],
    references: [outsources.id],
  }),
}));

/**
 * Receivables relations:
 * Each receivable milestone belongs to a project.
 */
export const receivablesRelations = relations(receivables, ({ one }) => ({
  project: one(projects, {
    fields: [receivables.projectId],
    references: [projects.id],
  }),
}));

/**
 * Credentials relations:
 * Each credential optionally belongs to a project.
 */
export const credentialsRelations = relations(credentials, ({ one }) => ({
  project: one(projects, {
    fields: [credentials.projectId],
    references: [projects.id],
  }),
}));

/**
 * Scripts relations:
 * Each script snippet optionally belongs to a project.
 */
export const scriptsRelations = relations(scripts, ({ one }) => ({
  project: one(projects, {
    fields: [scripts.projectId],
    references: [projects.id],
  }),
}));
