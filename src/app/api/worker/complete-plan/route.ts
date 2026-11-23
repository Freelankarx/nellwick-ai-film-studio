import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateWorker } from "@/lib/worker-auth";
import type { Json } from "@/types/database";

const storyOutputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  logline: z.string().trim().min(10).max(1000),
  synopsis: z.string().trim().min(40).max(10000),
  screenplay_markdown: z.string().trim().min(100).max(200000),
  characters: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().max(160).default(""),
    canonical_description: z.string().trim().min(20).max(2500),
    visual_traits: z.record(z.string(), z.string()).default({}),
    wardrobe: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
    voice_profile: z.record(z.string(), z.string()).default({}),
    continuity_notes: z.string().trim().max(5000).default(""),
  })).min(1).max(12),
  scenes: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(10).max(10000),
    location_name: z.string().trim().max(160).default(""),
    location_description: z.string().trim().max(2500).default(""),
    script_excerpt: z.string().trim().min(20).max(20000),
    continuity_notes: z.string().trim().max(5000).default(""),
  })).min(1).max(24),
});

const shotOutputSchema = z.object({
  shots: z.array(z.object({
    prompt: z.string().trim().min(20).max(4000),
    negative_prompt: z.string().trim().max(2000).default("blurry, flicker, jitter, distorted anatomy, text, watermark, logo"),
    action_description: z.string().trim().max(2000).default(""),
    duration_seconds: z.number().int().min(2).max(5),
    camera: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()] )).default({}),
  })).min(1).max(12),
});

const requestSchema = z.discriminatedUnion("task", [
  z.object({ job_id: z.string().uuid(), task: z.literal("story_plan"), output: storyOutputSchema, model_id: z.string().max(160) }),
  z.object({ job_id: z.string().uuid(), task: z.literal("shot_plan"), output: shotOutputSchema, model_id: z.string().max(160) }),
]);

