import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = z.object({
    projectId: z.string().uuid(),
    episodeId: z.string().uuid(),
    prompt: z.string().trim().min(20).max(2500),
    productFocus: z.enum(["natural", "grooming_brush", "hair_glove", "none"]).default("natural"),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Shorts brief." }, { status: 400 });

  const input = parsed.data;
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name,project_type,aspect_ratio,settings")
    .eq("id", input.projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: episode, error: episodeError } = await supabase.from("episodes")
    .select("id,title,project_id,aspect_ratio")
    .eq("id", input.episodeId).eq("project_id", project.id).eq("owner_id", user.id).maybeSingle();
  if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 });
  if (!episode) return NextResponse.json({ error: "Choose an episode inside this project." }, { status: 404 });

  const [charactersResult, locationsResult] = await Promise.all([
    supabase.from("characters").select("name,role,canonical_description,visual_traits,wardrobe,voice_profile,continuity_notes").eq("project_id", project.id).eq("owner_id", user.id).limit(12),
    supabase.from("locations").select("name,description,continuity_notes").eq("project_id", project.id).eq("owner_id", user.id).limit(20),
  ]);
  if (charactersResult.error) return NextResponse.json({ error: charactersResult.error.message }, { status: 500 });
  if (locationsResult.error) return NextResponse.json({ error: locationsResult.error.message }, { status: 500 });

  const settings = project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
    ? project.settings as Record<string, Json>
    : {};
  const brandBible = settings.nellwick_brand_bible && typeof settings.nellwick_brand_bible === "object" && !Array.isArray(settings.nellwick_brand_bible)
    ? settings.nellwick_brand_bible as Record<string, Json>
    : {};
  const products = Array.isArray(brandBible.products) ? brandBible.products : [];

  const manifest: Json = {
    schema_version: "1.0.0",
    task: "shorts_plan",
    planner_model: "qwen3-4b-story-planner",
    project: { id: project.id, name: project.name, project_type: project.project_type },
    episode: { id: episode.id, title: episode.title, aspect_ratio: "9:16" },
    input: {
      premise: input.prompt,
      short_count: 3,
      target_duration_seconds: 45,
      aspect_ratio: "9:16",
      product_focus: input.productFocus,
      visual_style: typeof brandBible.visual_style === "string" ? brandBible.visual_style : "cinematic realism, clean vertical composition, natural lighting, controlled camera movement",
      product_placement_rule: typeof brandBible.product_placement_rule === "string" ? brandBible.product_placement_rule : "Only feature NELLWICK products when naturally relevant. The story must remain entertaining. Never invent product claims.",
      characters: charactersResult.data || [],
      locations: locationsResult.data || [],
      products,
    },
  };

  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id,
    project_id: project.id,
    episode_id: episode.id,
    title: "Plan 3 NELLWICK Shorts · " + episode.title,
    status: "queued",
    priority: 11,
    progress: 0,
    manifest,
    max_attempts: 3,
  }).select("id,title,status,progress,created_at,attempt_count,project_id,episode_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    job,
    task: "shorts_plan",
    short_count: 3,
    note: "Creates three original 9:16 short-form scripts and scene plans with the local Qwen worker. It does not itself generate the final visual or audio assets."
  }, { status: 201 });
}
