export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET() {
  const { user } = await requireUser(); if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("integrations").select("provider,account_label,root_folder_id,connected_at").eq("owner_id", user.id).eq("provider", "google_drive").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connection: data || null }, { headers: { "Cache-Control": "no-store" } });
}
