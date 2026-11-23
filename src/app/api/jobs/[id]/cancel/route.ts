import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

type JobManifest = { shots?: Array<{ id?: string }> };

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: job, error: readError } = await supabase
    .from("production_jobs")
    .select("id,status,manifest,lease_expires_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Production job not found." }, { status: 404 });

  if (job.status === "cancelled") {
    const leaseActive = !!job.lease_expires_at && new Date(job.lease_expires_at).getTime() > Date.now();
    return NextResponse.json({
      ok: true,
      status: "cancelled",
      stopping: leaseActive,
      message: leaseActive ? "Cancellation has been requested. The notebook worker is still stopping." : "This job is already cancelled."
    });
  }
  if (job.status !== "queued" && job.status !== "processing") {
    return NextResponse.json({ error: "Only queued or processing jobs can be cancelled." }, { status: 409 });
  }

  const wasProcessing = job.status === "processing";
  const update = supabase.from("production_jobs").update({
    status: "cancelled",
    last_error: null,
    ...(wasProcessing ? {} : { lease_expires_at: null, claimed_by: null })
  }).eq("id", id).eq("owner_id", user.id).eq("status", job.status);
  const { data: updated, error: updateError } = await update.select("id,status,lease_expires_at").maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "The job changed state before it could be cancelled. Refresh the queue and try again." }, { status: 409 });

  if (!wasProcessing) {
    const manifest = job.manifest && typeof job.manifest === "object" && !Array.isArray(job.manifest)
      ? job.manifest as JobManifest
      : {};
    const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((shotId): shotId is string => typeof shotId === "string");
    if (shotIds.length) {
      const { error: shotsError } = await supabase.from("shots").update({ status: "draft" })
        .in("id", shotIds).eq("owner_id", user.id).eq("status", "queued");
      if (shotsError) return NextResponse.json({ error: `Job cancelled, but shot states could not be reset: ${shotsError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    status: "cancelled",
    stopping: wasProcessing && !!updated.lease_expires_at && new Date(updated.lease_expires_at).getTime() > Date.now(),
    message: wasProcessing
      ? "Cancellation requested. The notebook worker will stop at its next safe generation checkpoint."
      : "Queued job cancelled. Its unfinished shots are available to queue again."
  });
}
