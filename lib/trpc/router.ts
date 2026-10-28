import { z } from "zod";
import {
  getWorkspaceState,
  saveWorkspaceState,
  checkSupabaseHealth,
  getProjectsWithDetails,
  getProjectById,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  listTasksByProject,
  createTask,
  updateTask,
  toggleTask,
  deleteTask,
  listOutsources,
  getOutsourceById,
  createOutsource,
  updateOutsource,
  deleteOutsource,
  addOutsourcePayment,
  deleteOutsourcePayment,
  listReceivables,
  getReceivableById,
  createReceivable,
  updateReceivable,
  deleteReceivable,
  recordReceivablePayment,
  listCredentials,
  getCredentialById,
  createCredential,
  updateCredential,
  deleteCredential,
  listScripts,
  getScriptById,
  createScript,
  updateScript,
  deleteScript,
} from "../db";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  system: router({
    health: publicProcedure
      .input(
        z.object({
          timestamp: z.number().min(0, "timestamp cannot be negative"),
        })
      )
      .query(() => ({
        ok: true,
      })),
    supabaseStatus: publicProcedure.query(async () => {
      return await checkSupabaseHealth();
    }),
  }),

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user ?? null),
    logout: publicProcedure.mutation(() => ({ success: true })),
  }),

  workspace: router({
    load: publicProcedure.query(async () => {
      const state = await getWorkspaceState();
      return state ?? null;
    }),
    save: publicProcedure
      .input(z.object({ data: z.unknown() }))
      .mutation(async ({ input }) => {
        const result = await saveWorkspaceState(input.data);
        return { success: true, mode: result.mode };
      }),
  }),

  projects: router({
    list: publicProcedure.query(async () => {
      return await listProjects();
    }),
    listWithDetails: publicProcedure.query(async () => {
      return await getProjectsWithDetails();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await getProjectById(input.id);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1, "Project name is required"),
          client: z.string().default(""),
          contact: z.string().default(""),
          description: z.string().default(""),
          start: z.string().default(""),
          deadline: z.string().default(""),
          status: z.enum(["New", "In Progress", "Waiting", "Completed", "Cancelled"]).default("New"),
          priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
          amount: z.number().default(0),
          received: z.number().default(0),
          outsourced: z.boolean().default(false),
          outsourcedTo: z.string().optional(),
          notes: z.string().default(""),
          tasks: z
            .array(
              z.object({
                id: z.string().optional(),
                label: z.string(),
                done: z.boolean().default(false),
                position: z.number().optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createProject(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          client: z.string().optional(),
          contact: z.string().optional(),
          description: z.string().optional(),
          start: z.string().optional(),
          deadline: z.string().optional(),
          status: z.enum(["New", "In Progress", "Waiting", "Completed", "Cancelled"]).optional(),
          priority: z.enum(["Low", "Medium", "High", "Urgent"]).optional(),
          amount: z.number().optional(),
          received: z.number().optional(),
          outsourced: z.boolean().optional(),
          outsourcedTo: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateProject(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteProject(input.id);
      }),
  }),

  tasks: router({
    listByProject: publicProcedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        return await listTasksByProject(input.projectId);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          label: z.string().min(1, "Task label is required"),
          done: z.boolean().default(false),
          position: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createTask(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          done: z.boolean().optional(),
          position: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateTask(id, data);
      }),
    toggle: publicProcedure
      .input(
        z.object({
          id: z.string(),
          done: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        return await toggleTask(input.id, input.done);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteTask(input.id);
      }),
  }),

  outsources: router({
    list: publicProcedure.query(async () => {
      return await listOutsources();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await getOutsourceById(input.id);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          provider: z.string().min(1, "Provider name is required"),
          contact: z.string().default(""),
          description: z.string().default(""),
          cost: z.number().default(0),
          paid: z.number().default(0),
          deadline: z.string().optional(),
          status: z
            .enum([
              "Not Started",
              "Assigned",
              "In Progress",
              "Submitted",
              "Revision Required",
              "Completed",
              "Cancelled",
            ])
            .default("Not Started"),
          notes: z.string().default(""),
          payDate: z.string().optional(),
          paidAt: z.string().optional(),
          payments: z
            .array(
              z.object({
                id: z.string().optional(),
                amount: z.number(),
                date: z.string(),
                note: z.string().optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createOutsource(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          provider: z.string().optional(),
          contact: z.string().optional(),
          description: z.string().optional(),
          cost: z.number().optional(),
          paid: z.number().optional(),
          deadline: z.string().optional(),
          status: z
            .enum([
              "Not Started",
              "Assigned",
              "In Progress",
              "Submitted",
              "Revision Required",
              "Completed",
              "Cancelled",
            ])
            .optional(),
          notes: z.string().optional(),
          payDate: z.string().optional(),
          paidAt: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateOutsource(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteOutsource(input.id);
      }),
    addPayment: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          outsourceId: z.string(),
          amount: z.number().positive("Payment amount must be greater than 0"),
          date: z.string().optional(),
          note: z.string().optional(),
          remainingPayDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await addOutsourcePayment(input);
      }),
    deletePayment: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteOutsourcePayment(input.id);
      }),
  }),

  receivables: router({
    list: publicProcedure.query(async () => {
      return await listReceivables();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await getReceivableById(input.id);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          projectId: z.string(),
          received: z.number().default(0),
          dueDate: z.string().default(""),
          status: z.enum(["Unpaid", "Partially Paid", "Paid", "Overdue"]).default("Unpaid"),
          notes: z.string().default(""),
        })
      )
      .mutation(async ({ input }) => {
        return await createReceivable(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          received: z.number().optional(),
          dueDate: z.string().optional(),
          status: z.enum(["Unpaid", "Partially Paid", "Paid", "Overdue"]).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateReceivable(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteReceivable(input.id);
      }),
    recordPayment: publicProcedure
      .input(
        z.object({
          projectId: z.string(),
          amount: z.number().positive("Payment amount must be greater than 0"),
          dueDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await recordReceivablePayment(input);
      }),
  }),

  credentials: router({
    list: publicProcedure.query(async () => {
      return await listCredentials();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await getCredentialById(input.id);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          service: z.string().min(1, "Service name is required"),
          projectId: z.string().optional(),
          client: z.string().optional(),
          username: z.string().optional().default(""),
          password: z.string().optional().default(""),
          url: z.string().default(""),
          notes: z.string().default(""),
          fields: z
            .array(
              z.object({
                id: z.string().optional(),
                key: z.string(),
                value: z.string(),
                isSecret: z.boolean().optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await createCredential(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          service: z.string().optional(),
          projectId: z.string().optional(),
          client: z.string().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          url: z.string().optional(),
          notes: z.string().optional(),
          fields: z
            .array(
              z.object({
                id: z.string().optional(),
                key: z.string(),
                value: z.string(),
                isSecret: z.boolean().optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateCredential(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteCredential(input.id);
      }),
  }),

  scripts: router({
    list: publicProcedure.query(async () => {
      return await listScripts();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return await getScriptById(input.id);
      }),
    create: publicProcedure
      .input(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1, "Script name is required"),
          category: z.string().default("Other"),
          description: z.string().default(""),
          code: z.string().min(1, "Script code is required"),
          tags: z.array(z.string()).default([]),
          projectId: z.string().optional(),
          notes: z.string().default(""),
        })
      )
      .mutation(async ({ input }) => {
        return await createScript(input);
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          category: z.string().optional(),
          description: z.string().optional(),
          code: z.string().optional(),
          tags: z.array(z.string()).optional(),
          projectId: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await updateScript(id, data);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return await deleteScript(input.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
