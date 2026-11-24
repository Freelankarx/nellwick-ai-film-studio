import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

const clipSchema = z.object({
  id: z.string().min(1).max(100),
  asset_id: z.string().uuid(),
  start_seconds: z.number().min(0).max(21600),
  duration_seconds: z.number().min(0.25).max(1800),
  source_start_seconds: z.number().min(0).max(21600).optional().default(0),
  motion: z.enum(["slow_zoom", "static"]).optional().default("slow_zoom"),
  order: z.number().int().min(0).max(1000).optional().default(0),
});
const audioSchema = z.object({
  id: z.string().min(1).max(100),
  asset_id: z.string().uuid(),
  kind: z.enum(["dialogue", "narration", "music", "sfx"]),
  start_seconds: z.number().min(0).max(21600).default(0),
  source_start_seconds: z.number().min(0).max(21600).default(0),
  duration_seconds: z.number().min(0.1).max(21600).optional(),
  volume: z.number().min(0).max(2).default(1),
  loop: z.boolean().default(false),
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = z.object({
    episodeId: z.string().uuid(),
    subtitleAssetId: z.string().uuid().nullable().optional(),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid episode render request." }, { status: 400 });

  const { data: episode, error: episodeError } = await supabase.from("episodes")
    .select("id,title,project_id,aspect_ratio,production_manifest")
    .eq("id", parsed.data.episodeId).eq("owner_id", user.id).maybeSingle();
  if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 });
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name").eq("id", episode.project_id).eq("owner_id", user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const root = record(episode.production_manifest);
  const editor = record(root.editor);
  const parsedClips = z.array(clipSchema).min(1).max(160).safeParse(editor.clips);
  if (!parsedClips.success) return NextResponse.json({ error: "Build and save at least one valid video/image clip in the Film Editor before rendering." }, { status: 400 });
  const parsedAudio = z.array(audioSchema).min(1).max(32).safeParse(editor.audio_tracks);
  if (!parsedAudio.success) return NextResponse.json({ error: "Add at least one dialogue, narration, music or sound-effects track before rendering. NELLWICK will not export a silent episode." }, { status: 400 });

  const subtitleAssetId = parsed.data.subtitleAssetId !== undefined ? parsed.data.subtitleAssetId : (typeof editor.subtitle_asset_id === "string" ? editor.subtitle_asset_id : null);
  const assetIds = [...new Set([
    ...parsedClips.data.map((item) => item.asset_id),
    ...parsedAudio.data.map((item) => item.asset_id),
    ...(subtitleAssetId ? [subtitleAssetId] : []),
  ])];
  const { data: assets, error: assetError } = await supabase.from("assets")
    .select("id,name,mime_type,drive_file_id,file_size")
    .in("id", assetIds).eq("owner_id", user.id).eq("project_id", project.id).is("deleted_at", null);
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  const byId = new Map((assets || []).map((asset) => [asset.id, asset]));
  if (byId.size !== assetIds.length || (assets || []).some((asset) => !asset.drive_file_id)) {
    return NextResponse.json({ error: "One or more timeline assets are missing from this project or have no Google Drive file." }, { status: 400 });
  }

  const invalidClip = parsedClips.data.find((clip) => {
    const asset = byId.get(clip.asset_id);
    return !asset || (!asset.mime_type?.startsWith("video/") && !asset.mime_type?.startsWith("image/"));
  });
  if (invalidClip) return NextResponse.json({ error: "Every picture timeline item must be a video or image asset in this project." }, { status: 400 });
  const invalidAudio = parsedAudio.data.find((track) => !byId.get(track.asset_id)?.mime_type?.startsWith("audio/"));
  if (invalidAudio) return NextResponse.json({ error: "Every audio timeline item must be an audio asset in this project." }, { status: 400 });
  const clips = parsedClips.data.map((clip) => {
    const asset = byId.get(clip.asset_id)!;
    return { ...clip, name: asset.name, mime_type: asset.mime_type, drive_file_id: asset.drive_file_id };
  });
  const audioTracks = parsedAudio.data.map((track) => {
    const asset = byId.get(track.asset_id)!;
    return { ...track, name: asset.name, mime_type: asset.mime_type, drive_file_id: asset.drive_file_id };
  });
  const sortedClips = [...clips].sort((left, right) => left.start_seconds - right.start_seconds);
  let cursor = 0;
  for (const clip of sortedClips) {
    if (clip.start_seconds < cursor - 0.05) return NextResponse.json({ error: "Picture clips cannot overlap in this renderer yet. Move the clips so their start positions follow the previous clip." }, { status: 400 });
    cursor = clip.start_seconds + clip.duration_seconds;
  }
  let subtitle: Record<string, unknown> | null = null;
  if (subtitleAssetId) {
    const asset = byId.get(subtitleAssetId)!;
    if (!/\.srt$/i.test(asset.name) && asset.mime_type !== "application/x-subrip" && !asset.mime_type?.startsWith("text/")) {
      return NextResponse.json({ error: "Subtitle asset must be an SRT or text file." }, { status: 400 });
    }
    subtitle = { id: asset.id, name: asset.name, drive_file_id: asset.drive_file_id };
  }

  const totalDuration = clips.reduce((end, clip) => Math.max(end, clip.start_seconds + clip.duration_seconds), 0);
  const manifest: Json = {
    schema_version: "1.0.0",
    task: "episode_render",
    project: { id: project.id, name: project.name },
    episode: { id: episode.id, title: episode.title },
    settings: { aspect_ratio: episode.aspect_ratio || "16:9", fps: 24, width: 1280, height: 720 },
    clips: clips as unknown as Json,
    audio_tracks: audioTracks as unknown as Json,
    subtitle: subtitle as unknown as Json,
    total_duration_seconds: totalDuration,
  };

  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id, project_id: project.id, episode_id: episode.id,
    title: "Render episode master · " + episode.title,
    status: "queued", progress: 0, manifest, max_attempts: 3,
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job, clip_count: clips.length, audio_track_count: audioTracks.length, total_duration_seconds: totalDuration }, { status: 201 });
}