function isRecord(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const worker = await authenticateWorker(request);
  if (!worker) return NextResponse.json({ error: "Invalid or expired worker token." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid AI planning result." }, { status: 400 });

  const admin = createAdminClient();
  const input = parsed.data;
  const { data: job, error: jobError } = await admin
    .from("production_jobs")
    .select("id,owner_id,project_id,episode_id,manifest,result,status")
    .eq("id", input.job_id)
    .eq("owner_id", worker.ownerId)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Planning job not found." }, { status: 404 });
  if (job.status !== "processing") return NextResponse.json({ error: "Planning job is no longer processing." }, { status: 409 });

  const manifest = isRecord(job.manifest as Json) ? job.manifest as Record<string, Json> : {};
  if (manifest.task !== input.task) return NextResponse.json({ error: "The result task does not match the queued job." }, { status: 400 });

  if (!job.episode_id || !job.project_id) return NextResponse.json({ error: "Planning job has no linked project and episode." }, { status: 409 });

  if (input.task === "story_plan") {
    const { data: episode, error: episodeError } = await admin
      .from("episodes")
      .select("id,project_id,production_manifest")
      .eq("id", job.episode_id)
      .eq("project_id", job.project_id)
      .eq("owner_id", worker.ownerId)
      .maybeSingle();
    if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 });
    if (!episode) return NextResponse.json({ error: "Linked episode no longer exists." }, { status: 404 });

    const start = typeof manifest.scene_number_start === "number" ? manifest.scene_number_start : 1;
    const end = start + input.output.scenes.length - 1;
    const { data: existingScenes, error: existingError } = await admin
      .from("scenes")
      .select("id,scene_number,generated_by_job_id")
      .eq("episode_id", job.episode_id)
      .gte("scene_number", start)
      .lte("scene_number", end);
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if ((existingScenes || []).some((scene) => scene.generated_by_job_id !== job.id)) {
      return NextResponse.json({ error: "Scene numbering changed while this plan was running. Retry the story plan to reserve a fresh scene range." }, { status: 409 });
    }

    const { data: existingCharacters, error: existingCharacterError } = await admin
      .from("characters")
      .select("id,name")
      .eq("project_id", job.project_id)
      .eq("owner_id", worker.ownerId);
    if (existingCharacterError) return NextResponse.json({ error: existingCharacterError.message }, { status: 500 });
    const characterIds = new Map<string, string>((existingCharacters || []).map((character) => [character.name.trim().toLocaleLowerCase(), character.id] as const));
    const savedCharacterIds: string[] = [];
    for (const character of input.output.characters) {
      const key = character.name.trim().toLocaleLowerCase();
      const existingId = characterIds.get(key);
      if (existingId) {
        savedCharacterIds.push(existingId);
        continue;
      }
      const { data: createdCharacter, error: characterError } = await admin
        .from("characters")
        .insert({
          owner_id: worker.ownerId,
          project_id: job.project_id,
          name: character.name,
          role: character.role,
          canonical_description: character.canonical_description,
          visual_traits: character.visual_traits as Json,
          wardrobe: character.wardrobe as Json,
          voice_profile: character.voice_profile as Json,
          continuity_notes: character.continuity_notes,
        })
        .select("id")
        .single();
      if (characterError || !createdCharacter) return NextResponse.json({ error: characterError?.message || "Could not save a character profile." }, { status: 500 });
      characterIds.set(key, createdCharacter.id);
      savedCharacterIds.push(createdCharacter.id);
    }


    const { data: locations, error: locationsError } = await admin
      .from("locations")
      .select("id,name")
      .eq("project_id", job.project_id)
      .eq("owner_id", worker.ownerId);
    if (locationsError) return NextResponse.json({ error: locationsError.message }, { status: 500 });
    const locationIds = new Map<string, string>((locations || []).map((location) => [location.name.trim().toLocaleLowerCase(), location.id] as const));

    const sceneRows = [];
    for (let index = 0; index < input.output.scenes.length; index += 1) {
      const scene = input.output.scenes[index];
      let locationId: string | null = null;
      const normalizedLocation = scene.location_name.trim().toLocaleLowerCase();
      if (normalizedLocation) {
        locationId = locationIds.get(normalizedLocation) || null;
        if (!locationId) {
          const { data: createdLocation, error: locationError } = await admin
            .from("locations")
            .insert({
              owner_id: worker.ownerId,
              project_id: job.project_id,
              name: scene.location_name.trim(),
              description: scene.location_description || scene.location_name,
            })
            .select("id")
            .single();
          if (locationError || !createdLocation) return NextResponse.json({ error: locationError?.message || "Could not save a story location." }, { status: 500 });
          locationId = createdLocation.id;
          locationIds.set(normalizedLocation, locationId);
        }
      }
      sceneRows.push({
        owner_id: worker.ownerId,
        episode_id: job.episode_id,
        scene_number: start + index,
        title: scene.title,
        summary: scene.summary,
        location_id: locationId,
        script_excerpt: scene.script_excerpt,
        continuity_notes: scene.continuity_notes,
        generated_by_job_id: job.id,
      });
    }

    const { data: savedScenes, error: sceneSaveError } = await admin
      .from("scenes")
      .upsert(sceneRows, { onConflict: "episode_id,scene_number" })
      .select("id,scene_number,title");
    if (sceneSaveError) return NextResponse.json({ error: sceneSaveError.message }, { status: 500 });

    const oldManifest = isRecord(episode.production_manifest as Json) ? episode.production_manifest as Record<string, Json> : {};
    const nextManifest: Record<string, Json> = {
      ...oldManifest,
      ai_story_plan: {
        job_id: job.id,
        model_id: input.model_id,
        title: input.output.title,
        logline: input.output.logline,
        generated_at: new Date().toISOString(),
      },
    };
    const storyBrief = isRecord(manifest.input as Json)
      ? manifest.input as Record<string, Json | undefined>
      : {};
    const targetMinutes = typeof storyBrief.target_duration_minutes === "number"
      ? Math.min(120, Math.max(1, Math.floor(storyBrief.target_duration_minutes)))
      : null;
    const { error: episodeUpdateError } = await admin
      .from("episodes")
      .update({
        synopsis: input.output.synopsis,
        script_markdown: input.output.screenplay_markdown,
        status: "planning",
        production_manifest: nextManifest,
        ...(targetMinutes ? { target_duration_seconds: targetMinutes * 60 } : {}),
      })
      .eq("id", job.episode_id)
      .eq("owner_id", worker.ownerId);
    if (episodeUpdateError) return NextResponse.json({ error: episodeUpdateError.message }, { status: 500 });

    const finalResult: Record<string, Json> = {
      task: "story_plan",
      model_id: input.model_id,
      title: input.output.title,
      logline: input.output.logline,
      scene_count: savedScenes?.length || 0,
      character_count: savedCharacterIds.length,
      character_ids: savedCharacterIds,
      scene_ids: (savedScenes || []).map((scene) => scene.id),
    };
    const { error: jobUpdateError } = await admin
      .from("production_jobs")
      .update({ status: "completed", progress: 100, result: finalResult, completed_at: new Date().toISOString(), lease_expires_at: null, last_error: null })
      .eq("id", job.id)
      .eq("owner_id", worker.ownerId)
      .eq("status", "processing");
    if (jobUpdateError) return NextResponse.json({ error: jobUpdateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, task: input.task, character_count: savedCharacterIds.length, scene_count: savedScenes?.length || 0, scenes: savedScenes || [] });
  }

  const sceneId = typeof manifest.scene_id === "string" ? manifest.scene_id : "";
  if (!sceneId) return NextResponse.json({ error: "Shot-planning job has no scene ID." }, { status: 409 });
  const { data: scene, error: sceneError } = await admin
    .from("scenes")
    .select("id,episode_id")
    .eq("id", sceneId)
    .eq("episode_id", job.episode_id)
    .eq("owner_id", worker.ownerId)
    .maybeSingle();
  if (sceneError) return NextResponse.json({ error: sceneError.message }, { status: 500 });
  if (!scene) return NextResponse.json({ error: "Linked scene no longer exists." }, { status: 404 });

  const start = typeof manifest.shot_number_start === "number" ? manifest.shot_number_start : 1;
  const end = start + input.output.shots.length - 1;
  const { data: existingShots, error: existingShotError } = await admin
    .from("shots")
    .select("id,shot_number,generated_by_job_id")
    .eq("scene_id", scene.id)
    .gte("shot_number", start)
    .lte("shot_number", end);
  if (existingShotError) return NextResponse.json({ error: existingShotError.message }, { status: 500 });
  if ((existingShots || []).some((shot) => shot.generated_by_job_id !== job.id)) {
    return NextResponse.json({ error: "Shot numbering changed while this plan was running. Retry the shot plan to reserve a fresh range." }, { status: 409 });
  }

  const episodeManifest = isRecord(manifest.episode as Json)
    ? manifest.episode as Record<string, Json | undefined>
    : {};
  const episodeAspectRatio = typeof episodeManifest.aspect_ratio === "string"
    ? episodeManifest.aspect_ratio
    : "16:9";
  const shotRows = input.output.shots.map((shot, index) => ({
    owner_id: worker.ownerId,
    scene_id: scene.id,
    shot_number: start + index,
    prompt: shot.prompt,
    negative_prompt: shot.negative_prompt,
    camera: shot.camera as Json,
    action_description: shot.action_description,
    duration_seconds: shot.duration_seconds,
    aspect_ratio: episodeAspectRatio,
    generation_mode: "text_to_video",
    model_id: "wan21-t2v-1.3b",
    generation_settings: { fps: 16, width: episodeAspectRatio === "9:16" ? 480 : 832, height: episodeAspectRatio === "9:16" ? 832 : 480 },
    status: "draft",
    generated_by_job_id: job.id,
  }));
  const { data: savedShots, error: shotSaveError } = await admin
    .from("shots")
    .upsert(shotRows, { onConflict: "scene_id,shot_number" })
    .select("id,shot_number,prompt,status,duration_seconds,model_id");
  if (shotSaveError) return NextResponse.json({ error: shotSaveError.message }, { status: 500 });

  const finalResult: Record<string, Json> = {
    task: "shot_plan",
    model_id: input.model_id,
    scene_id: scene.id,
    shot_count: savedShots?.length || 0,
    shot_ids: (savedShots || []).map((shot) => shot.id),
  };
  const { error: jobUpdateError } = await admin
    .from("production_jobs")
    .update({ status: "completed", progress: 100, result: finalResult, completed_at: new Date().toISOString(), lease_expires_at: null, last_error: null })
    .eq("id", job.id)
    .eq("owner_id", worker.ownerId)
    .eq("status", "processing");
  if (jobUpdateError) return NextResponse.json({ error: jobUpdateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, task: input.task, shot_count: savedShots?.length || 0, shots: savedShots || [] });
}
