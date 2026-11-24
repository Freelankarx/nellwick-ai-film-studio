import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { Json } from "@/types/database";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function splitIntoShots(seconds: number): number[] {
  const total = Math.max(3, Math.min(55, Math.round(seconds)));
  const count = Math.ceil(total / 5);
  const base = Math.floor(total / count);
  let remainder = total % count;
  return Array.from({ length: count }, () => base + (remainder-- > 0 ? 1 : 0));
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = z.object({
    episodeId: z.string().uuid(),
    shortId: z.string().min(1).max(100),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid Short promotion request." }, { status: 400 });

  const { data: sourceEpisode, error: sourceError } = await supabase.from("episodes")
    .select("id,title,project_id,production_manifest")
    .eq("id", parsed.data.episodeId).eq("owner_id", user.id).maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!sourceEpisode) return NextResponse.json({ error: "Source episode not found." }, { status: 404 });

  const sourceManifest = record(sourceEpisode.production_manifest);
  const blueprints = Array.isArray(sourceManifest.short_blueprints) ? sourceManifest.short_blueprints : [];
  const blueprintIndex = blueprints.findIndex((item) => record(item).id === parsed.data.shortId);
  if (blueprintIndex < 0) return NextResponse.json({ error: "Saved Shorts blueprint not found. Generate the three Shorts first." }, { status: 404 });

  const blueprint = record(blueprints[blueprintIndex]);
  if (typeof blueprint.promoted_episode_id === "string") {
    return NextResponse.json({
      error: "This Short already has a storyboard episode.",
      episode_id: blueprint.promoted_episode_id,
      already_promoted: true,
    }, { status: 409 });
  }

  const sceneSchema = z.object({
    scene_number: z.number().int().min(1).max(7),
    duration_seconds: z.number().int().min(3).max(15),
    visual_description: z.string().trim().min(10).max(1800),
    shot_prompt: z.string().trim().min(20).max(4000),
    camera: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    dialogue: z.array(z.object({ speaker: z.string().max(80), text: z.string().max(600) })).max(5).default([]),
    voiceover: z.string().max(1000).default(""),
    sound_design: z.string().max(1000).default(""),
  });
  const validated = z.object({
    title: z.string().trim().min(3).max(160),
    hook: z.string().trim().min(8).max(500),
    concept: z.string().trim().min(15).max(1500),
    duration_seconds: z.number().int().min(35).max(55),
    script_markdown: z.string().trim().min(60).max(12000),
    location_name: z.string().max(160).optional().default(""),
    scenes: z.array(sceneSchema).min(4).max(7),
  }).safeParse(blueprint);
  if (!validated.success) return NextResponse.json({ error: "The saved Short blueprint is incomplete and cannot be promoted." }, { status: 400 });

  const { data: locations, error: locationsError } = await supabase.from("locations")
    .select("id,name").eq("project_id", sourceEpisode.project_id).eq("owner_id", user.id);
  if (locationsError) return NextResponse.json({ error: locationsError.message }, { status: 500 });
  const location = (locations || []).find((item) => item.name.trim().toLowerCase() === validated.data.location_name.trim().toLowerCase());

  const plan = validated.data;
  const totalScenesDuration = plan.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  if (totalScenesDuration < 20 || totalScenesDuration > 90) {
    return NextResponse.json({ error: "The scene plan duration is outside the supported range." }, { status: 400 });
  }

  const { data: newEpisode, error: createError } = await supabase.from("episodes").insert({
    owner_id: user.id,
    project_id: sourceEpisode.project_id,
    title: plan.title,
    synopsis: plan.concept,
    script_markdown: plan.script_markdown,
    target_duration_seconds: plan.duration_seconds,
    aspect_ratio: "9:16",
    status: "planning",
    production_manifest: {
      origin: "short_blueprint",
      source_episode_id: sourceEpisode.id,
      source_blueprint_id: parsed.data.shortId,
      short_hook: plan.hook,
      short_cta: blueprint.cta ?? "",
      short_caption: blueprint.caption ?? "",
      short_thumbnail_text: blueprint.thumbnail_text ?? "",
      short_product_used: blueprint.product_used ?? null,
      aspect_ratio: "9:16",
    },
  }).select("id,title,project_id,aspect_ratio,status").single();

  if (createError || !newEpisode) {
    return NextResponse.json({ error: createError?.message || "Could not create the 9:16 Short episode." }, { status: 500 });
  }

  const sceneRows = plan.scenes.map((scene, index) => ({
    owner_id: user.id,
    episode_id: newEpisode.id,
    scene_number: index + 1,
    title: "Short scene " + (index + 1),
    summary: scene.visual_description,
    location_id: location?.id || null,
    script_excerpt: [
      ...scene.dialogue.map((line) => line.speaker + ": " + line.text),
      scene.voiceover ? "VOICEOVER: " + scene.voiceover : "",
    ].filter(Boolean).join("\n"),
    continuity_notes: scene.sound_design,
  }));

  const { data: createdScenes, error: scenesError } = await supabase.from("scenes")
    .insert(sceneRows).select("id,scene_number");
  if (scenesError || !createdScenes || createdScenes.length !== sceneRows.length) {
    await supabase.from("episodes").delete().eq("id", newEpisode.id).eq("owner_id", user.id);
    return NextResponse.json({ error: scenesError?.message || "Could not create all storyboard scenes." }, { status: 500 });
  }

  const sceneIds = new Map(createdScenes.map((scene) => [scene.scene_number, scene.id]));
  const shotRows: Record<string, unknown>[] = [];
  for (const scene of plan.scenes) {
    const sceneId = sceneIds.get(scene.scene_number);
    if (!sceneId) continue;
    const segments = splitIntoShots(scene.duration_seconds);
    for (let index = 0; index < segments.length; index += 1) {
      const segmentDuration = segments[index];
      const continuation = segments.length > 1
        ? " This is shot segment " + (index + 1) + " of " + segments.length + " within the same scene. Preserve the same character appearance, wardrobe, screen direction and environment."
        : "";
      shotRows.push({
        owner_id: user.id,
        scene_id: sceneId,
        shot_number: index + 1,
        prompt: scene.shot_prompt + continuation,
        negative_prompt: "blurry, flicker, jitter, changing face, inconsistent wardrobe, distorted anatomy, text, watermark, logo",
        camera: scene.camera as Json,
        action_description: scene.visual_description,
        duration_seconds: segmentDuration,
        aspect_ratio: "9:16",
        generation_mode: "text_to_video",
        model_id: "wan21-t2v-1.3b",
        generation_settings: {
          source_blueprint_id: parsed.data.shortId,
          source_scene_number: scene.scene_number,
          shot_segment: index + 1,
          shot_segment_count: segments.length,
        },
        status: "draft",
      });
    }
  }

  const { data: createdShots, error: shotsError } = await supabase.from("shots")
    .insert(shotRows).select("id");
  if (shotsError || !createdShots || createdShots.length !== shotRows.length) {
    await supabase.from("episodes").delete().eq("id", newEpisode.id).eq("owner_id", user.id);
    return NextResponse.json({ error: shotsError?.message || "Could not create the storyboard shots." }, { status: 500 });
  }

  const updatedBlueprints = [...blueprints];
  updatedBlueprints[blueprintIndex] = {
    ...blueprint,
    promoted_episode_id: newEpisode.id,
    promoted_at: new Date().toISOString(),
    storyboard_shot_count: createdShots.length,
  };
  const { error: manifestError } = await supabase.from("episodes").update({
    production_manifest: { ...sourceManifest, short_blueprints: updatedBlueprints as unknown as Json },
  }).eq("id", sourceEpisode.id).eq("owner_id", user.id);

  if (manifestError) {
    return NextResponse.json({
      episode: newEpisode,
      scene_count: createdScenes.length,
      shot_count: createdShots.length,
      warning: "The storyboard was created, but the source blueprint could not be marked as promoted: " + manifestError.message,
    }, { status: 201 });
  }

  return NextResponse.json({
    episode: newEpisode,
    scene_count: createdScenes.length,
    shot_count: createdShots.length,
    aspect_ratio: "9:16",
    model_id: "wan21-t2v-1.3b",
  }, { status: 201 });
}
