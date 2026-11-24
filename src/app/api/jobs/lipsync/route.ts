import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

const schema = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid().nullable().optional(),
  characterId: z.string().uuid().nullable().optional(),
  portraitAssetId: z.string().uuid(),
  audioAssetId: z.string().uuid(),
});

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid talking-character request." }, { status: 400 });
  const input = parsed.data;

  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name").eq("id", input.projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let episode: { id: string; title: string } | null = null;
  if (input.episodeId) {
    const { data, error } = await supabase.from("episodes").select("id,title,project_id")
      .eq("id", input.episodeId).eq("owner_id", user.id).eq("project_id", project.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Episode does not belong to the selected project." }, { status: 404 });
    episode = data;
  }

  const { data: assets, error: assetsError } = await supabase.from("assets")
    .select("id,name,mime_type,drive_file_id,file_size")
    .in("id", [input.portraitAssetId, input.audioAssetId])
    .eq("owner_id", user.id).eq("project_id", project.id).is("deleted_at", null);
  if (assetsError) return NextResponse.json({ error: assetsError.message }, { status: 500 });
  const byId = new Map((assets || []).map((asset) => [asset.id, asset]));
  const portrait = byId.get(input.portraitAssetId);
  const audio = byId.get(input.audioAssetId);
  if (!portrait || !portrait.drive_file_id || !portrait.mime_type?.startsWith("image/")) {
    return NextResponse.json({ error: "Select an active portrait image from this project's Media Library." }, { status: 400 });
  }
  if (!audio || !audio.drive_file_id || !audio.mime_type?.startsWith("audio/")) {
    return NextResponse.json({ error: "Select an active dialogue or narration audio file from this project's Media Library." }, { status: 400 });
  }

  let character: { id: string; name: string; reference_asset_ids: string[] } | null = null;
  if (input.characterId) {
    const { data, error } = await supabase.from("characters")
      .select("id,name,reference_asset_ids")
      .eq("id", input.characterId).eq("owner_id", user.id).eq("project_id", project.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Character profile does not belong to the selected project." }, { status: 404 });
    character = data;
    if (!(character.reference_asset_ids || []).includes(portrait.id)) {
      return NextResponse.json({ error: "The selected portrait must be attached to this character's approved reference images first." }, { status: 400 });
    }
  }

  const manifest: Json = {
    schema_version: "1.0.0",
    task: "lip_sync",
    model_id: "musetalk-1.5",
    experimental: true,
    project: { id: project.id, name: project.name },
    episode: episode ? { id: episode.id, title: episode.title } : null,
    character: character ? { id: character.id, name: character.name } : null,
    portrait: { asset_id: portrait.id, name: portrait.name, mime_type: portrait.mime_type, drive_file_id: portrait.drive_file_id },
    audio: { asset_id: audio.id, name: audio.name, mime_type: audio.mime_type, drive_file_id: audio.drive_file_id },
    settings: { version: "v15", fps: 25, precision: "fp16", batch_size: 4 },
  };

  const title = "MuseTalk talking-character clip · " + (character?.name || portrait.name);
  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id, project_id: project.id, episode_id: episode?.id || null,
    title, status: "queued", progress: 0, manifest, max_attempts: 2,
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    job, model_id: "musetalk-1.5", experimental: true,
    note: "Runs in an isolated Python 3.10/CUDA 11.8 environment on the Kaggle GPU worker. It animates the mouth/face from a still portrait; it does not create body movement or guarantee identity-perfect output."
  }, { status: 201 });
}
