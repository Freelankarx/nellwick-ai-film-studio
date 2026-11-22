export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";
export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_next_production_job", { p_owner_id: worker.ownerId, p_worker_label: String(body.worker_label || "notebook-worker").slice(0, 80) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ job: job || null }, { headers: { "Cache-Control": "no-store" } });
}
