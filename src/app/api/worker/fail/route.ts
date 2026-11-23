import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";

const schema = z.object({ job_id: z.string().uuid(), error: z.string().min(1).max(2000) });
type JobManifest = { shots?: Array<{ id?: string }> };

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid failure payload." }, { status: 400 });
  const admin = createAdminClient();
  const { data: job, error: readError } = await admin.from("production_jobs")
    .select("id,manifest,status").eq("id", parsed.data.job_id).eq("owner_id", worker.ownerId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const manifest = job.manifest && typeof job.manifest === "object" && !Array.isArray(job.manifest)
    ? job.manifest as JobManifest
    : {};
  const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((id): id is string => typeof id === "string");

  if (job.status === "cancelled") {
    const { error: releaseError } = await admin.from("production_jobs").update({ lease_expires_at: null, claimed_by: null, heartbeat_at: new Date().toISOString() })
      .eq("id", parsed.data.job_id).eq("owner_id", worker.ownerId).eq("status", "cancelled");
    if (releaseError) return NextResponse.json({ error: releaseError.message }, { status: 500 });
    if (shotIds.length) {
      const { error: shotsError } = await admin.from("shots").update({ status: "draft" })
        .in("id", shotIds).eq("owner_id", worker.ownerId).in("status", ["queued", "processing"]);
      if (shotsError) return NextResponse.json({ error: shotsError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cancelled: true });
  }
  if (job.status !== "processing") return NextResponse.json({ ok: true, ignored: true, status: job.status });

  const { data: updated, error } = await admin.from("production_jobs").update({
    status: "failed",
    last_error: parsed.data.error,
    lease_expires_at: null,
    heartbeat_at: new Date().toISOString()
  }).eq("id", parsed.data.job_id).eq("owner_id", worker.ownerId).eq("status", "processing").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: true, ignored: true });
  if (shotIds.length) {
    const { error: shotsError } = await admin.from("shots").update({ status: "failed" })
      .in("id", shotIds).eq("owner_id", worker.ownerId).in("status", ["queued", "processing"]);
    if (shotsError) return NextResponse.json({ error: shotsError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, will_retry: false, retry_action: "manual" });
}
