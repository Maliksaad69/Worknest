import { NextResponse } from "next/server";
import { checkSupabaseHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await checkSupabaseHealth();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    supabase,
  });
}
