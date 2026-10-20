import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/lib/trpc/router";
import { createClient } from "@/utils/supabase/server";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!error && user) {
          return {
            user: {
              id: user.id,
              openId: user.id,
              name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
              email: user.email || null,
              role: (user.user_metadata?.role as "user" | "admin") || "user",
            },
          };
        }
      } catch {
        // Fallback to unauthenticated guest context
      }
      return { user: null };
    },
  });

export { handler as GET, handler as POST };
