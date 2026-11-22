import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const createSchema = z.object({
  episode_id: z.string().uuid(),
  scene_number: z.number().int().positive().optional(),
  title: z.string().trim().max(200).optional().default(""),
  summary: z.string().max(10000).optional().default(""),
  location_id: z.string().uuid().nullable().optional(),
  script_excerpt: z.string().max(20000).optional().default(""),
  continuity_notes: z.string().max(5000).optional().default(""),
});

export async function GET(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const episodeId = new URL(request.url).searchParams.get("episodeId");
  if (!episodeId) return NextResponse.json({ error: "episodeId is required." }, { status: 400 });
  const { data: episode } = await supabase.from("episodes").select("id").eq("id", episodeId).eq("owner_id", user.id).maybeSingle();
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  const { data, error } = await supabase.from("scenes").select("*").eq("episode_id", episodeId).eq("owner_id", user.id).order("scene_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scenes: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid scene." }, { status: 400 });
  const input = parsed.data;
  const { data: episode } = await supabase.from("episodes").select("id,project_id").eq("id", input.episode_id).eq("owner_id", user.id).maybeSingle();
  if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  if (input.location_id) {
    const { data: location } = await supabase.from("locations").select("id").eq("id", input.location_id).eq("project_id", episode.project_id).eq("owner_id", user.id).maybeSingle();
    if (!location) return NextResponse.json({ error: "Location must belong to this episode's project." }, { status: 400 });
  }
  let sceneNumber = input.scene_number;
  if (!sceneNumber) {
    const { data: last } = await supabase.from("scenes").select("scene_number").eq("episode_id", input.episode_id).eq("owner_id", user.id).order("scene_number", { ascending: false }).limit(1).maybeSingle();
    sceneNumber = (last?.scene_number || 0) + 1;
  }
  const { data, error } = await supabase.from("scenes").insert({ ...input, scene_number: sceneNumber, owner_id: user.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scene: data }, { status: 201 });
}
