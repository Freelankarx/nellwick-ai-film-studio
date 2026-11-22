export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_next_production_job", {
    p_owner_id: worker.ownerId,
    p_worker_label: String(body.worker_label || "notebook-worker").slice(0, 80),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  if (job?.manifest && typeof job.manifest === "object" && !Array.isArray(job.manifest)) {
    const manifest = job.manifest as { shots?: Array<{ id?: string }> };
    const shotIds = (manifest.shots || []).map((shot) => shot.id).filter((id): id is string => typeof id === "string");
    if (shotIds.length) await admin.from("shots").update({ status: "processing" }).in("id", shotIds).eq("owner_id", worker.ownerId).in("status", ["queued", "failed"]);
  }
  return NextResponse.json({ job: job || null }, { headers: { "Cache-Control": "no-store" } });
}
