import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  project_type: z.enum(["film", "series", "advertisement", "documentary", "social", "other"]).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (error || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const { data: episodes, error: episodeError } = await supabase.from("episodes").select("*").eq("project_id", id).eq("owner_id", user.id).order("created_at", { ascending: false });
  if (episodeError) return NextResponse.json({ error: episodeError.message }, { status: 500 });
  return NextResponse.json({ project, episodes: episodes || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid project update." }, { status: 400 });
  const { data, error } = await supabase.from("projects").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("projects").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
