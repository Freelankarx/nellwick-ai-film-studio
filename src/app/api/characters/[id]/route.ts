import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  project_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.string().max(120).optional(),
  canonical_description: z.string().max(5000).optional(),
  visual_traits: z.record(z.string(), z.string()).optional(),
  wardrobe: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  voice_profile: z.record(z.string(), z.string()).optional(),
  continuity_notes: z.string().max(4000).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update." }, { status: 400 });
  if (parsed.data.project_id) {
    const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).eq("owner_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const { data, error } = await supabase.from("characters").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Character not found." }, { status: 404 });
  return NextResponse.json({ character: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("characters").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Character not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
