import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";
export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.job_id !== "string") return NextResponse.json({ error: "job_id is required." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("production_jobs").update({ heartbeat_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }).eq("id", body.job_id).eq("owner_id", worker.ownerId).eq("status", "processing");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
