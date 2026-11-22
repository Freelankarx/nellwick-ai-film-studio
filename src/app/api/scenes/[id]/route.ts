import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  scene_number: z.number().int().positive().optional(),
  title: z.string().trim().max(200).optional(),
  summary: z.string().max(10000).optional(),
  location_id: z.string().uuid().nullable().optional(),
  script_excerpt: z.string().max(20000).optional(),
  continuity_notes: z.string().max(5000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid scene update." }, { status: 400 });
  if (parsed.data.location_id) {
    const { data: scene } = await supabase.from("scenes").select("episode_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
    const { data: episode } = await supabase.from("episodes").select("project_id").eq("id", scene.episode_id).eq("owner_id", user.id).maybeSingle();
    if (!episode) return NextResponse.json({ error: "Episode not found." }, { status: 404 });
    const { data: location } = await supabase.from("locations").select("id").eq("id", parsed.data.location_id).eq("project_id", episode.project_id).eq("owner_id", user.id).maybeSingle();
    if (!location) return NextResponse.json({ error: "Location must belong to this scene's project." }, { status: 400 });
  }
  const { data, error } = await supabase.from("scenes").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  return NextResponse.json({ scene: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("scenes").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
