import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const createSchema = z.object({
  prompt: z.string().max(4000).optional().default(""),
  negative_prompt: z.string().max(2000).optional().default("blurry, flicker, jitter, distorted anatomy, text, watermark, logo"),
  action_description: z.string().max(2000).optional().default(""),
  duration_seconds: z.number().positive().max(60).optional().default(5),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
  model_id: z.string().trim().min(1).max(120).optional().default("wan21-t2v-1.3b"),
  generation_mode: z.enum(["text_to_video", "image_to_video", "image_generation"]).optional().default("text_to_video"),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: scene } = await supabase.from("scenes").select("id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  const { data, error } = await supabase.from("shots").select("*").eq("scene_id", id).eq("owner_id", user.id).order("shot_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shots: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid shot." }, { status: 400 });
  const { data: scene } = await supabase.from("scenes").select("id,episode_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  const { data: episode } = await supabase.from("episodes").select("aspect_ratio").eq("id", scene.episode_id).eq("owner_id", user.id).maybeSingle();
  const { data: last } = await supabase.from("shots").select("shot_number").eq("scene_id", id).eq("owner_id", user.id).order("shot_number", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("shots").insert({
    ...parsed.data,
    owner_id: user.id,
    scene_id: id,
    shot_number: (last?.shot_number || 0) + 1,
    aspect_ratio: parsed.data.aspect_ratio || episode?.aspect_ratio || "16:9",
    status: "draft",
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shot: data }, { status: 201 });
}
