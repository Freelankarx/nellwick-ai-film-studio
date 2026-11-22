import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("production_jobs").update({ status: "queued", progress: 0, last_error: null, lease_expires_at: null, attempt_count: 0 }).eq("id", id).eq("owner_id", user.id).in("status", ["failed", "cancelled"]).select("id,status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Only failed or cancelled jobs can be retried." }, { status: 409 });
  return NextResponse.json({ job: data });
}
