import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";

type JobManifest = { shots?: Array<{ id?: string }> };

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.job_id !== "string") return NextResponse.json({ error: "job_id is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: job, error: readError } = await admin.from("production_jobs")
    .select("id,status,manifest").eq("id", body.job_id).eq("owner_id", worker.ownerId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  if (job.status === "cancelled") {
    if (body.ack_cancelled === true) {
      const { error: releaseError } = await admin.from("production_jobs").update({
        lease_expires_at: null,
        claimed_by: null,
        heartbeat_at: new Date().toISOString()
      }).eq("id", body.job_id).eq("owner_id", worker.ownerId).eq("status", "cancelled");
      if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 });

      const manifest = job.manifest && typeof job.manifest === "object" && !Array.isArray(job.manifest)
        ? job.manifest as JobManifest
        : {};
      const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((id): id is string => typeof id === "string");
      if (shotIds.length) {
        const { error: shotsError } = await admin.from("shots").update({ status: "draft" })
          .in("id", shotIds).eq("owner_id", worker.ownerId).in("status", ["queued", "processing"]);
        if (shotsError) return NextResponse.json({ error: shotsError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, cancelled: true, acknowledged: true });
    }
    return NextResponse.json({ ok: true, cancelled: true, acknowledged: false });
  }

  if (job.status !== "processing") {
    // A retry can put the row back in queued state after the old lease expires.
    // The previous worker must still stop rather than continue on an unclaimed job.
    return NextResponse.json({ ok: true, cancelled: job.status !== "completed", status: job.status, acknowledged: body.ack_cancelled === true });
  }

  const { error } = await admin.from("production_jobs").update({
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }).eq("id", body.job_id).eq("owner_id", worker.ownerId).eq("status", "processing");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cancelled: false });
}
