import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export type TrpcContext = {
  user?: {
    id: number | string;
    openId?: string;
    name?: string | null;
    email?: string | null;
    role?: "user" | "admin" | string;
  } | null;
};

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
