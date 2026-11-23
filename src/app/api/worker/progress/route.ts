import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";
const schema = z.object({ job_id: z.string().uuid(), progress: z.number().min(0).max(99), message: z.string().max(500).optional(), result_patch: z.record(z.string(), z.unknown()).optional() });
export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress update." }, { status: 400 });
  const admin = createAdminClient(); const input = parsed.data;
  const { data: job, error: readError } = await admin.from("production_jobs")
    .select("id,result,status").eq("id", input.job_id).eq("owner_id", worker.ownerId).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const nextResult = { ...(job.result as Record<string, unknown> || {}), ...(input.result_patch || {}), last_message: input.message || null };
  if (job.status === "cancelled") {
    // Preserve any clip Drive IDs reported just as cancellation was requested.
    if (input.result_patch && Object.keys(input.result_patch).length) {
      const { error } = await admin.from("production_jobs").update({ result: nextResult })
        .eq("id", input.job_id).eq("owner_id", worker.ownerId).eq("status", "cancelled");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cancelled: true });
  }
  if (job.status !== "processing") {
    return NextResponse.json({ error: `Job is no longer processing (status: ${job.status}).` }, { status: 409 });
  }

  const { data: updated, error } = await admin.from("production_jobs").update({
    progress: Math.floor(input.progress),
    result: nextResult,
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }).eq("id", input.job_id).eq("owner_id", worker.ownerId).eq("status", "processing").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) {
    const { data: latest } = await admin.from("production_jobs").select("status")
      .eq("id", input.job_id).eq("owner_id", worker.ownerId).maybeSingle();
    if (latest?.status === "cancelled") return NextResponse.json({ ok: true, cancelled: true });
    return NextResponse.json({ error: "Job state changed before progress could be saved." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, cancelled: false });
}
