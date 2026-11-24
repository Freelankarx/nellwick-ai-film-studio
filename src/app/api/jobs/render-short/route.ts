import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({
    episodeId: z.string().uuid(),
    shortId: z.string().min(1).max(100),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Short render request." }, { status: 400 });

  const { data: episode, error: episodeError } = await supabase.from("episodes")
    .select("id,title,project_id,production_manifest").eq("id", parsed.data.episodeId)
    .eq("owner_id", user.id).maybeSingle();
  if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 });
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  const root = record(episode.production_manifest);
  const plans = Array.isArray(root.shorts) ? root.shorts : [];
  const plan = plans.find((item) => record(item).id === parsed.data.shortId);
  if (!plan) return NextResponse.json({ error: "Saved Short plan not found. Save the Shorts plan first." }, { status: 404 });

  const short = record(plan);
  const assetId = String(short.asset_id || "");
  const start = Number(short.start_seconds);
  const duration = Number(short.duration_seconds);
  if (!z.string().uuid().safeParse(assetId).success || !Number.isFinite(start) || !Number.isFinite(duration) || start < 0 || duration < 1 || duration > 180) {
    return NextResponse.json({ error: "The saved Short needs a valid source video, start time and duration between 1 and 180 seconds." }, { status: 400 });
  }
  const { data: asset, error: assetError } = await supabase.from("assets")
    .select("id,name,mime_type,drive_file_id").eq("id", assetId)
    .eq("owner_id", user.id).eq("project_id", episode.project_id).is("deleted_at", null).maybeSingle();
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset || !asset.mime_type?.startsWith("video/") || !asset.drive_file_id) {
    return NextResponse.json({ error: "The selected Short source must be an active video in this project's Media Library." }, { status: 400 });
  }
  const { data: project } = await supabase.from("projects").select("id,name")
    .eq("id", episode.project_id).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const manifest: Json = {
    schema_version: "1.0.0", task: "short_render",
    project: { id: project.id, name: project.name },
    episode: { id: episode.id, title: episode.title },
    title: String(short.title || asset.name).slice(0, 150),
    source: { asset_id: asset.id, name: asset.name, drive_file_id: asset.drive_file_id },
    start_seconds: start, duration_seconds: duration, aspect_ratio: "9:16",
  };
  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id, project_id: project.id, episode_id: episode.id,
    title: "Render Short · " + String(short.title || asset.name).slice(0, 120),
    status: "queued", progress: 0, manifest, max_attempts: 3,
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job, duration_seconds: duration, aspect_ratio: "9:16" }, { status: 201 });
}
