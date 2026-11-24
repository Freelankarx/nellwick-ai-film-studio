import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  projectId: z.string().uuid(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("character"), id: z.string().uuid() }),
    z.object({ type: z.literal("location"), id: z.string().uuid() }),
  ]),
  prompt: z.string().trim().min(20).max(4000),
  negativePrompt: z.string().max(2000).optional().default("text, letters, watermark, logo, blurry, low quality, distorted anatomy, duplicate subject, inconsistent clothing"),
  aspectRatio: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
  variants: z.number().int().min(1).max(2).default(1),
});

const MODEL_ID = "sdxl-base-1.0";

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to generate reference images." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid reference image request." }, { status: 400 });
  }

  const input = parsed.data;
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name,aspect_ratio")
    .eq("id", input.projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let targetName = "";
  if (input.target.type === "character") {
    const { data, error } = await supabase.from("characters")
      .select("id,name,project_id")
      .eq("id", input.target.id)
      .eq("owner_id", user.id)
      .eq("project_id", project.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Character not found in this project." }, { status: 404 });
    targetName = data.name;
  } else {
    const { data, error } = await supabase.from("locations")
      .select("id,name,project_id")
      .eq("id", input.target.id)
      .eq("owner_id", user.id)
      .eq("project_id", project.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Location not found in this project." }, { status: 404 });
    targetName = data.name;
  }

  const dimensions = input.aspectRatio === "16:9"
    ? { width: 1024, height: 576 }
    : input.aspectRatio === "9:16"
      ? { width: 576, height: 1024 }
      : { width: 1024, height: 1024 };

  const jobTitle = `Reference images · ${targetName}`;
  const manifest = {
    schema_version: "1.0.0",
    task: "image_generation",
    project: { id: project.id, name: project.name },
    target: { ...input.target, name: targetName },
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    settings: {
      model_id: MODEL_ID,
      width: dimensions.width,
      height: dimensions.height,
      variants: input.variants,
      num_inference_steps: 30,
      guidance_scale: 6.5,
      aspect_ratio: input.aspectRatio,
    },
  };

  const { data: job, error } = await supabase.from("production_jobs").insert({
    owner_id: user.id,
    project_id: project.id,
    episode_id: null,
    title: jobTitle,
    status: "queued",
    progress: 0,
    manifest,
    max_attempts: 3,
  }).select("id,title,status,progress,created_at,attempt_count,project_id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    job,
    model_id: MODEL_ID,
    note: "This job runs on the Kaggle/Colab notebook worker. Generated images will appear in this project's media library; select the ones you approve as references.",
  }, { status: 201 });
}
