import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

const schema = z.object({
  project_id: z.string().uuid(),
  episode_id: z.string().uuid(),
  premise: z.string().trim().min(20).max(2500),
  genre: z.string().trim().min(2).max(80),
  tone: z.string().trim().min(2).max(160),
  audience: z.string().trim().min(2).max(200),
  visual_style: z.string().trim().min(2).max(300),
  target_duration_minutes: z.number().int().min(1).max(120),
  language: z.string().trim().min(2).max(60).default("English"),
});

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid story planning brief." },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,project_type,aspect_ratio,settings")
    .eq("id", input.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: episode } = await supabase
    .from("episodes")
    .select("id,title,aspect_ratio")
    .eq("id", input.episode_id)
    .eq("project_id", project.id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!episode) return NextResponse.json({ error: "Choose an episode inside the selected project." }, { status: 404 });

  const { data: existingCharacters, error: characterError } = await supabase
    .from("characters")
    .select("name,role,canonical_description,visual_traits,wardrobe,voice_profile,continuity_notes")
    .eq("project_id", project.id)
    .eq("owner_id", user.id)
    .limit(12);
  if (characterError) return NextResponse.json({ error: characterError.message }, { status: 500 });

  const { data: latestScene, error: sceneError } = await supabase
    .from("scenes")
    .select("scene_number")
    .eq("episode_id", episode.id)
    .order("scene_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sceneError) return NextResponse.json({ error: sceneError.message }, { status: 500 });

  const sceneNumberStart = (latestScene?.scene_number || 0) + 1;
  const manifest: Json = {
    schema_version: "1.1.0",
    task: "story_plan",
    planner_model: "qwen3-4b-story-planner",
    project: { id: project.id, name: project.name, project_type: project.project_type },
    episode: { id: episode.id, title: episode.title, aspect_ratio: episode.aspect_ratio || project.aspect_ratio },
    scene_number_start: sceneNumberStart,
    input: {
      premise: input.premise,
      genre: input.genre,
      tone: input.tone,
      audience: input.audience,
      visual_style: input.visual_style,
      target_duration_minutes: input.target_duration_minutes,
      language: input.language,
      existing_characters: existingCharacters || [],
      requested_scene_count: Math.min(18, Math.max(4, Math.ceil(input.target_duration_minutes / 2))),
    },
  };

  const { data: job, error } = await supabase
    .from("production_jobs")
    .insert({
      owner_id: user.id,
      project_id: project.id,
      episode_id: episode.id,
      title: `AI story plan — ${episode.title}`.slice(0, 160),
      status: "queued",
      priority: 12,
      progress: 0,
      manifest,
      max_attempts: 3,
    })
    .select("id,title,status,progress,created_at,attempt_count,project_id,episode_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ job, task: "story_plan" }, { status: 201 });
}
