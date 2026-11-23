import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type JobManifest = { shots?: Array<{ id?: string }> };

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: existing, error: readError } = await supabase.from("production_jobs")
    .select("id,manifest,status,lease_expires_at").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Production job not found." }, { status: 404 });
  if (existing.status !== "failed" && existing.status !== "cancelled") {
    return NextResponse.json({ error: "Only failed or cancelled jobs can be retried." }, { status: 409 });
  }

  if (existing.status === "cancelled" && existing.lease_expires_at && new Date(existing.lease_expires_at).getTime() > Date.now()) {
    return NextResponse.json({
      error: "This job is still stopping in the notebook. Retry will become available after the worker acknowledges cancellation, or its 10-minute lease expires."
    }, { status: 409 });
  }

  const { data, error } = await supabase.from("production_jobs").update({
    status: "queued",
    progress: 0,
    last_error: null,
    lease_expires_at: null,
    claimed_by: null,
    heartbeat_at: null,
    attempt_count: 0
  }).eq("id", id).eq("owner_id", user.id).eq("status", existing.status)
    .select("id,status,manifest").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Could not queue this job for retry. Refresh the queue and try again." }, { status: 409 });

  const manifest = data.manifest && typeof data.manifest === "object" && !Array.isArray(data.manifest)
    ? data.manifest as JobManifest
    : {};
  const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((shotId): shotId is string => typeof shotId === "string");
  if (shotIds.length) {
    const { error: shotsError } = await supabase.from("shots").update({ status: "queued" })
      .in("id", shotIds).eq("owner_id", user.id).neq("status", "completed");
    if (shotsError) return NextResponse.json({ error: `Job queued, but shot statuses could not be updated: ${shotsError.message}` }, { status: 500 });
  }
  return NextResponse.json({ job: { id: data.id, status: data.status } });
}
