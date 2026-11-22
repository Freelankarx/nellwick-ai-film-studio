import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { jobSchema } from "@/lib/validators";

export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to view production jobs." }, { status: 401 });
  const { data, error } = await supabase.from("production_jobs")
    .select("id,title,status,progress,created_at,attempt_count,last_error,project_id,episode_id")
    .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to queue production." }, { status: 401 });
  const parsed = jobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid job details." }, { status: 400 });

  const input = parsed.data;
  const { data: project } = await supabase.from("projects").select("id,name,aspect_ratio")
    .eq("id", input.projectId).eq("owner_id", user.id).maybeSingle();
  if (!project) return NextResponse.json({ error: "Choose a project that belongs to your account." }, { status: 404 });

  let episode: { id: string; title: string; aspect_ratio: string } | null = null;
  if (input.episodeId) {
    const { data } = await supabase.from("episodes").select("id,title,aspect_ratio")
      .eq("id", input.episodeId).eq("project_id", project.id).eq("owner_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Choose an episode inside the selected project." }, { status: 404 });
    episode = data;
  }

  const prompts = input.shotPrompts?.length ? input.shotPrompts : [input.prompt as string];
  const shots = prompts.map((prompt, index) => ({
    id: crypto.randomUUID(),
    scene_number: Math.floor(index / 6) + 1,
    shot_number: (index % 6) + 1,
    prompt,
    negative_prompt: "blurry, flicker, jitter, distorted anatomy, extra limbs, text, watermark, logo",
    duration_seconds: input.duration,
    model_id: input.modelId,
    generation_mode: "text_to_video"
  }));

  const ratio = input.aspectRatio || episode?.aspect_ratio || project.aspect_ratio;
  const manifest = {
    schema_version: "1.0.0",
    project: { id: project.id, name: project.name },
    episode: { ...(episode ? { id: episode.id } : {}), title: episode?.title || input.title, aspect_ratio: ratio },
    settings: {
      model_id: input.modelId,
      fps: 16,
      width: ratio === "9:16" ? 480 : 832,
      height: ratio === "9:16" ? 832 : 480,
      target_duration_seconds: input.duration * shots.length,
      shot_count: shots.length
    },
    shots
  };

  const { data, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id,
    project_id: project.id,
    episode_id: episode?.id || null,
    title: input.title,
    status: "queued",
    progress: 0,
    manifest,
    max_attempts: 8
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: data, shot_count: shots.length, estimated_runtime_seconds: input.duration * shots.length }, { status: 201 });
}
