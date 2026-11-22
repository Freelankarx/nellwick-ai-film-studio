import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: existing, error: readError } = await supabase.from("production_jobs").select("id,manifest,status").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Production job not found." }, { status: 404 });
  if (existing.status !== "failed" && existing.status !== "cancelled") return NextResponse.json({ error: "Only failed or cancelled jobs can be retried." }, { status: 409 });
  const { data, error } = await supabase.from("production_jobs").update({ status: "queued", progress: 0, last_error: null, lease_expires_at: null, attempt_count: 0 }).eq("id", id).eq("owner_id", user.id).select("id,status,manifest").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Could not queue this job for retry." }, { status: 409 });
  const manifest = data.manifest && typeof data.manifest === "object" && !Array.isArray(data.manifest) ? data.manifest as { shots?: Array<{ id?: string }> } : {};
  const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((shotId): shotId is string => typeof shotId === "string");
  if (shotIds.length) await supabase.from("shots").update({ status: "queued" }).in("id", shotIds).eq("owner_id", user.id);
  return NextResponse.json({ job: { id: data.id, status: data.status } });
}
