import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const patchSchema = z.object({
  project_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  continuity_notes: z.string().max(4000).optional(),
  visual_reference_ids: z.array(z.string().uuid()).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

async function validateReferenceAssets(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  ownerId: string,
  projectId: string,
  assetIds: string[],
) {
  const ids = [...new Set(assetIds)];
  if (ids.length !== assetIds.length) return "Reference images contain duplicate selections.";
  if (!ids.length) return null;
  const { data, error } = await supabase.from("assets")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .like("mime_type", "image/%")
    .in("id", ids);
  if (error) return error.message;
  return (data || []).length === ids.length ? null : "Every reference must be an active image in this project.";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update." }, { status: 400 });

  const { data: existing, error: existingError } = await supabase.from("locations")
    .select("id,project_id").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const targetProjectId = parsed.data.project_id || existing.project_id;
  if (parsed.data.project_id) {
    const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).eq("owner_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (parsed.data.visual_reference_ids) {
    const referenceError = await validateReferenceAssets(supabase, user.id, targetProjectId, parsed.data.visual_reference_ids);
    if (referenceError) return NextResponse.json({ error: referenceError }, { status: 400 });
  }

  const { data, error } = await supabase.from("locations").update(parsed.data).eq("id", id).eq("owner_id", user.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  return NextResponse.json({ location: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await supabase.from("locations").delete().eq("id", id).eq("owner_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
