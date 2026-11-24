import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Database } from "@/types/database";

type SelectedShot = Pick<Database["public"]["Tables"]["shots"]["Row"], "id" | "scene_id" | "shot_number" | "prompt" | "negative_prompt" | "duration_seconds" | "aspect_ratio" | "generation_mode" | "model_id" | "status" | "action_description" | "generation_settings">;
type SelectedScene = Pick<Database["public"]["Tables"]["scenes"]["Row"], "id" | "scene_number" | "episode_id">;

const schema = z.object({
  episodeId: z.string().uuid(),
  shotIds: z.array(z.string().uuid()).min(1).max(120),
  title: z.string().trim().min(2).max(160).optional(),
});

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid shot queue request." }, { status: 400 });
  const input = parsed.data;
  const uniqueIds: string[] = [...new Set<string>(input.shotIds)];
  if (uniqueIds.length !== input.shotIds.length) return NextResponse.json({ error: "Duplicate shot IDs were supplied." }, { status: 400 });

  const { data: episode } = await supabase.from("episodes").select("id,title,project_id,aspect_ratio").eq("id", input.episodeId).eq("owner_id", user.id).maybeSingle();
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  const { data: shots, error: shotsError } = await supabase.from("shots").select("id,scene_id,shot_number,prompt,negative_prompt,duration_seconds,aspect_ratio,generation_mode,model_id,status,generation_settings,action_description").in("id", uniqueIds).eq("owner_id", user.id);
  if (shotsError) return NextResponse.json({ error: shotsError.message }, { status: 500 });
  if (!shots || shots.length !== uniqueIds.length) return NextResponse.json({ error: "One or more selected shots were not found." }, { status: 404 });
  const sceneIds = [...new Set(shots.map((shot) => shot.scene_id))];
  const { data: scenes, error: sceneError } = await supabase.from("scenes").select("id,scene_number,episode_id").in("id", sceneIds).eq("owner_id", user.id);
  if (sceneError) return NextResponse.json({ error: sceneError.message }, { status: 500 });
  if (!scenes || scenes.length !== sceneIds.length || scenes.some((scene) => scene.episode_id !== episode.id)) {
    return NextResponse.json({ error: "All selected shots must belong to the selected episode." }, { status: 400 });
  }

  const shotRows = shots as SelectedShot[];
  const sceneRows = scenes as SelectedScene[];
  const shotById = new Map<string, SelectedShot>(shotRows.map((shot) => [shot.id, shot]));
  const sceneById = new Map<string, SelectedScene>(sceneRows.map((scene) => [scene.id, scene]));
  const ordered = uniqueIds.map((id) => shotById.get(id)!);
  const invalid = ordered.find((shot) => shot.prompt.trim().length < 10 || shot.prompt.length > 4000 || !((shot.generation_mode === "text_to_video" && shot.model_id === "wan21-t2v-1.3b") || (shot.generation_mode === "image_to_video" && shot.model_id === "ltx-video-0.9.6-i2v")) || Number(shot.duration_seconds) < 2 || Number(shot.duration_seconds) > 5);
  if (invalid) return NextResponse.json({ error: `Shot ${invalid.shot_number} has an unsupported model/mode, an incomplete prompt, or an invalid duration. Use Wan text-to-video or LTX image-to-video with 2–5 second clips.` }, { status: 400 });
  const imageToVideoShots = ordered.filter((shot) => shot.generation_mode === "image_to_video");
  const sourceIds = imageToVideoShots.map((shot) => {
    const settings = shot.generation_settings && typeof shot.generation_settings === "object" && !Array.isArray(shot.generation_settings) ? shot.generation_settings as Record<string, unknown> : {};
    return typeof settings.source_asset_id === "string" ? settings.source_asset_id : "";
  });
  if (sourceIds.some((id) => !id)) return NextResponse.json({ error: "Every LTX image-to-video shot needs a selected source image from this project's Media Library." }, { status: 400 });
  let sourceAssets: Array<{id:string;drive_file_id:string|null;mime_type:string|null;name:string}> = [];
  if (sourceIds.length) {
    const { data, error } = await supabase.from("assets").select("id,drive_file_id,mime_type,name").in("id", [...new Set(sourceIds)]).eq("owner_id", user.id).eq("project_id", episode.project_id).is("deleted_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    sourceAssets = data || [];
    if (sourceAssets.length !== new Set(sourceIds).size || sourceAssets.some((asset) => !asset.drive_file_id || !asset.mime_type?.startsWith("image/"))) return NextResponse.json({ error: "A selected source image is unavailable or is not an image in this project." }, { status: 400 });
  }
  const sourceById = new Map(sourceAssets.map((asset) => [asset.id, asset]));
  if (ordered.some((shot) => shot.status === "queued" || shot.status === "processing")) return NextResponse.json({ error: "One or more shots are already queued or processing." }, { status: 409 });

  const projectId = episode.project_id;
  const { data: project } = await supabase.from("projects").select("id,name").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const manifestShots = ordered.map((shot) => ({
    id: shot.id,
    scene_number: sceneById.get(shot.scene_id)?.scene_number || 1,
    shot_number: shot.shot_number,
    prompt: shot.prompt,
    negative_prompt: shot.negative_prompt,
    action_description: shot.action_description,
    duration_seconds: Number(shot.duration_seconds),
    aspect_ratio: shot.aspect_ratio,
    generation_mode: shot.generation_mode,
    model_id: shot.model_id,\n    source_asset_id: shot.generation_mode === "image_to_video" ? (shot.generation_settings as Record<string, unknown>).source_asset_id : null,\n    source_drive_file_id: shot.generation_mode === "image_to_video" ? sourceById.get(String((shot.generation_settings as Record<string, unknown>).source_asset_id))?.drive_file_id : null,
  }));
  const ratio = episode.aspect_ratio === "9:16" ? "9:16" : "16:9";
  const manifest = {
    schema_version: "1.0.0",
    project: { id: project.id, name: project.name },
    episode: { id: episode.id, title: episode.title, aspect_ratio: ratio },
    settings: {
      model_id: "wan21-t2v-1.3b",\n      image_to_video_model_id: "ltx-video-0.9.6-i2v",
      fps: 16,
      width: ratio === "9:16" ? 480 : 832,
      height: ratio === "9:16" ? 832 : 480,
      shot_count: manifestShots.length,
      target_duration_seconds: manifestShots.reduce((sum, shot) => sum + shot.duration_seconds, 0),
    },
    shots: manifestShots,
  };
  const title = input.title || `${episode.title} · ${manifestShots.length} storyboard shots`;
  const { data: job, error: jobError } = await supabase.from("production_jobs").insert({
    owner_id: user.id,
    project_id: project.id,
    episode_id: episode.id,
    title,
    status: "queued",
    progress: 0,
    manifest,
    max_attempts: 8,
  }).select("id,title,status,progress,created_at").single();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  const { error: updateError } = await supabase.from("shots").update({ status: "queued" }).in("id", uniqueIds).eq("owner_id", user.id);
  if (updateError) return NextResponse.json({ job, warning: `Job was queued, but shot statuses could not be updated: ${updateError.message}` }, { status: 201 });
  return NextResponse.json({ job, shot_count: manifestShots.length }, { status: 201 });
}
