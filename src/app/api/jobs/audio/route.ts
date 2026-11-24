import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const voiceIds = [
  "af_heart", "af_bella", "af_sarah", "af_nicole",
  "am_michael", "am_fenrir", "am_puck",
  "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
] as const;

const schema = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid().optional().nullable(),
  segments: z.array(z.object({
    id: z.string().min(1).max(80).optional(),
    speaker: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(3000),
    voiceId: z.enum(voiceIds),
    speed: z.number().min(0.75).max(1.25).default(1),
  })).min(1).max(30),
});

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to queue voice generation." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid voice-generation request." }, { status: 400 });
  }

  const input = parsed.data;
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name").eq("id", input.projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let episode: { id: string; title: string } | null = null;
  if (input.episodeId) {
    const { data, error } = await supabase.from("episodes").select("id,title")
      .eq("id", input.episodeId).eq("project_id", project.id).eq("owner_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Episode does not belong to the selected project." }, { status: 404 });
    episode = data;
  }

  const segments = input.segments.map((segment) => ({
    ...segment, id: segment.id || crypto.randomUUID(),
    text: segment.text.trim(), speaker: segment.speaker.trim(), voice_id: segment.voiceId,
  }));
  const manifest = {
    schema_version: "1.0.0",
    task: "audio_generation",
    project: { id: project.id, name: project.name },
    episode: episode ? { id: episode.id, title: episode.title } : null,
    segments,
    settings: { model_id: "kokoro-82m", sample_rate: 24000, format: "wav" },
  };
  const title = episode
    ? "Dialogue & narration · " + episode.title
    : "Dialogue & narration · " + project.name;

  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id, project_id: project.id, episode_id: episode?.id || null,
    title, status: "queued", progress: 0, manifest, max_attempts: 3,
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    job, model_id: "kokoro-82m", segments: segments.length,
    note: "Runs locally on your Kaggle/Colab worker. No hosted voice-generation API is called.",
  }, { status: 201 });
}
