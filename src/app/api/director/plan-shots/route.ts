import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

const schema = z.object({ scene_id: z.string().uuid(), additional_notes: z.string().max(1500).optional().default("") });

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid scene shot-planning request." }, { status: 400 });

  const { data: scene } = await supabase
    .from("scenes")
    .select("id,episode_id,scene_number,title,summary,script_excerpt,continuity_notes")
    .eq("id", parsed.data.scene_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });

  const { data: episode } = await supabase
    .from("episodes")
    .select("id,project_id,title,aspect_ratio")
    .eq("id", scene.episode_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("id,name,aspect_ratio,settings")
    .eq("id", episode.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const [{ data: latestShot, error: shotError }, { data: characters }] = await Promise.all([
    supabase.from("shots").select("shot_number").eq("scene_id", scene.id).order("shot_number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("characters").select("name,role,canonical_description,visual_traits,wardrobe,continuity_notes").eq("project_id", project.id).eq("owner_id", user.id).limit(12),
  ]);
  if (shotError) return NextResponse.json({ error: shotError.message }, { status: 500 });

  const settings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
    ? project.settings as Record<string, Json>
    : {};
  const manifest: Json = {
    schema_version: "1.1.0",
    task: "shot_plan",
    planner_model: "qwen3-4b-story-planner",
    project: { id: project.id, name: project.name },
    episode: { id: episode.id, title: episode.title, aspect_ratio: episode.aspect_ratio || project.aspect_ratio },
    scene_id: scene.id,
    shot_number_start: (latestShot?.shot_number || 0) + 1,
    input: {
      scene_number: scene.scene_number,
      scene_title: scene.title,
      scene_summary: scene.summary,
      script_excerpt: scene.script_excerpt,
      continuity_notes: scene.continuity_notes,
      additional_notes: parsed.data.additional_notes,
      aspect_ratio: episode.aspect_ratio || project.aspect_ratio,
      visual_style: typeof settings.visual_style === "string" ? settings.visual_style : "cinematic realism",
      characters: (characters || []).map((character) => ({
        name: character.name,
        role: character.role,
        canonical_description: character.canonical_description,
        visual_traits: character.visual_traits,
        wardrobe: character.wardrobe,
        continuity_notes: character.continuity_notes,
      })),
    },
  };

  const { data: job, error } = await supabase
    .from("production_jobs")
    .insert({
      owner_id: user.id,
      project_id: project.id,
      episode_id: episode.id,
      title: `AI shot breakdown — ${scene.title || `Scene ${scene.scene_number}`}`.slice(0, 160),
      status: "queued",
      priority: 10,
      progress: 0,
      manifest,
      max_attempts: 3,
    })
    .select("id,title,status,progress,created_at,attempt_count,project_id,episode_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job, task: "shot_plan" }, { status: 201 });
}
