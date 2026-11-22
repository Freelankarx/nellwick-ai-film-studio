import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";
import type { Json, StorageProvider } from "@/types/database";

const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(), z.number(), z.boolean(), z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const assetSchema = z.object({
  name: z.string().min(1).max(255),
  mime_type: z.string().max(120).default("video/mp4"),
  file_size: z.number().int().nonnegative().optional(),
  drive_file_id: z.string().min(1),
  drive_path: z.string().optional(),
  source_type: z.enum(["generated", "uploaded", "rendered"]).default("generated"),
  metadata: z.record(z.string(), jsonValueSchema).optional(),
});
const schema = z.object({ job_id: z.string().uuid(), assets: z.array(assetSchema).min(1), result: z.record(z.string(), jsonValueSchema).optional() });
const STORAGE_PROVIDER: StorageProvider = "google_drive";
const uuidSchema = z.string().uuid();

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
  const admin = createAdminClient();
  const input = parsed.data;
  const { data: job } = await admin.from("production_jobs").select("id,project_id,episode_id,result").eq("id", input.job_id).eq("owner_id", worker.ownerId).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const rows = input.assets.map((asset) => ({ ...asset, owner_id: worker.ownerId, project_id: job.project_id, episode_id: job.episode_id || null, storage_provider: STORAGE_PROVIDER }));
  const { data: inserted, error: assetError } = await admin.from("assets").insert(rows).select("id,name,drive_file_id");
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });

  // Link generated shot files back to their saved storyboard records.
  let linkedShots = 0;
  const assetsByDriveId = new Map<string, { id: string; name: string; drive_file_id: string | null }>();
  for (const asset of inserted || []) {
    if (asset.drive_file_id) assetsByDriveId.set(asset.drive_file_id, asset);
  }
  for (const inputAsset of input.assets) {
    const shotId = uuidSchema.safeParse(inputAsset.metadata?.shot_id);
    const linkedAsset = assetsByDriveId.get(inputAsset.drive_file_id);
    if (!shotId.success || !linkedAsset || inputAsset.source_type !== "generated") continue;
    const { error: shotError } = await admin.from("shots").update({ status: "completed", output_asset_id: linkedAsset.id }).eq("id", shotId.data).eq("owner_id", worker.ownerId);
    if (!shotError) linkedShots += 1;
  }

  const existingResult = job.result && typeof job.result === "object" && !Array.isArray(job.result) ? job.result as Record<string, Json> : {};
  const finalResult: Record<string, Json> = {
    ...existingResult,
    ...(input.result || {}),
    linked_storyboard_shots: linkedShots,
    assets: (inserted || []).map((asset) => ({ id: asset.id, name: asset.name, drive_file_id: asset.drive_file_id })),
  };
  const { error } = await admin.from("production_jobs").update({ status: "completed", progress: 100, result: finalResult, completed_at: new Date().toISOString(), lease_expires_at: null, last_error: null }).eq("id", input.job_id).eq("owner_id", worker.ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assets: inserted || [], linked_storyboard_shots: linkedShots });
}
