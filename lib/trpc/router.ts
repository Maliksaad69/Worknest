import { z } from "zod";
import { getWorkspaceState, saveWorkspaceState, checkSupabaseHealth } from "../db";
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
});

export type AppRouter = typeof appRouter;
