import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";

const schema = z.object({ job_id: z.string().uuid(), error: z.string().min(1).max(2000) });

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid failure payload." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("production_jobs").update({
    status: "failed",
    last_error: parsed.data.error,
    lease_expires_at: null,
    heartbeat_at: new Date().toISOString()
  }).eq("id", parsed.data.job_id).eq("owner_id", worker.ownerId).eq("status", "processing");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, will_retry: false, retry_action: "manual" });
}
